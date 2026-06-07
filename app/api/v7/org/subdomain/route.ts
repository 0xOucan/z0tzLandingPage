import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitOrgClaimSubdomain, type OrgClaimSubdomainReq } from "@/lib/relayer/v7";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import {
  OrgClaimSubdomainReqSchema,
  OrgScopedErrorSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

// ── OpenAPI registration ────────────────────────────────────────────────
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/org/subdomain",
  tags: ["org-tier"],
  summary: "Onboard a user under the caller's subdomain root",
  description:
    "Org admin signs a `claimSubdomainFor` digest off-chain; the relayer " +
    "submits the tx and pays gas. Server-side scope check rejects the " +
    "call if `claim.parentNameHash` doesn't match the API key's bound " +
    "`subdomainRootHash` — even a valid key cannot onboard under another " +
    "org's subdomain. The contract additionally validates the admin's " +
    "P-256 signature against the root's stored adminPubkeyHash.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OrgClaimSubdomainReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Body failed zod validation. `code` may include `validation_failed` or `scope_mismatch`.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
    401: {
      description: "Missing / malformed / revoked / wrong-secret API key.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
    503: {
      description: "Relayer disabled or auth backend unavailable.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
  },
});

// ── Route handlers ──────────────────────────────────────────────────────

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

  // 1. Authenticate via HMAC API key. Returns a ready-to-send 401 on
  //    any auth failure (malformed / unknown / revoked / wrong secret).
  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) return authResult;
  const { auth, finalize } = authResult;

  try {
    // 2. Parse the request body via the SAME zod schema that drives the
    //    OpenAPI spec.
    const rawBody = await req.json();
    const parsed = OrgClaimSubdomainReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err = {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed" as const,
      };
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }
    const { chainId, claim } = parsed.data;

    // 3. SCOPE CHECK: the request's parentNameHash must equal the API
    //    key's subdomainRootHash. Without this, a valid Coppel key could
    //    onboard a user under Elektra's root if Coppel's admin happened
    //    to know Elektra's adminPubkey — chain enforcement would still
    //    block that via sig check, but defense-in-depth here means we
    //    reject earlier with a clear error and don't burn gas.
    if (claim.parentNameHash.toLowerCase() !== auth.subdomainRootHash.toLowerCase()) {
      const err = {
        error: `parentNameHash does not match the API key's subdomain root (expected ${auth.subdomainRootHash})`,
        code: "scope_mismatch" as const,
      };
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }

    // 4. Submit the on-chain tx via the relayer (gas paid by Z0tz).
    const { txHash } = await submitOrgClaimSubdomain(
      chainId,
      claim as unknown as OrgClaimSubdomainReq,
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
