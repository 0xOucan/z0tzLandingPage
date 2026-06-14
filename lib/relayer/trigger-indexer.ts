/**
 * Fire-and-forget indexer trigger called after every chain-writing
 * relayer operation. Keeps the indexer's view of the chain fresh so
 * the GUI doesn't see stale data (or worse, miss freshly-deployed
 * smart accounts).
 *
 * Always returns a Promise that resolves regardless of success — the
 * caller does `void triggerIndexScan(...).catch(() => {})` and moves on.
 * Failures here MUST NOT block the user-facing operation.
 *
 * The trigger handler is rate-limited to one in-flight scan per chain
 * by Vercel's function concurrency — extra calls return immediately
 * with `truncated:false, scanned:0` if cursors are already at head.
 */
import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { recordOpCostAsync, type OpKind } from "./cost-tracker";

/**
 * Convenience wrapper: kick the indexer AND record the op's cost in
 * one fire-and-forget. Both writes run in parallel.
 *
 * The cost record is INTENTIONALLY anonymous — no ownerX/ownerY or
 * any per-user identifier travels into the DB. The encrypted ledger
 * exists to prevent observers from profiling a user's spend; storing
 * a user→cost mapping in our own DB would undo that for anyone with
 * Turso credentials.
 */
export function triggerScanAndRecord(opts: {
  chainId: number;
  txHash?: Hex;
  opKind: OpKind;
  req: NextRequest;
}): void {
  void triggerIndexScan(opts.chainId, opts.req).catch(() => {});
  if (opts.txHash) {
    void recordOpCostAsync({
      chainId: opts.chainId,
      txHash: opts.txHash,
      opKind: opts.opKind,
    }).catch(() => {});
  }
}

/**
 * V7 variant of {@link triggerScanAndRecord}. The legacy `triggerScanAndRecord`
 * kicks `/api/index/trigger`, which is the **V6.5** indexer (indexChain,
 * V65_DEPLOY_BLOCK, V6.5 scan_state). V7 routes whose events live in the V7
 * typed tables must instead kick the **V7** indexer (`/api/v7/scan`, indexV7Chain,
 * DEPLOY_BLOCK_V7_<id>, V7 scan_state). Pointing V7 routes at the V6.5 indexer
 * was wasted work (their data only reached V7 tables via the after()-mirror or
 * the V7 cron) and silently 500'd when V6.5 Etherscan/Turso env was unset.
 *
 * Cost recording is generation-agnostic, so it is shared verbatim.
 */
export function triggerV7ScanAndRecord(opts: {
  chainId: number;
  txHash?: Hex;
  opKind: OpKind;
  req: NextRequest;
}): void {
  void triggerV7IndexScan(opts.chainId, opts.req).catch(() => {});
  if (opts.txHash) {
    void recordOpCostAsync({
      chainId: opts.chainId,
      txHash: opts.txHash,
      opKind: opts.opKind,
    }).catch(() => {});
  }
}

/**
 * Kick the V7 indexer for one chain via POST /api/v7/scan?chainId=. Caller
 * should NOT await; just void the returned promise. Idempotent (INSERT OR
 * IGNORE on (chain, tx, logIndex)), so it reconciles cleanly with the
 * after()-mirror and the V7 cron.
 */
export async function triggerV7IndexScan(chainId: number, req: NextRequest): Promise<void> {
  const base = triggerIndexerBaseUrl(req);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // /api/v7/scan honors CRON_SECRET when set; forward it so internal kicks
  // are accepted the same way the cron is.
  const secret = process.env.CRON_SECRET;
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  await fetch(`${base}/api/v7/scan?chainId=${encodeURIComponent(String(chainId))}`, {
    method: "POST",
    headers,
  });
}

export function triggerIndexerBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    req.nextUrl.origin
  );
}

/**
 * Kick the indexer for one chain. Caller should NOT await; just void
 * the returned promise. The trigger endpoint runs Tier 1 + Tier 2 +
 * vault scan in ~5s on a warm function, so on average the next /api/history
 * read will see the new event.
 */
export async function triggerIndexScan(chainId: number, req: NextRequest): Promise<void> {
  const base = triggerIndexerBaseUrl(req);
  await fetch(`${base}/api/index/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId }),
  });
}

/**
 * Kick the indexer for multiple chains at once. Use when an operation
 * touches both src and dst chains (e.g., bridge ops). Each call fires
 * a separate /api/index/trigger so the Vercel functions stay
 * single-chain (smaller budget, faster wall clock).
 */
export async function triggerIndexScans(chainIds: number[], req: NextRequest): Promise<void> {
  await Promise.allSettled(chainIds.map((c) => triggerIndexScan(c, req)));
}
