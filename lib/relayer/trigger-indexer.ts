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
