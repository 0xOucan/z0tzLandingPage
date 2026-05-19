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

        // ─── USDC.Transfer (stealth-scoped only) ────────────────────────
        // Populated by the per-stealth followup scanner, NOT by a global
        // topic0 scan — USDC volume is too high to index chain-wide. Each
        // row is a Transfer where `from` or `to` matched a known Z0tz
        // address (ephemeral cashout stealth or deployed smart account).
        `CREATE TABLE IF NOT EXISTS usdc_transfers (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          token_address TEXT NOT NULL,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── CCTP.DepositForBurn (stealth-scoped only) ──────────────────
        // Same pattern as usdc_transfers — the depositor must be a known
        // Z0tz address (ephemeral cashout stealth) before we ingest the
        // row. Required for cross-chain bridge stitching in the GUI.
        `CREATE TABLE IF NOT EXISTS cctp_burns (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          log_index INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          block_timestamp INTEGER NOT NULL,
          token_messenger TEXT NOT NULL,
          burn_token TEXT NOT NULL,
          amount TEXT NOT NULL,
          depositor TEXT NOT NULL,
          mint_recipient TEXT NOT NULL,
          destination_domain INTEGER NOT NULL,
          PRIMARY KEY (chain_id, tx_hash, log_index)
        )`,

        // ─── Stealth-followup scan state ───────────────────────────────
        // One row per (chain, watched_address, event_type). Lets the
        // followup scanner advance per-stealth cursors independently and
        // skip stealths it has already fully scanned. event_type is
        // 'usdc_transfer' or 'cctp_burn'.
        `CREATE TABLE IF NOT EXISTS stealth_followup_state (
          chain_id INTEGER NOT NULL,
          watched_address TEXT NOT NULL,
          event_type TEXT NOT NULL,
          last_block_scanned INTEGER NOT NULL,
          last_scanned_at INTEGER NOT NULL,
          PRIMARY KEY (chain_id, watched_address, event_type)
        )`,

        // ─── Relayer per-op costs (anonymous audit log) ─────────────────
        // Every chain-writing relayer op records its gas cost so the
        // protocol can measure operating expenses and tune fees. The
        // log is INTENTIONALLY anonymous: no user identifier is stored.
        //
        // Privacy posture: linking a user identifier (keccak(ownerX,
        // ownerY) or smart-account address) to plaintext USDC spend
        // would recreate exactly the financial-profile leak that the
        // encrypted ledger protects against. Instead, we recover cost
        // per-op at fee-quote time — the protocol still profits, but
        // no row in this DB binds a user identity to their spend
        // history.
        `CREATE TABLE IF NOT EXISTS relayer_op_costs (
          chain_id INTEGER NOT NULL,
          tx_hash TEXT NOT NULL,
          op_kind TEXT NOT NULL,
          gas_used INTEGER NOT NULL,
          effective_gas_price TEXT NOT NULL,
          eth_spent TEXT NOT NULL,
          eth_usd_at_record TEXT NOT NULL,
          usdc_cost_micros INTEGER NOT NULL,
          status INTEGER NOT NULL,
          recorded_at INTEGER NOT NULL,
          PRIMARY KEY (chain_id, tx_hash)
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
        `CREATE INDEX IF NOT EXISTS ix_usdc_from
          ON usdc_transfers (chain_id, from_address, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_usdc_to
          ON usdc_transfers (chain_id, to_address, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_cctp_depositor
          ON cctp_burns (chain_id, depositor, block_number)`,
        `CREATE INDEX IF NOT EXISTS ix_cctp_mint_recipient
          ON cctp_burns (chain_id, mint_recipient, block_number)`,
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

// ─── Stealth-followup state helpers ────────────────────────────────────

/**
 * Get the per-(chain, address, event-type) scan cursor for the followup
 * scanner. Returns null if the address hasn't been scanned yet — caller
 * should fall back to the address's first-seen block.
 */
/**
 * Cursor event types used by the followup scanner. Split into "from" and
 * "to" directions for usdc_transfer so each direction's progress can be
 * tracked independently — one direction might hit the function deadline
 * mid-scan while the other still has budget to advance.
 *
 * usdc_transfer (legacy, kept for backward compat — drained then unused)
 *   replaced by usdc_transfer_from + usdc_transfer_to.
 */
export type FollowupEventType =
  | "usdc_transfer"        // legacy (from-only)
  | "usdc_transfer_from"   // topic1 = stealth (outgoing)
  | "usdc_transfer_to"     // topic2 = stealth (incoming)
  | "cctp_burn";           // topic2 = stealth (depositor)

export async function getFollowupCursor(
  chainId: number,
  watchedAddress: string,
  eventType: FollowupEventType
): Promise<number | null> {
  await ensureSchema();
  const res = await client().execute({
    sql: `SELECT last_block_scanned FROM stealth_followup_state
          WHERE chain_id = ? AND watched_address = ? AND event_type = ?`,
    args: [chainId, watchedAddress.toLowerCase(), eventType],
  });
  const row = res.rows[0];
  return row ? Number(row.last_block_scanned) : null;
}

export async function setFollowupCursor(
  chainId: number,
  watchedAddress: string,
  eventType: FollowupEventType,
  lastBlock: number
): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT INTO stealth_followup_state
            (chain_id, watched_address, event_type, last_block_scanned, last_scanned_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(chain_id, watched_address, event_type) DO UPDATE SET
            last_block_scanned = excluded.last_block_scanned,
            last_scanned_at    = excluded.last_scanned_at`,
    args: [chainId, watchedAddress.toLowerCase(), eventType, lastBlock, Date.now()],
  });
}

/**
 * Build the per-chain watchlist of Z0tz-related addresses for the followup
 * scanner. Pulls from vault_transferred_out.to (ephemeral cashout stealths
 * created by our own ledger operations) and smart_accounts.account_address
 * (deployed user wallets). Both sets are derivable from data we already
 * indexed in Tier 1, so the watchlist needs no external input.
 *
 * Returns rows of (address, firstSeenBlock) so the followup scanner can
 * scope the Etherscan call to "stealth was alive only after this block".
 */
/**
 * CCTP V2 domain ↔ chainId map. Burns on SRC chain encode the DST chain
 * via destination_domain — so to find mint recipients that landed on a
 * given chain, we filter burns by domain corresponding to that chain.
 */
const CHAIN_TO_CCTP_DOMAIN: Record<number, number> = {
  11155111: 0, // eth-sepolia
  421614: 3,   // arb-sepolia
  84532: 6,    // base-sepolia
};

// ─── Cost-tracking helpers (anonymous audit log) ──────────────────────

export interface OpCostRow {
  chainId: number;
  txHash: string;
  opKind: string;
  gasUsed: number;
  effectiveGasPrice: string;
  ethSpent: string;
  ethUsdAtRecord: string;
  usdcCostMicros: number;
  status: number;
}

/**
 * Persist a single relayer op's cost. Idempotent on (chain_id, tx_hash).
 * NO user identity is stored — the row exists purely so the protocol
 * can audit operating costs and tune fees, with zero linkage from
 * USDC spend to a specific user.
 */
export async function recordOpCost(row: OpCostRow): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT OR IGNORE INTO relayer_op_costs
            (chain_id, tx_hash, op_kind, gas_used,
             effective_gas_price, eth_spent, eth_usd_at_record,
             usdc_cost_micros, status, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      row.chainId,
      row.txHash.toLowerCase(),
      row.opKind,
      row.gasUsed,
      row.effectiveGasPrice,
      row.ethSpent,
      row.ethUsdAtRecord,
      row.usdcCostMicros,
      row.status,
      Date.now(),
    ],
  });
}

/**
 * Rolling median USDC cost for an op kind on a chain, used by the
 * quote-fee endpoint to set the per-op overhead. Looks at the last N
 * successful rows. Returns 0 if not enough data — the caller should
 * fall back to a config default.
 */
export async function getRecentOpCostMedian(
  chainId: number,
  opKind: string,
  lookbackN: number = 20,
): Promise<number> {
  await ensureSchema();
  const res = await client().execute({
    sql: `SELECT usdc_cost_micros FROM relayer_op_costs
          WHERE chain_id = ? AND op_kind = ? AND status = 1
          ORDER BY recorded_at DESC LIMIT ?`,
    args: [chainId, opKind, lookbackN],
  });
  if (res.rows.length === 0) return 0;
  const arr = res.rows.map((r: any) => Number(r.usdc_cost_micros)).sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? Math.floor((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
}

export async function getStealthWatchlist(chainId: number): Promise<
  Array<{ address: string; firstSeenBlock: number }>
> {
  await ensureSchema();
  // Watchlist sources for chain X:
  //   - vault_transferred_out.to_address WHERE chain_id = X: ephemeral
  //     cashout stealths on X.
  //   - smart_accounts.account_address WHERE chain_id = X: deployed user
  //     wallets on X.
  //   - cctp_burns.mint_recipient WHERE destination_domain = domain(X):
  //     dst-chain stealths that received a CCTP mint here. The burn row
  //     was emitted on the SRC chain (chain_id != X), but the recipient
  //     lives on X — so we MUST NOT filter cctp_burns by chain_id here.
  //
  // mint_recipient is stored as a bytes32 hex; we slice off the low 20
  // bytes to get the address. Padding is consistent because CCTP V2
  // recipients are zero-extended addresses.
  const dstDomain = CHAIN_TO_CCTP_DOMAIN[chainId];
  const cctpClause =
    dstDomain !== undefined
      ? `UNION ALL
         SELECT '0x' || lower(substr(mint_recipient, -40)) AS address, block_number
         FROM cctp_burns WHERE destination_domain = ?`
      : "";
  const args: any[] = [chainId, chainId];
  if (dstDomain !== undefined) args.push(dstDomain);

  const res = await client().execute({
    sql: `SELECT address, MIN(block_number) AS first_seen FROM (
            SELECT to_address       AS address, block_number FROM vault_transferred_out WHERE chain_id = ?
            UNION ALL
            SELECT account_address  AS address, block_number FROM smart_accounts        WHERE chain_id = ?
            ${cctpClause}
          )
          GROUP BY address`,
    args,
  });
  return res.rows.map((r: any) => ({
    address: String(r.address),
    firstSeenBlock: Number(r.first_seen),
  }));
}
