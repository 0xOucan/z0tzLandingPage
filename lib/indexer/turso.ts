/**
 * Turso (libSQL) client for the Z0tz Protocol history indexer.
 *
 * Stores public on-chain events emitted by the Z0tz contracts so the GUI
 * can reconstruct user history with one fast database query instead of a
 * 10-minute eth_getLogs scan.
 *
 * Privacy posture: every row here is data that's already public on-chain.
 * The `smart_accounts` table maps (ownerX, ownerY) → smart account address
 * — that mapping is emitted by AccountFactory.AccountCreated, so we're
 * just caching the index. No private keys, no off-chain user metadata.
 *
 * Auth: the /api/history endpoint is currently OPEN (testnet posture).
 * Production should add either an API key or a passkey-signature challenge.
 */
import { createClient, type Client } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

let _client: Client | null = null;
let _schemaPromise: Promise<void> | null = null;

export function isEnabled(): boolean {
  return !!(url && authToken);
}

export function client(): Client {
  if (!isEnabled()) {
    throw new Error("Turso not configured (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)");
  }
  if (!_client) {
    _client = createClient({ url: url!, authToken: authToken! });
  }
  return _client;
}

/**
 * Idempotent schema bootstrap. Cached as a singleton promise so concurrent
 * callers in the same Vercel function instance share one round-trip.
 *
 * All event tables use (chain_id, tx_hash, log_index) as primary key — that
 * tuple uniquely identifies any on-chain log. INSERT OR IGNORE on conflict
 * makes re-indexing safe.
 */
export async function ensureSchema(): Promise<void> {
  if (!isEnabled()) return;
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    const c = client();
    await c.batch(
      [
        // ─── Per-source scan progress ─────────────────────────────────
        `CREATE TABLE IF NOT EXISTS scan_state (
          chain_id INTEGER NOT NULL,
          contract_address TEXT NOT NULL,
          event_type TEXT NOT NULL,
          last_block_scanned INTEGER NOT NULL,
          last_scanned_at INTEGER NOT NULL,
          PRIMARY KEY (chain_id, contract_address, event_type)
        )`,

        // ─── Smart account creations (the (ownerX, ownerY) → address map) ─
        `CREATE TABLE IF NOT EXISTS smart_accounts (
          chain_id INTEGER NOT NULL,
          account_address TEXT NOT NULL,
          owner_x TEXT NOT NULL,
          owner_y TEXT NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          PRIMARY KEY (chain_id, account_address)
        )`,

        // ─── EntryPoint UserOperationEvents ─────────────────────────────
        `CREATE TABLE IF NOT EXISTS entrypoint_userops (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          user_op_hash TEXT NOT NULL,
          sender TEXT NOT NULL,
          paymaster TEXT,
          nonce TEXT NOT NULL,
          success INTEGER NOT NULL,
          actual_gas_cost TEXT NOT NULL,
          actual_gas_used TEXT NOT NULL,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── Sweeper.PrivateSweep ───────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS sweep_events (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          stealth_address TEXT NOT NULL,
          wrapped_token_or_vault TEXT NOT NULL,
          shielded_amount TEXT NOT NULL,
          fee TEXT NOT NULL,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── Ledger events (unified — event_name discriminates the type) ─
        // event_name in: 'Registered' | 'CreditedFromVault' | 'Spent' | 'Rotated'
        // ledger_id always populated. new_ledger_id only for Spent/Rotated.
        // pubkey_hash/viewer only for Registered. net_amount only for Credited.
        // action only for Spent (uint8: 0=Cashout, 1=Internal).
        `CREATE TABLE IF NOT EXISTS ledger_events (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          event_name TEXT NOT NULL,
          ledger_id TEXT NOT NULL,
          new_ledger_id TEXT,
          pubkey_hash TEXT,
          viewer TEXT,
          net_amount TEXT,
          action INTEGER,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── Vault.TransferredOut ───────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS vault_transferred_out (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          to_address TEXT NOT NULL,
          enc_amount TEXT NOT NULL,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── Indexes for fast user-facing queries ──────────────────────
        `CREATE INDEX IF NOT EXISTS ix_smart_accounts_owner
          ON smart_accounts (owner_x, owner_y)`,
        `CREATE INDEX IF NOT EXISTS ix_entrypoint_sender
          ON entrypoint_userops (chain_id, sender, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_sweep_stealth
          ON sweep_events (chain_id, stealth_address, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_ledger_ledger_id
          ON ledger_events (chain_id, ledger_id, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_ledger_new_ledger_id
          ON ledger_events (chain_id, new_ledger_id, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_vault_to
          ON vault_transferred_out (chain_id, to_address, block_number)`,
      ],
      "write"
    );
  })();
  try {
    await _schemaPromise;
  } catch (err) {
    _schemaPromise = null; // allow retry on next call
    throw err;
  }
}

// ─── Scan-state helpers ───────────────────────────────────────────────

export async function getLastScanBlock(
  chainId: number,
  contractAddress: string,
  eventType: string
): Promise<number | null> {
  await ensureSchema();
  const res = await client().execute({
    sql: `SELECT last_block_scanned FROM scan_state
          WHERE chain_id = ? AND contract_address = ? AND event_type = ?`,
    args: [chainId, contractAddress.toLowerCase(), eventType],
  });
  const row = res.rows[0];
  return row ? Number(row.last_block_scanned) : null;
}

export async function setScanState(
  chainId: number,
  contractAddress: string,
  eventType: string,
  lastBlock: number
): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT INTO scan_state (chain_id, contract_address, event_type, last_block_scanned, last_scanned_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(chain_id, contract_address, event_type) DO UPDATE SET
            last_block_scanned = excluded.last_block_scanned,
            last_scanned_at    = excluded.last_scanned_at`,
    args: [chainId, contractAddress.toLowerCase(), eventType, lastBlock, Date.now()],
  });
}
