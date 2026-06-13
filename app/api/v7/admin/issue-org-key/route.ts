import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { issueOrgKey } from "@/lib/indexer/turso-v7";
import { v7CorsHeaders } from "@/lib/openapi/registry";

// Admin-only endpoint to provision an org HMAC API key against the
// production Turso DB so the V7 org/* surface is exercise-able from
// outside the landing app.
//
// Auth: requires `X-Z0tz-Admin-Key` header matching env Z0TZ_ADMIN_KEY.
// If the env var isn't set, the route refuses entirely (no anon issue).
//
// Use case: provisioning kit (V7 alpha test surface item #1). Once a key
// is issued, the holder can drive the full /api/v7/org/* flow:
// subdomain claim, repoint, revoke, policy set, recover-initiate.
//
// Curl example:
//   curl -X POST https://z0tz-landing-page.vercel.app/api/v7/admin/issue-org-key \
//     -H 'Content-Type: application/json' \
//     -H 'X-Z0tz-Admin-Key: <Z0TZ_ADMIN_KEY>' \
//     -d '{"orgName":"acme","subdomainRoot":"acme","tier":"sandbox"}'

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const adminKey = process.env.Z0TZ_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "admin-disabled (set Z0TZ_ADMIN_KEY env on the server to enable)" },
      { status: 503, headers: v7CorsHeaders },
    );
  }
  const provided = req.headers.get("x-z0tz-admin-key");
  if (provided !== adminKey) {
    // Anti-enumeration: same status + text whether the key is wrong or missing.
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: v7CorsHeaders });
  }
  try {
    const body = await req.json();
    const { orgName, subdomainRoot, tier, contactEmail } = body ?? {};
    if (!orgName || !subdomainRoot) {
      return NextResponse.json(
        { error: "Missing orgName or subdomainRoot" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const subdomainRootHash = keccak256(toBytes(String(subdomainRoot).toLowerCase()));
    const issued = await issueOrgKey({
      orgName: String(orgName),
      subdomainRootHash,
      tier: tier ? String(tier) : undefined,
      contactEmail: contactEmail ? String(contactEmail) : null,
    });
    return NextResponse.json(
      {
        key_id: issued.key_id,
        org_name: issued.org_name,
        subdomain_root_hash: issued.subdomain_root_hash,
        tier: issued.tier,
        created_at: issued.created_at,
        // The plaintext key is returned ONCE — the caller must save it.
        plaintext_api_key: issued.plaintext,
        usage: `pass header 'X-Z0tz-Org-Key: ${issued.plaintext}' on /api/v7/org/* calls`,
      },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "issue-org-key failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
