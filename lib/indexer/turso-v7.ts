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

      // Tezcatli yield-vault events (Deposited / Withdrawn / Strategy*/Fee).
      // Public on-chain data only — principal/yield/fee amounts are plaintext
      // by design (the vault is not a private ledger; Z0tz's privacy guarantee
      // is upstream of Tezcatli at the stealth-address layer).
      `CREATE TABLE IF NOT EXISTS tezcatli_events_v7 (
        chain_id INTEGER NOT NULL,
        account TEXT NOT NULL,
        token TEXT NOT NULL,
        kind TEXT NOT NULL, -- 'deposit'|'withdraw'|'strategy_deploy'|'strategy_redeem'|'fee'
        shares TEXT NOT NULL,
        assets TEXT NOT NULL,
        fee TEXT NOT NULL DEFAULT '0',
        fee_bps INTEGER NOT NULL DEFAULT 0,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tezcatli_events_account ON tezcatli_events_v7(chain_id, account, token, ts DESC)`,

      // ── Audit-fix alert family (post-audit V7 contracts) ─────────────
      // One append-only table for the structured ops signals the audit
      // added: ledger MultisendRowSkipped, sweeper FeeTransferFailed,
      // internal-bridge IntentExpired / PendingMintRecorded /
      // UnknownRemoteBridge, yield YieldCapped, timed-vault MintCapHit,
      // tezcatli StrategyValuationStale. Each row carries the event
      // `kind` plus a small JSON `payload` (schemas vary per event but
      // dashboards only read a few fields per kind — JSON wins over a
      // per-event-table fan-out at this volume).
      `CREATE TABLE IF NOT EXISTS audit_alerts_v7 (
        chain_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        payload TEXT NOT NULL,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_alerts_kind_ts ON audit_alerts_v7(chain_id, kind, ts DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_alerts_block ON audit_alerts_v7(chain_id, block DESC)`,

      // V7 sweeper PrivateSweep events — post-audit the contract appended a
      // `bool feeSettled` field so we can distinguish sweeps where the fee
      // leg completed synchronously from sweeps where it was deferred /
      // reverted (see audit_alerts_v7 kind='sweeper.FeeTransferFailed').
      // amount / fee stay public — the sweeper inherently leaks them at the
      // public/private boundary; per-stealth indexing is fine.
      `CREATE TABLE IF NOT EXISTS sweeper_events_v7 (
        chain_id INTEGER NOT NULL,
        stealth_address TEXT NOT NULL,
        token TEXT NOT NULL,
        account TEXT NOT NULL,
        amount TEXT NOT NULL,
        fee TEXT NOT NULL,
        fee_settled INTEGER NOT NULL DEFAULT 0,
        block INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY (chain_id, tx_hash, log_index)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sweeper_events_account ON sweeper_events_v7(chain_id, account, ts DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_sweeper_events_unsettled ON sweeper_events_v7(chain_id, fee_settled, ts DESC)`,

      // B2B SaaS — issued HMAC API keys. One row per (org, key); a key is
      // identified by its 8-char public prefix (`key_id`) so we never have
      // to scan all bcrypt hashes on a request. The full key plaintext is
      // returned ONCE at issuance and never stored — we keep only its
      // bcrypt hash + metadata. `subdomain_root_hash` scopes every authed
      // call to a single org.
      //
      //   key shape (client-visible): "z0tz_<key_id>_<secret>"  (≥ 40 chars total)
      //   bcrypt covers: <key_id>_<secret>
      //
      // `revoked_at` = null when active; non-null marks it dead. We never
      // hard-delete so audit logs can still resolve a key_id → org.
      `CREATE TABLE IF NOT EXISTS org_keys (
        key_id TEXT PRIMARY KEY,
        org_name TEXT NOT NULL,
        subdomain_root_hash TEXT NOT NULL,
        bcrypt_hash TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'sandbox',
        contact_email TEXT,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      )`,

      // Append-only audit log of every /api/v7/org/* call. Keyed by the
      // authenticated org's key_id (NOT the plaintext key). The dashboard
      // reads this to show "who did what" + the org's own usage.
      // Stores REQUEST METADATA only — never request bodies (which can carry
      // user PII like resolved-account addresses).
      `CREATE TABLE IF NOT EXISTS org_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        ip_hash TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_org_audit_log_key_ts ON org_audit_log(key_id, ts DESC)`,
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

// ── B2B SaaS — org HMAC API keys ─────────────────────────────────────────

export interface OrgKeyMeta {
  key_id: string;
  org_name: string;
  subdomain_root_hash: string;
  tier: string;
  contact_email: string | null;
  created_at: number;
  revoked_at: number | null;
}

export interface IssuedKey extends OrgKeyMeta {
  /** Plaintext key. Returned ONCE at issuance — never stored. */
  plaintext: string;
}

/**
 * Issue a fresh HMAC API key for an org. Returns the plaintext ONCE — the
 * caller (the Z0tz super-admin dashboard) shows it to ops once and then
 * loses it forever; the server stores only the bcrypt hash + metadata.
 *
 * Key shape: `z0tz_<8-char key_id>_<32-char secret>`. The key_id is a
 * public lookup handle so authenticateOrgKey is O(1) — we never have to
 * scan all bcrypt hashes per request.
 */
export async function issueOrgKey(args: {
  orgName: string;
  subdomainRootHash: string;
  tier?: string;
  contactEmail?: string | null;
}): Promise<IssuedKey> {
  await ensureSchema();
  // node:crypto is available in Next.js server runtimes.
  const { randomBytes } = await import("node:crypto");
  const bcrypt = await import("bcryptjs");
  const keyId = randomBytes(4).toString("hex"); // 8 chars
  const secret = randomBytes(16).toString("hex"); // 32 chars
  const plaintext = `z0tz_${keyId}_${secret}`;
  // bcrypt covers (key_id + secret), excluding the "z0tz_" prefix — same
  // entropy, smaller hash input.
  const bcryptHash = await bcrypt.hash(`${keyId}_${secret}`, 12);
  const created = Date.now();
  await client().execute({
    sql: `INSERT INTO org_keys
            (key_id, org_name, subdomain_root_hash, bcrypt_hash, tier, contact_email, created_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    args: [
      keyId,
      args.orgName,
      args.subdomainRootHash.toLowerCase(),
      bcryptHash,
      args.tier ?? "sandbox",
      args.contactEmail ?? null,
      created,
    ],
  });
  return {
    key_id: keyId,
    org_name: args.orgName,
    subdomain_root_hash: args.subdomainRootHash.toLowerCase(),
    tier: args.tier ?? "sandbox",
    contact_email: args.contactEmail ?? null,
    created_at: created,
    revoked_at: null,
    plaintext,
  };
}

/** Mark an org key revoked. */
export async function revokeOrgKey(keyId: string): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `UPDATE org_keys SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL`,
    args: [Date.now(), keyId],
  });
}

/**
 * Authenticate an `X-Z0tz-Org-Key` header value. Returns the org metadata on
 * success, null otherwise. The check is O(1) (single PRIMARY KEY lookup on
 * `key_id`) followed by a bcrypt compare on the secret half.
 */
export async function authenticateOrgKey(headerValue: string | null | undefined): Promise<OrgKeyMeta | null> {
  if (!headerValue) return null;
  const m = headerValue.match(/^z0tz_([a-f0-9]{8})_([a-f0-9]{32})$/);
  if (!m) return null;
  const [, keyId, secret] = m;
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM org_keys WHERE key_id = ? LIMIT 1`,
    args: [keyId],
  });
  const row = r.rows[0];
  if (!row) return null;
  if (row.revoked_at !== null) return null;
  const bcrypt = await import("bcryptjs");
  const ok = await bcrypt.compare(`${keyId}_${secret}`, row.bcrypt_hash as string);
  if (!ok) return null;
  return {
    key_id: row.key_id as string,
    org_name: row.org_name as string,
    subdomain_root_hash: row.subdomain_root_hash as string,
    tier: row.tier as string,
    contact_email: (row.contact_email as string | null) ?? null,
    created_at: Number(row.created_at),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
  };
}

/** Append an audit-log row. Stores REQUEST METADATA only — never bodies. */
export async function logOrgRequest(args: {
  keyId: string;
  method: string;
  path: string;
  statusCode: number;
  ipHash?: string | null;
}): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `INSERT INTO org_audit_log (key_id, method, path, status_code, ts, ip_hash)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [args.keyId, args.method, args.path, args.statusCode, Date.now(), args.ipHash ?? null],
  });
}

export interface OrgUsageWindow {
  /** Inclusive lower bound — only audit-log rows with ts >= sinceMs counted. */
  sinceMs: number;
  /** Total successful billable calls (status 2xx). */
  ok: number;
  /** Validation failures (400 / 422). Counted but typically not billed. */
  badRequest: number;
  /** Server errors (5xx). Not billed. */
  serverError: number;
  /** Total calls regardless of outcome. */
  total: number;
}

/** Per-key usage roll-up since `sinceMs`. Drives the org dashboard +
 *  the per-tier rate-limit checks. Pure read of org_audit_log; the
 *  table is the billing meter. */
export async function getOrgUsage(keyId: string, sinceMs: number): Promise<OrgUsageWindow> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT status_code, COUNT(*) as n FROM org_audit_log
          WHERE key_id = ? AND ts >= ?
          GROUP BY status_code`,
    args: [keyId, sinceMs],
  });
  let ok = 0, badRequest = 0, serverError = 0;
  for (const row of r.rows) {
    const status = Number(row.status_code);
    const n = Number(row.n);
    if (status >= 200 && status < 300) ok += n;
    else if (status >= 400 && status < 500) badRequest += n;
    else if (status >= 500) serverError += n;
  }
  return { sinceMs, ok, badRequest, serverError, total: ok + badRequest + serverError };
}

/** List orgs (for the super-admin dashboard). */
export async function listOrgKeys(): Promise<OrgKeyMeta[]> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM org_keys ORDER BY created_at DESC`,
    args: [],
  });
  return r.rows.map((row) => ({
    key_id: row.key_id as string,
    org_name: row.org_name as string,
    subdomain_root_hash: row.subdomain_root_hash as string,
    tier: row.tier as string,
    contact_email: (row.contact_email as string | null) ?? null,
    created_at: Number(row.created_at),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
  }));
}
