import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { issueOrgKey } from "@/lib/indexer/turso-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import {
  ErrorResponseSchema,
  IssueOrgKeyReqSchema,
} from "@/lib/openapi/schemas-v7";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// Admin-only provisioning endpoint. Auth: X-Z0tz-Admin-Key compared in
// constant time against env Z0TZ_ADMIN_KEY (M-8 fix).

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/admin/issue-org-key",
  tags: ["admin"],
  summary: "Provision an org HMAC API key",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: IssueOrgKeyReqSchema } },
    },
  },
  responses: {
    200: { description: "Issued; returns plaintext key once." },
    400: { description: "Validation failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
    401: { description: "Bad admin key.", content: { "application/json": { schema: ErrorResponseSchema } } },
    503: { description: "Admin disabled.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

async function constantTimeEq(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const { timingSafeEqual } = await import("crypto");
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export const POST = withApiLog("/api/v7/admin/issue-org-key", async (req: NextRequest, ctx) => {
  const adminKey = process.env.Z0TZ_ADMIN_KEY;
  if (!adminKey) {
    ctx.errorCode = "admin_disabled";
    return errorResponse(503, "admin_disabled", v7CorsHeaders);
  }
  const provided = req.headers.get("x-z0tz-admin-key") ?? "";
  const ok = await constantTimeEq(provided, adminKey);
  if (!ok) {
    ctx.errorCode = "unauthorized";
    return errorResponse(401, "unauthorized", v7CorsHeaders);
  }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }

  const parsed = IssueOrgKeyReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed",
      },
      { status: 400, headers: v7CorsHeaders },
    );
  }

  try {
    const { orgName, subdomainRoot, tier, contactEmail } = parsed.data;
    const subdomainRootHash = keccak256(toBytes(String(subdomainRoot).toLowerCase()));
    const issued = await issueOrgKey({
      orgName,
      subdomainRootHash,
      tier,
      contactEmail: contactEmail ?? null,
    });
    ctx.orgId = issued.key_id;
    return NextResponse.json(
      {
        key_id: issued.key_id,
        org_name: issued.org_name,
        subdomain_root_hash: issued.subdomain_root_hash,
        tier: issued.tier,
        created_at: issued.created_at,
        // Plaintext key returned ONCE — caller must save it.
        plaintext_api_key: issued.plaintext,
        usage:
          "M-7 HMAC-over-body auth. On every /api/v7/org/* call, compute " +
          "sig = HMAC_SHA256(plaintext_api_key, `${ts}|${METHOD}|${path}|${sha256Hex(body)}`) " +
          "and send `X-Z0tz-Org-Auth: keyId=<key_id>;ts=<unix-ms>;sig=<64-hex>`. " +
          "ts must be within ±5 min of server clock.",
      },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    ctx.errorCode = "issue_failed";
    return errorResponse(500, "issue_failed", v7CorsHeaders, e);
  }
});
