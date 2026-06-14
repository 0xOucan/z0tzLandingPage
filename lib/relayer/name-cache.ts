/**
 * Name-resolution cache (V7-FINAL patch #11).
 *
 * Z0tzNameRegistry.resolve(nameHash) returns the opaque sentinel
 * address(0x1) for non-LEDGER_ROLE callers, so off-chain clients cannot
 * reach the real account through the contract. Since the relayer is the
 * namespace authority (V7-FINAL #7) it sees every NameClaim / Repointed /
 * Revoked event it submits — we mirror them into a Turso table so the
 * /api/v7/resolve/[nameHash] endpoint can answer in O(1).
 *
 * Schema: db/migrations/0003_name_resolutions.sql.
 *
 * Best-effort: every write is wrapped in try/catch so a Turso hiccup
 * never blocks the tx response on the upstream submit path.
 */
import type { Hex, Address, TransactionReceipt } from "viem";
import { parseEventLogs } from "viem";
import { client as tursoClient, isEnabled as tursoEnabled } from "@/lib/indexer/turso-v7";

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady || !tursoEnabled()) return;
  try {
    await tursoClient().execute(
      `CREATE TABLE IF NOT EXISTS name_resolutions (
        name_hash         TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        parent_name_hash  TEXT,
        resolved_account  TEXT NOT NULL,
        chain_id          INTEGER NOT NULL,
        claimed_at        INTEGER NOT NULL,
        last_updated      INTEGER NOT NULL,
        active            INTEGER NOT NULL DEFAULT 1,
        tx_hash           TEXT NOT NULL
      )`,
    );
    try {
      await tursoClient().execute(
        `CREATE INDEX IF NOT EXISTS idx_name_resolutions_active ON name_resolutions(active, chain_id)`,
      );
      await tursoClient().execute(
        `CREATE INDEX IF NOT EXISTS idx_name_resolutions_resolved ON name_resolutions(resolved_account)`,
      );
    } catch { /* swallow index races */ }
    _schemaReady = true;
  } catch { /* swallow */ }
}

export interface NameResolutionRow {
  nameHash: Hex;
  name?: string;
  parentNameHash?: Hex | null;
  resolvedAccount: Address;
  chainId: number;
  txHash: Hex;
  active?: boolean;
  observedAt?: number;
}

/** Idempotent insert/update. Best-effort — never throws. */
export async function upsertNameResolution(row: NameResolutionRow): Promise<void> {
  try {
    await ensureSchema();
    if (!tursoEnabled()) return;
    const now = row.observedAt ?? Date.now();
    await tursoClient().execute({
      sql: `INSERT INTO name_resolutions
              (name_hash, name, parent_name_hash, resolved_account,
               chain_id, claimed_at, last_updated, active, tx_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name_hash) DO UPDATE SET
              resolved_account = excluded.resolved_account,
              chain_id         = excluded.chain_id,
              last_updated     = excluded.last_updated,
              active           = excluded.active,
              tx_hash          = excluded.tx_hash,
              parent_name_hash = COALESCE(excluded.parent_name_hash, name_resolutions.parent_name_hash),
              name             = CASE WHEN excluded.name != '' THEN excluded.name ELSE name_resolutions.name END`,
      args: [
        row.nameHash.toLowerCase(),
        row.name ?? "",
        row.parentNameHash ? row.parentNameHash.toLowerCase() : null,
        row.resolvedAccount.toLowerCase(),
        row.chainId,
        now,
        now,
        row.active === false ? 0 : 1,
        row.txHash.toLowerCase(),
      ],
    });
  } catch { /* swallow */ }
}

/** Best-effort deactivate (Revoked / NameReleased). */
export async function deactivateNameResolution(
  nameHash: Hex,
  chainId: number,
  txHash: Hex,
): Promise<void> {
  try {
    await ensureSchema();
    if (!tursoEnabled()) return;
    const now = Date.now();
    await tursoClient().execute({
      sql: `UPDATE name_resolutions
              SET active = 0, last_updated = ?, tx_hash = ?, chain_id = ?
            WHERE name_hash = ?`,
      args: [now, txHash.toLowerCase(), chainId, nameHash.toLowerCase()],
    });
  } catch { /* swallow */ }
}

export interface ResolveLookup {
  nameHash: Hex;
  resolvedAccount: Address;
  chainId: number;
  active: boolean;
  claimedAt: number;
}

export async function lookupNameResolution(nameHash: Hex): Promise<ResolveLookup | null> {
  try {
    await ensureSchema();
    if (!tursoEnabled()) return null;
    const r = await tursoClient().execute({
      sql: `SELECT name_hash, resolved_account, chain_id, active, claimed_at
              FROM name_resolutions
             WHERE name_hash = ?
             LIMIT 1`,
      args: [nameHash.toLowerCase()],
    });
    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      nameHash: String(row.name_hash) as Hex,
      resolvedAccount: String(row.resolved_account) as Address,
      chainId: Number(row.chain_id),
      active: Number(row.active) === 1,
      claimedAt: Number(row.claimed_at),
    };
  } catch {
    return null;
  }
}

// ── Receipt parsers ──────────────────────────────────────────────────────
//
// Each helper takes a confirmed receipt + the relevant ABI fragments and
// upserts/deactivates rows for any matching events. Best-effort: every
// helper catches its own errors so submit-time backfill never throws.

/** Minimal ABI surface needed to decode name-registry log topics. */
const namesEventsAbi = [
  { type: "event", name: "NameClaimed", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
    { name: "resolvedAccount", type: "address", indexed: true },
    { name: "isSubdomainRoot", type: "bool" },
  ]},
  { type: "event", name: "SubdomainClaimed", inputs: [
    { name: "parentNameHash", type: "bytes32", indexed: true },
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
    { name: "resolvedAccount", type: "address" },
  ]},
  { type: "event", name: "NameClaimedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "resolvedAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "SubdomainClaimedByAuthority", inputs: [
    { name: "parentNameHash", type: "bytes32", indexed: true },
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "resolvedAccount", type: "address" },
  ]},
  { type: "event", name: "ResolvedAccountUpdated", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "newAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "RepointedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "newAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "RevokedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
  ]},
  { type: "event", name: "SubdomainRevoked", inputs: [
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "parentNameHash", type: "bytes32", indexed: true },
  ]},
  { type: "event", name: "NameReleased", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
  ]},
] as const;

/**
 * Walk a receipt and persist (or deactivate) every name-registry event we
 * recognize. `nameHint` / `parentHint` carry cleartext segments from the
 * submit-site so the cache row carries the human-readable name. Always
 * best-effort: never throws.
 */
export async function backfillFromReceipt(opts: {
  chainId: number;
  receipt: TransactionReceipt;
  registryAddress: Address;
  nameHint?: string;
  parentHint?: Hex;
}): Promise<void> {
  try {
    const registryLogs = opts.receipt.logs.filter(
      (l) => l.address.toLowerCase() === opts.registryAddress.toLowerCase(),
    );
    const logs = parseEventLogs({
      abi: namesEventsAbi,
      logs: registryLogs,
    });
    // Visibility: a name-claim tx that produces zero parseable registry
    // events almost always means a config drift — either the configured
    // `registryAddress` (from DEPLOYMENT_V7_<chainId>.nameRegistry) does
    // not match the contract the tx actually hit, or the event ABI drifted
    // from the deployed Z0tzNameRegistry. Surface it in Vercel logs instead
    // of silently leaving the cache empty (root cause of the bobby/alice
    // 404s: a stale registry address filtered out every matching log).
    if (logs.length === 0) {
      console.warn(
        `[name-cache] backfillFromReceipt parsed ZERO events for tx ` +
          `${opts.receipt.transactionHash} on chain ${opts.chainId}: ` +
          `${opts.receipt.logs.length} total logs, ` +
          `${registryLogs.length} from configured registry ` +
          `${opts.registryAddress}. Check DEPLOYMENT_V7_${opts.chainId}.nameRegistry ` +
          `matches the deployed contract and the event ABI is current.`,
      );
    }
    const txHash = opts.receipt.transactionHash as Hex;
    for (const log of logs) {
      const a = (log as any).args ?? {};
      switch (log.eventName) {
        case "NameClaimed":
        case "NameClaimedByAuthority": {
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            name: opts.nameHint,
            resolvedAccount: a.resolvedAccount as Address,
            chainId: opts.chainId,
            txHash,
            active: true,
          });
          break;
        }
        case "SubdomainClaimed":
        case "SubdomainClaimedByAuthority": {
          await upsertNameResolution({
            nameHash: a.leafNameHash as Hex,
            name: opts.nameHint,
            parentNameHash: (a.parentNameHash as Hex) ?? null,
            resolvedAccount: a.resolvedAccount as Address,
            chainId: opts.chainId,
            txHash,
            active: true,
          });
          break;
        }
        case "ResolvedAccountUpdated": {
          // Pull existing row to preserve name/parent.
          const prev = await lookupNameResolution(a.nameHash as Hex);
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            name: prev?.nameHash ? undefined : undefined,
            resolvedAccount: a.newAccount as Address,
            chainId: opts.chainId,
            txHash,
            active: true,
          });
          break;
        }
        case "RepointedByAuthority": {
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            resolvedAccount: a.newAccount as Address,
            chainId: opts.chainId,
            txHash,
            active: true,
          });
          break;
        }
        case "RevokedByAuthority":
        case "NameReleased": {
          await deactivateNameResolution(a.nameHash as Hex, opts.chainId, txHash);
          break;
        }
        case "SubdomainRevoked": {
          await deactivateNameResolution(a.leafNameHash as Hex, opts.chainId, txHash);
          break;
        }
      }
    }
  } catch (e: any) {
    // Best-effort: never throw on the submit path. But DO log — a silently
    // swallowed parse/upsert failure is exactly how the cache went stale.
    console.warn(`[name-cache] backfillFromReceipt failed for tx ${opts.receipt?.transactionHash} on chain ${opts.chainId}: ${e?.message ?? e}`);
  }
}
