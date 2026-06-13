/**
 * Durable per-request audit log for /api/v7/* endpoints.
 *
 * - One row per response (route, method, status, optional txHash/chain, error).
 * - Caller identity + request body are HASHED (sha256) before insert — never
 *   plaintext PII or secrets.
 * - Writes happen AFTER the response is sent (waitUntil-style fire-and-forget)
 *   so latency is unaffected.
 * - Backed by Turso table `api_events` (see db/migrations/0002_api_events.sql).
 *   If Turso is offline the log call no-ops; never throws.
 */
import type { NextRequest, NextResponse } from "next/server";
import { client as tursoClient, isEnabled as tursoEnabled } from "@/lib/indexer/turso-v7";

export type ApiEvent = {
  route: string;
  method: string;
  callerHash?: string;
  orgId?: string | null;
  status: number;
  txHash?: string | null;
  chainId?: number | null;
  errorCode?: string | null;
  requestBodyHash?: string | null;
};

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady || !tursoEnabled()) return;
  try {
    await tursoClient().execute(
      `CREATE TABLE IF NOT EXISTS api_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        route TEXT NOT NULL,
        method TEXT NOT NULL,
        caller_hash TEXT,
        org_id TEXT,
        status INTEGER NOT NULL,
        tx_hash TEXT,
        chain_id INTEGER,
        error_code TEXT,
        request_body_hash TEXT
      )`,
    );
    try {
      await tursoClient().execute(
        `CREATE INDEX IF NOT EXISTS idx_api_events_route_ts ON api_events(route, ts)`,
      );
      await tursoClient().execute(
        `CREATE INDEX IF NOT EXISTS idx_api_events_caller ON api_events(caller_hash, ts)`,
      );
    } catch { /* swallow index races */ }
    _schemaReady = true;
  } catch { /* swallow */ }
}

export async function logApiEvent(ev: ApiEvent): Promise<void> {
  try {
    await ensureSchema();
    if (!tursoEnabled()) return;
    await tursoClient().execute({
      sql: `INSERT INTO api_events
              (ts, route, method, caller_hash, org_id, status, tx_hash, chain_id, error_code, request_body_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        Date.now(),
        ev.route,
        ev.method,
        ev.callerHash ?? null,
        ev.orgId ?? null,
        ev.status,
        ev.txHash ?? null,
        ev.chainId ?? null,
        ev.errorCode ?? null,
        ev.requestBodyHash ?? null,
      ],
    });
  } catch { /* swallow */ }
}

/** sha256 hex of input string. Lazy-imports node:crypto. */
export async function sha256Hex(s: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(s).digest("hex");
}

/** Hash the IP-style caller identity for logging. Never log raw IP. */
export async function hashCaller(req: Request): Promise<string> {
  const h = req.headers;
  const xff = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "";
  const ip = xff.split(",")[0]?.trim() || "anon";
  const ua = h.get("user-agent") ?? "";
  return sha256Hex(`${ip}|${ua}`);
}

export type LoggedContext = {
  route: string;
  txHash?: string | null;
  chainId?: number | null;
  errorCode?: string | null;
  orgId?: string | null;
};

/**
 * Wrap a route handler so its response is logged AFTER it's returned.
 * The handler may mutate `ctx` to record txHash / chainId / errorCode.
 */
export function withApiLog<T extends NextRequest>(
  route: string,
  handler: (req: T, ctx: LoggedContext) => Promise<NextResponse>,
) {
  return async (req: T): Promise<NextResponse> => {
    const ctx: LoggedContext = { route };
    let bodyHash: string | undefined;
    try {
      // Clone before the handler so we can hash without consuming the body.
      const clone = req.clone();
      const text = await clone.text();
      if (text) bodyHash = await sha256Hex(text);
    } catch { /* body unreadable; skip hash */ }

    const res = await handler(req, ctx);
    void (async () => {
      try {
        const callerHash = await hashCaller(req);
        await logApiEvent({
          route: ctx.route,
          method: req.method,
          callerHash,
          orgId: ctx.orgId ?? null,
          status: res.status,
          txHash: ctx.txHash ?? null,
          chainId: ctx.chainId ?? null,
          errorCode: ctx.errorCode ?? null,
          requestBodyHash: bodyHash ?? null,
        });
      } catch { /* swallow */ }
    })();
    return res;
  };
}
