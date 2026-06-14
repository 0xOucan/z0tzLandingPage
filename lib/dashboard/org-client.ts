/**
 * Server-side org API client. Given a logged-in dashboard user's linked
 * `org_key_id`, this signs and dispatches calls to /api/v7/org/* using the
 * M-7 HMAC-over-body scheme.
 *
 * The org secret NEVER reaches the browser. The dashboard's own route
 * handlers (app/api/dashboard/*) call these functions; the result is what
 * the browser sees. The plaintext key lives only in `org_keys.hmac_key`
 * (server DB) and in the signed request header.
 *
 * HMAC: sig = HMAC_SHA256(plaintext_key, `${ts}|${METHOD}|${path}|${sha256Hex(body)}`)
 * Header: X-Z0tz-Org-Auth: keyId=<id>;ts=<ms>;sig=<hex>
 * Plaintext key shape: z0tz_<keyId>_<secret>
 */
import { createHmac, createHash } from "node:crypto";
import { client, ensureSchema } from "@/lib/indexer/turso-v7";

/** Fetch the plaintext HMAC key for an org key id. Server-only. */
export async function getOrgKeyPlaintext(keyId: string): Promise<string | null> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT hmac_key, revoked_at FROM org_keys WHERE key_id = ? LIMIT 1`,
    args: [keyId],
  });
  const row = r.rows[0];
  if (!row) return null;
  if (row.revoked_at !== null) return null;
  return (row.hmac_key as string | null) ?? null;
}

function originFromEnv(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export interface OrgCallResult {
  status: number;
  ok: boolean;
  json: any;
}

/**
 * Sign + call an /api/v7/org/* endpoint as the given org key.
 * @param keyId   org key id (the public 8-hex handle)
 * @param method  HTTP method, uppercased
 * @param path    pathname only, e.g. "/api/v7/org/usage"
 * @param body    request body object (omit / null for GET)
 * @param query   optional query string (without leading ?) for GET
 */
export async function callOrgApi(args: {
  keyId: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  query?: string;
}): Promise<OrgCallResult> {
  const plaintext = await getOrgKeyPlaintext(args.keyId);
  if (!plaintext) {
    return { status: 401, ok: false, json: { error: "org key not found or revoked", code: "no_org_key" } };
  }
  const bodyStr = args.method === "GET" || args.body == null ? "" : JSON.stringify(args.body);
  const ts = Date.now();
  const bodyHash = createHash("sha256").update(bodyStr).digest("hex");
  const message = `${ts}|${args.method}|${args.path}|${bodyHash}`;
  const sig = createHmac("sha256", plaintext).update(message).digest("hex");
  const authHeader = `keyId=${args.keyId};ts=${ts};sig=${sig}`;

  const url = `${originFromEnv()}${args.path}${args.query ? `?${args.query}` : ""}`;
  const res = await fetch(url, {
    method: args.method,
    headers: {
      "X-Z0tz-Org-Auth": authHeader,
      ...(args.method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: args.method === "POST" ? bodyStr : undefined,
    cache: "no-store",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = { error: "non-json response", code: "bad_response" };
  }
  return { status: res.status, ok: res.ok, json };
}
