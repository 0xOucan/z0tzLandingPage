/**
 * Turso "v7" schema + helpers for the Z0tz V7 data layer.
 *
 * Two jobs (mirrors the v6.5 fast-history DB pattern in ./turso.ts):
 *   1. INDEX public on-chain events for fast lookup (recovery methods,
 *      ledger spends/credits, names, airdrops, fee/break-even, accounts).
 *   2. Store the user's ENCRYPTED recovery artifact (AES-GCM, passphrase-
 *      protected) so a returning z0tz user can pull it from any device and
 *      decrypt locally — "fast recovery" convenience.
 *
 * HARD RULES (privacy + on-chain-first):
 *   - NEVER store plaintext secrets / sensitive info. The recovery secret,
 *     emergency key, and guardian list stay offline; only their on-chain
 *     keccak COMMITMENTS (public) and an opaque encrypted blob are stored.
 *   - This DB is a rebuildable CACHE, never authoritative. Recovery must work
 *     from chain + offline secret with zero DB dependency.
 *
 * Config: TURSO_V7_DATABASE_URL + TURSO_V7_AUTH_TOKEN (falls back to the
 * shared TURSO_DATABASE_URL / TURSO_AUTH_TOKEN if the v7-specific ones are
 * unset).
 */
import { createClient, type Client } from "@libsql/client";

const url = (process.env.TURSO_V7_DATABASE_URL ?? process.env.TURSO_DATABASE_URL)?.trim();
const authToken = (process.env.TURSO_V7_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN)?.trim();

let _client: Client | null = null;

export function isEnabled(): boolean {
  return Boolean(url && authToken);
}

export function client(): Client {
  if (!isEnabled()) {
    throw new Error("Turso v7 not configured (set TURSO_V7_DATABASE_URL + TURSO_V7_AUTH_TOKEN)");
  }
  if (!_client) _client = createClient({ url: url!, authToken: authToken! });
  return _client;
}

let _schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  const c = client();
  await c.batch(
    [
      // Per-(chain, contract, event) indexer cursor.
      `CREATE TABLE IF NOT EXISTS scan_state_v7 (
        chain_id INTEGER NOT NULL,
        contract_address TEXT NOT NULL,
        event_type TEXT NOT NULL,
        last_block_scanned INTEGER NOT NULL,
        last_scanned_at INTEGER NOT NULL,
        PRIMARY KEY (chain_id, contract_address, event_type)
      )`,

      // ENCRYPTED recovery artifact (opaque blob; decryptable only with the
      // user's passphrase). Keyed by pubkeyHash so a returning user re-derives
      // it from their passkey and fetches the blob. NO plaintext secrets.
      `CREATE TABLE IF NOT EXISTS recovery_artifacts (
        pubkey_hash TEXT NOT NULL,
        chain_id INTEGER NOT NULL DEFAULT 0,
        account TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        salt TEXT NOT NULL,
        tag TEXT NOT NULL,
        kdf TEXT NOT NULL DEFAULT 'scrypt',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (pubkey_hash, chain_id)
      )`,

      // Public recovery events (RecoveryHub). commitment is the on-chain
      // keccak commitment (public), never the preimage.
      `CREATE TABLE IF NOT EXISTS recovery_events_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT NOT NULL,
        kind INTEGER,
        method_index INTEGER,
        event_type TEXT NOT NULL, -- MethodEnabled|MethodDisabled|RecoveryInitiated|RecoveryExecuted
        commitment TEXT,
        recovery_id TEXT,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, event_type, account)
      )`,

      // Accounts (P-256 owner mapping; supports recovery discovery).
      `CREATE TABLE IF NOT EXISTS accounts_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT NOT NULL,
        pubkey_hash TEXT,
        deployed_at INTEGER,
        PRIMARY KEY (chain_id, account)
      )`,

      // Ledger spend events (public routing; amounts stay encrypted on-chain).
      `CREATE TABLE IF NOT EXISTS ledger_events_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT NOT NULL,
        token TEXT NOT NULL,
        action INTEGER NOT NULL,
        dest TEXT,
        dest_chain INTEGER,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,

      // Cash-in credits (CreditedFromVault) — net plaintext amount is public.
      `CREATE TABLE IF NOT EXISTS credit_events_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT NOT NULL,
        token TEXT NOT NULL,
        net_amount TEXT NOT NULL,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,

      // z0tz.names records (hashed names; resolution is public).
      `CREATE TABLE IF NOT EXISTS name_records_v7 (
        chain_id INTEGER NOT NULL,
        name_hash TEXT NOT NULL,
        pubkey_hash TEXT,
        resolved_account TEXT,
        parent_name_hash TEXT,
        is_subdomain_root INTEGER NOT NULL DEFAULT 0,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, name_hash)
      )`,

      // Airdrop claims (one per pubkeyHash per chain).
      `CREATE TABLE IF NOT EXISTS airdrop_claims_v7 (
        chain_id INTEGER NOT NULL,
        pubkey_hash TEXT NOT NULL,
        account TEXT NOT NULL,
        amount TEXT NOT NULL,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, pubkey_hash)
      )`,

      // Fee accounting (break-even dashboard).
      `CREATE TABLE IF NOT EXISTS fee_events_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT,
        op_kind TEXT NOT NULL,
        base_amount TEXT NOT NULL,
        protocol_fee TEXT NOT NULL,
        gas_reimbursed TEXT NOT NULL,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,

      // Deterministic-stealth watchlist: the public stealth addresses to scan
      // for inbound funds. Populated by the client (it derives the address and
      // registers the PUBLIC address only — no key). Scanned on EVERY chain.
      `CREATE TABLE IF NOT EXISTS stealth_watch_v7 (
        stealth_address TEXT PRIMARY KEY,
        pubkey_hash TEXT NOT NULL,
        idx INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,

      // Inbound ERC-20 transfers TO a watched stealth (per chain), so the GUI
      // can show "you received X on chain Y" without polling every RPC, then
      // offer a one-tap sweep. `swept` flips once cashed in.
      `CREATE TABLE IF NOT EXISTS stealth_inbound_v7 (
        chain_id INTEGER NOT NULL,
        stealth_address TEXT NOT NULL,
        token TEXT NOT NULL,
        from_addr TEXT NOT NULL,
        amount TEXT NOT NULL,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        swept INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,
    ],
  );
  _schemaReady = true;
}

// ── Stealth watchlist + inbound (deterministic-stealth discovery) ─────────

export async function watchStealth(pubkeyHash: string, stealthAddress: string, idx = 0): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT OR IGNORE INTO stealth_watch_v7 (stealth_address, pubkey_hash, idx, created_at) VALUES (?,?,?,?)`,
    args: [stealthAddress.toLowerCase(), pubkeyHash, idx, Date.now()],
  });
}

export async function getWatchlist(): Promise<{ stealthAddress: string; pubkeyHash: string; idx: number }[]> {
  await ensureSchema();
  const r = await client().execute(`SELECT stealth_address, pubkey_hash, idx FROM stealth_watch_v7`);
  return r.rows.map((row) => ({ stealthAddress: row.stealth_address as string, pubkeyHash: row.pubkey_hash as string, idx: Number(row.idx) }));
}

export async function recordInbound(row: {
  chainId: number; stealthAddress: string; token: string; from: string; amount: string;
  block: number; txHash: string; logIndex: number; ts: number;
}): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT OR IGNORE INTO stealth_inbound_v7 (chain_id, stealth_address, token, from_addr, amount, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [row.chainId, row.stealthAddress.toLowerCase(), row.token.toLowerCase(), row.from.toLowerCase(), row.amount, row.block, row.txHash, row.logIndex, row.ts],
  });
}

/** All inbound funds for a user's stealth addresses (unswept first). */
export async function getInboundForPubkey(pubkeyHash: string): Promise<any[]> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT i.* FROM stealth_inbound_v7 i JOIN stealth_watch_v7 w ON i.stealth_address = w.stealth_address
          WHERE w.pubkey_hash = ? ORDER BY i.swept ASC, i.block DESC`,
    args: [pubkeyHash],
  });
  return r.rows;
}

export async function markSwept(chainId: number, txHash: string, logIndex: number): Promise<void> {
  await ensureSchema();
  await client().execute({ sql: `UPDATE stealth_inbound_v7 SET swept = 1 WHERE chain_id = ? AND tx_hash = ? AND log_index = ?`, args: [chainId, txHash, logIndex] });
}

// ── Encrypted recovery artifact (the only user-data write) ───────────────

export interface EncryptedArtifact {
  pubkeyHash: string;
  chainId?: number;
  account?: string;
  version?: number;
  ciphertext: string;
  iv: string;
  salt: string;
  tag: string;
  kdf?: string;
}

/** Upsert the user's ENCRYPTED recovery artifact. Caller MUST pass an already-
 *  encrypted blob — this layer never sees or stores plaintext secrets. */
export async function putRecoveryArtifact(a: EncryptedArtifact): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT INTO recovery_artifacts
            (pubkey_hash, chain_id, account, version, ciphertext, iv, salt, tag, kdf, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(pubkey_hash, chain_id) DO UPDATE SET
            account=excluded.account, version=excluded.version, ciphertext=excluded.ciphertext,
            iv=excluded.iv, salt=excluded.salt, tag=excluded.tag, kdf=excluded.kdf,
            updated_at=excluded.updated_at`,
    args: [
      a.pubkeyHash, a.chainId ?? 0, a.account ?? null, a.version ?? 1,
      a.ciphertext, a.iv, a.salt, a.tag, a.kdf ?? "scrypt", Date.now(),
    ],
  });
}

export async function getRecoveryArtifact(pubkeyHash: string, chainId = 0): Promise<EncryptedArtifact | null> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM recovery_artifacts WHERE pubkey_hash = ? AND chain_id = ?`,
    args: [pubkeyHash, chainId],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    pubkeyHash: row.pubkey_hash as string,
    chainId: Number(row.chain_id),
    account: (row.account as string) ?? undefined,
    version: Number(row.version),
    ciphertext: row.ciphertext as string,
    iv: row.iv as string,
    salt: row.salt as string,
    tag: row.tag as string,
    kdf: row.kdf as string,
  };
}

/** Recovery discovery: which methods + history exist for an account. */
export async function getRecoveryEvents(chainId: number, account: string) {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM recovery_events_v7 WHERE chain_id = ? AND account = ? ORDER BY block ASC`,
    args: [chainId, account.toLowerCase()],
  });
  return r.rows;
}

// ── Indexer cursor ───────────────────────────────────────────────────────

export async function getLastScanBlock(chainId: number, contract: string, eventType: string): Promise<number> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT last_block_scanned FROM scan_state_v7 WHERE chain_id = ? AND contract_address = ? AND event_type = ?`,
    args: [chainId, contract.toLowerCase(), eventType],
  });
  return r.rows[0] ? Number(r.rows[0].last_block_scanned) : 0;
}

export async function setScanState(chainId: number, contract: string, eventType: string, lastBlock: number): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT INTO scan_state_v7 (chain_id, contract_address, event_type, last_block_scanned, last_scanned_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(chain_id, contract_address, event_type) DO UPDATE SET
            last_block_scanned=excluded.last_block_scanned, last_scanned_at=excluded.last_scanned_at`,
    args: [chainId, contract.toLowerCase(), eventType, lastBlock, Date.now()],
  });
}
