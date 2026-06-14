import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitOrgClaimSubdomain, ONCHAIN_SIM_FAILED, type OrgClaimSubdomainReq } from "@/lib/relayer/v7";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import {
  OrgClaimSubdomainReqSchema,
  OrgScopedErrorSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

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

export const POST = withApiLog("/api/v7/org/subdomain", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return NextResponse.json(
      { error: "relayer-disabled", code: "relayer_disabled" },
      { status: 503, headers: v7CorsHeaders },
    );
  }

  // 1. Authenticate via HMAC API key. Returns a ready-to-send 401 on
  //    any auth failure (malformed / unknown / revoked / wrong secret).
  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) { ctx.errorCode = "unauthorized"; return authResult; }
  const { auth, finalize } = authResult;
  ctx.orgId = auth.keyId;

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; await finalize(400); return json.response; }
  try {
    // 2. Parse the request body via the SAME zod schema that drives the
    //    OpenAPI spec.
    const parsed = OrgClaimSubdomainReqSchema.safeParse(json.value);
    if (!parsed.success) {
      const err = {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed" as const,
      };
      ctx.errorCode = "validation_failed";
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }
    const { chainId, claim } = parsed.data;
    ctx.chainId = chainId;

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
      ctx.errorCode = "scope_mismatch";
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }

    // 4. Submit the on-chain tx via the relayer (gas paid by Z0tz).
    const { txHash } = await submitOrgClaimSubdomain(
      chainId,
      claim as unknown as OrgClaimSubdomainReq,
    );

    ctx.txHash = txHash;
    await finalize(200);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    // Bug 4 fix: pre-broadcast simulation failures are USER errors (bogus
    // sig, wrong nonce, deadline elapsed). Return 400 with the revert
    // reason so the client can self-correct, and finalize the audit row
    // with status 400 so billing/quota doesn't count grief traffic as ok.
    const msg = String(e?.message ?? e);
    if (msg.startsWith(ONCHAIN_SIM_FAILED)) {
      const reason = msg.slice(ONCHAIN_SIM_FAILED.length + 2); // strip "onchain_simulation_failed: "
      ctx.errorCode = ONCHAIN_SIM_FAILED;
      await finalize(400);
      return NextResponse.json(
        { error: reason, code: ONCHAIN_SIM_FAILED },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    ctx.errorCode = "submit_failed";
    await finalize(500);
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
