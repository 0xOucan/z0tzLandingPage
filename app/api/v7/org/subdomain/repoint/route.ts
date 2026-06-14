import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitOrgRepointSubdomain, ONCHAIN_SIM_FAILED, type OrgRepointSubdomainReq } from "@/lib/relayer/v7";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import {
  OrgRepointSubdomainReqSchema,
  OrgScopedErrorSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// ── OpenAPI registration ────────────────────────────────────────────────
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/org/subdomain/repoint",
  tags: ["org-tier"],
  summary: "Repoint an existing subdomain leaf to a new user pubkey + account",
  description:
    "Org admin signs a `repointSubdomain` digest off-chain; the relayer " +
    "submits the tx and pays gas. The subdomain-leaf scope check is on-chain " +
    "via `parent.adminPubkey`; the API key still proves the caller is the " +
    "right org. The contract additionally validates the admin's P-256 " +
    "signature against the parent root's stored adminPubkeyHash.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OrgRepointSubdomainReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Body failed zod validation.",
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/org/subdomain/repoint", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return NextResponse.json(
      { error: "relayer-disabled", code: "relayer_disabled" },
      { status: 503, headers: v7CorsHeaders },
    );
  }

  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) { ctx.errorCode = "unauthorized"; return authResult; }
  const { auth, finalize } = authResult;
  ctx.orgId = auth.keyId;

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; await finalize(400); return json.response; }
  try {
    const parsed = OrgRepointSubdomainReqSchema.safeParse(json.value);
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

    // SCOPE NOTE: the leaf's parent must equal the API key's
    // subdomainRootHash, but the request only carries leafNameHash —
    // we don't know the parent without an RPC call. We accept and rely
    // on the on-chain check (`parent.pubkeyHash == adminPubkeyHash`).
    // The API key still proves the caller is the right org.

    const { txHash } = await submitOrgRepointSubdomain(
      chainId,
      claim as unknown as OrgRepointSubdomainReq,
    );

    ctx.txHash = txHash;
    await finalize(200);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    // Bug 4 fix: pre-broadcast simulation revert → 400, not 500/200.
    const msg = String(e?.message ?? e);
    if (msg.startsWith(ONCHAIN_SIM_FAILED)) {
      const reason = msg.slice(ONCHAIN_SIM_FAILED.length + 2);
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
