/**
 * In-memory token-bucket rate limiter with a durable Turso backing.
 *
 * - In-memory Map is the hot path: O(1) check per request, no network.
 * - Turso `rate_limit_buckets` row is written best-effort after each
 *   refill so a cold edge instance can reconstruct the bucket state
 *   on the next refill window. This is NOT exact across N instances;
 *   it just prevents an attacker from getting a full N×limit fresh
 *   budget by chasing cold lambdas. Acceptable for a relayer-grief
 *   abuse model.
 *
 * Limits per finding C-1: 10/min sandbox, 60/min verified.
 *
 * No new deps — pure JS + the existing @libsql client.
 */
import { client as tursoClient, isEnabled as tursoEnabled } from "@/lib/indexer/turso-v7";

export type Tier = "sandbox" | "verified";

const CAPACITY: Record<Tier, number> = {
  sandbox: 10,
  verified: 60,
};
const WINDOW_MS = 60_000;

type Bucket = { tokens: number; updatedAt: number };

const BUCKETS = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // hard eviction ceiling per instance

function evictIfFull() {
  if (BUCKETS.size <= MAX_KEYS) return;
  // Drop oldest 10% by insertion order (Map preserves insertion order).
  const drop = Math.ceil(MAX_KEYS * 0.1);
  let i = 0;
  for (const key of BUCKETS.keys()) {
    if (i++ >= drop) break;
    BUCKETS.delete(key);
  }
}

function refill(b: Bucket, capacity: number, now: number): Bucket {
  const elapsed = now - b.updatedAt;
  if (elapsed <= 0) return b;
  // Linear refill: capacity tokens per WINDOW_MS.
  const add = (elapsed / WINDOW_MS) * capacity;
  const tokens = Math.min(capacity, b.tokens + add);
  return { tokens, updatedAt: now };
}

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady || !tursoEnabled()) return;
  try {
    await tursoClient().execute(
      `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        bucket_key TEXT PRIMARY KEY,
        tokens REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        tier TEXT NOT NULL DEFAULT 'sandbox'
      )`,
    );
    _schemaReady = true;
  } catch {
    // best-effort; in-memory remains authoritative for the local instance
  }
}

/**
 * Consume one token. Returns true if allowed, false if the bucket is empty.
 * Never throws — failure modes degrade open so a Turso outage doesn't 503
 * an honest user.
 */
export async function consumeToken(key: string, tier: Tier = "sandbox"): Promise<boolean> {
  const cap = CAPACITY[tier] ?? CAPACITY.sandbox;
  const now = Date.now();
  const fresh: Bucket = { tokens: cap, updatedAt: now };
  let b = BUCKETS.get(key) ?? fresh;
  b = refill(b, cap, now);
  let allowed = false;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    allowed = true;
  }
  BUCKETS.set(key, b);
  evictIfFull();

  // Best-effort durable write — don't block on it.
  void (async () => {
    try {
      await ensureSchema();
      if (!tursoEnabled()) return;
      await tursoClient().execute({
        sql: `INSERT INTO rate_limit_buckets (bucket_key, tokens, updated_at, tier)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(bucket_key) DO UPDATE SET
                tokens = excluded.tokens,
                updated_at = excluded.updated_at,
                tier = excluded.tier`,
        args: [key, b.tokens, b.updatedAt, tier],
      });
    } catch { /* swallow */ }
  })();

  return allowed;
}

/**
 * Extract a best-effort caller identity for rate-limit keying. Prefers
 * trusted forwarded headers (Vercel sets x-forwarded-for); falls back to
 * a fixed bucket so misconfigured infra doesn't disable the limiter.
 */
export function callerIpKey(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  const ip = xff.split(",")[0]?.trim() || "anon";
  return `ip:${ip}`;
}
