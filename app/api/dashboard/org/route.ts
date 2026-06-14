/**
 * Session-gated proxy from the dashboard browser to the org API.
 *
 * The browser POSTs { action, payload } here with its session cookie. We
 * resolve the logged-in user's linked org_key_id, then sign + dispatch the
 * matching /api/v7/org/* call server-side via callOrgApi. The org secret
 * never leaves the server.
 *
 * Supported actions map 1:1 to the wired org endpoints:
 *   usage     GET  /api/v7/org/usage
 *   subdomain POST /api/v7/org/subdomain
 *   repoint   POST /api/v7/org/subdomain/repoint
 *   revoke    POST /api/v7/org/subdomain/revoke
 *   policy    POST /api/v7/org/policy
 *   recover   POST /api/v7/org/recover
 *   multisend POST /api/v7/org/subdomain  (batched — bulk onboard)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/dashboard/session";
import { callOrgApi } from "@/lib/dashboard/org-client";

const ROUTES: Record<string, { method: "GET" | "POST"; path: string }> = {
  usage: { method: "GET", path: "/api/v7/org/usage" },
  subdomain: { method: "POST", path: "/api/v7/org/subdomain" },
  repoint: { method: "POST", path: "/api/v7/org/subdomain/repoint" },
  revoke: { method: "POST", path: "/api/v7/org/subdomain/revoke" },
  policy: { method: "POST", path: "/api/v7/org/policy" },
  recover: { method: "POST", path: "/api/v7/org/recover" },
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  if (!user.org_key_id) {
    return NextResponse.json({ error: "no org key linked to this account" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { action, payload, query } = body ?? {};

  // Bulk onboard: dispatch one subdomain claim per row, collect results.
  if (action === "multisend") {
    const rows: any[] = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length === 0 || rows.length > 50) {
      return NextResponse.json({ error: "rows must be 1..50" }, { status: 400 });
    }
    const results = [];
    for (const row of rows) {
      const r = await callOrgApi({
        keyId: user.org_key_id,
        method: "POST",
        path: "/api/v7/org/subdomain",
        body: row,
      });
      results.push({ status: r.status, ok: r.ok, json: r.json });
    }
    return NextResponse.json({ results });
  }

  const route = ROUTES[action];
  if (!route) return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });

  const result = await callOrgApi({
    keyId: user.org_key_id,
    method: route.method,
    path: route.path,
    body: route.method === "POST" ? payload : undefined,
    query: route.method === "GET" ? (typeof query === "string" ? query : undefined) : undefined,
  });
  return NextResponse.json(result.json, { status: result.status });
}
