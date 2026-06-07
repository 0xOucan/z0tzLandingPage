import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitOrgSetPolicy, type OrgSetPolicyReq } from "@/lib/relayer/v7";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import {
  OrgSetPolicyReqSchema,
  OrgScopedErrorSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

// ── OpenAPI registration ────────────────────────────────────────────────
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/org/policy",
  tags: ["org-tier"],
  summary: "Attach a deployed policy contract to the org's subdomain root",
  description:
    "Org admin signs a `setPolicy` digest off-chain; the relayer submits " +
    "the tx and pays gas. Server-side scope check rejects the call if " +
    "`claim.rootNameHash` doesn't match the API key's bound " +
    "`subdomainRootHash` — a policy can only be attached to THIS org's " +
    "root.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OrgSetPolicyReqSchema } },
    },
  },
  responses: {
    200: { description: "Submitted; returns the tx hash.", content: { "application/json": { schema: TxHashResponseSchema } } },
    400: { description: "Body failed zod validation. `code` may include `validation_failed` or `scope_mismatch`.", content: { "application/json": { schema: OrgScopedErrorSchema } } },
    401: { description: "Missing / malformed / revoked / wrong-secret API key.", content: { "application/json": { schema: OrgScopedErrorSchema } } },
    503: { description: "Relayer disabled or auth backend unavailable.", content: { "application/json": { schema: OrgScopedErrorSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  if (!isEnabled())
    return NextResponse.json(
      { error: "relayer-disabled", code: "relayer_disabled" },
      { status: 503, headers: v7CorsHeaders },
    );

  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) return authResult;
  const { auth, finalize } = authResult;

  try {
    const rawBody = await req.json();
    const parsed = OrgSetPolicyReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err = {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed" as const,
      };
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }
    const { chainId, claim } = parsed.data;

    // SCOPE CHECK: rootNameHash must equal the API key's
    // subdomainRootHash — defense-in-depth before chain enforcement.
    if (claim.rootNameHash.toLowerCase() !== auth.subdomainRootHash.toLowerCase()) {
      const err = {
        error: `rootNameHash does not match the API key's subdomain root (expected ${auth.subdomainRootHash})`,
        code: "scope_mismatch" as const,
      };
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }

    const { txHash } = await submitOrgSetPolicy(
      chainId,
      claim as unknown as OrgSetPolicyReq,
    );

    await finalize(200);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    await finalize(500);
    return NextResponse.json(
      { error: e.message ?? "submit failed", code: "submit_failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
