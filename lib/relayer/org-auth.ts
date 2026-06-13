/**
 * /api/v7/org/* HMAC-over-body middleware (M-7).
 *
 * Auth flow:
 *   1. Client sends `X-Z0tz-Org-Auth: keyId=<8-hex>;ts=<ms>;sig=<64-hex>`
 *      where `sig = HMAC_SHA256(plaintext_key, `${ts}|${METHOD}|${path}|${sha256(body)}`)`.
 *   2. Server parses the header, looks up the row by `keyId`, recomputes
 *      the HMAC using the stored `hmac_key` plaintext, and constant-time
 *      compares. `ts` must be within ±5 minutes of server clock.
 *   3. Authenticated calls log to `org_audit_log` (key_id + path + status
 *      + ts + hashed-IP). The response handler awaits the write before
 *      returning so a Vercel timeout never silently drops the audit row.
 *
 * Why HMAC-over-body (not just-the-static-key, the old scheme):
 *   The previous design only matched the static key header. An attacker
 *   who intercepted a valid request could swap the body before forwarding
 *   and the server would still accept it. HMAC over the body binds the
 *   exact bytes the client signed, so any in-flight mutation invalidates
 *   the request.
 *
 * Scope: every endpoint is implicitly org-scoped via `subdomain_root_hash`.
 * Handlers receive a typed `OrgAuthContext` and can ONLY operate on rows
 * matching `context.subdomainRootHash`.
 *
 * Anti-enumeration: 401 on a malformed header, missing header, AND wrong
 * signature. Same status, no specifier — the only information leaked is
 * "auth failed."
 *
 * Body-handling notes:
 *   - We `clone()` the request once and call `.text()` on the clone so we
 *     can hash the body for the HMAC check WITHOUT consuming the original
 *     stream — the handler still calls `req.json()` downstream.
 *   - GET / DELETE etc. with no body use the empty string; `sha256("")`
 *     is well-defined.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  authenticateOrgRequest,
  logOrgRequest,
  type OrgKeyMeta,
} from "@/lib/indexer/turso-v7";

export interface OrgAuthContext {
  keyId: string;
  orgName: string;
  subdomainRootHash: string;
  tier: string;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Salted truncated SHA — the audit log keeps enough to spot abuse
  // patterns but never the raw IP (privacy-by-default for org users).
  // Salt is a per-deploy env var (rotates per environment).
  const salt = process.env.Z0TZ_IP_HASH_SALT ?? "z0tz-default-salt";
  // Lazy require to avoid bundling crypto for routes that never call this.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(salt + ":" + ip).digest("hex").slice(0, 16);
}

function clientIp(req: NextRequest): string | null {
  // Vercel + most CDNs use x-forwarded-for; fall back to x-real-ip.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

/**
 * Authenticate the request OR return a ready-to-send 401 response. Usage:
 *
 *   const result = await requireOrgAuth(req, corsHeaders);
 *   if (result instanceof NextResponse) return result;  // 401 + logged
 *   const { auth, finalize } = result;
 *   // ... handle the request, build `resp`
 *   await finalize(resp.status);                          // logs the call
 *   return resp;
 *
 * `finalize` MUST be called once with the final status code so the audit
 * log captures the outcome (200 / 400 / 500 / etc.).
 */
export async function requireOrgAuth(
  req: NextRequest,
  corsHeaders: Record<string, string>,
): Promise<
  | NextResponse
  | {
      auth: OrgAuthContext;
      finalize: (statusCode: number) => Promise<void>;
    }
> {
  const header = req.headers.get("x-z0tz-org-auth");
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const ipHash = hashIp(clientIp(req));

  // Clone before reading so the route handler can still call req.json().
  let body = "";
  try {
    body = await req.clone().text();
  } catch {
    body = "";
  }

  let meta: OrgKeyMeta | null = null;
  try {
    meta = await authenticateOrgRequest({ header, method, path, body });
  } catch (_e) {
    // Turso outage / misconfig — fail closed.
    return NextResponse.json(
      { error: "auth backend unavailable" },
      { status: 503, headers: corsHeaders },
    );
  }
  if (!meta) {
    // Anti-enumeration: log nothing org-scoped (we don't know who they
    // claimed to be). Reply 401 with no specifier.
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  const auth: OrgAuthContext = {
    keyId: meta.key_id,
    orgName: meta.org_name,
    subdomainRootHash: meta.subdomain_root_hash,
    tier: meta.tier,
  };

  const finalize = async (statusCode: number) => {
    try {
      await logOrgRequest({ keyId: meta!.key_id, method, path, statusCode, ipHash });
    } catch {
      // Don't fail the user's request if the audit-log insert itself
      // errors. Operations notice via dashboard health checks.
    }
  };

  return { auth, finalize };
}
