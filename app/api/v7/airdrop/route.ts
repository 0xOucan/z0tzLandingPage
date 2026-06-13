import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitAirdropClaim, type AirdropClaimReq } from "@/lib/relayer/v7";
import {
  AirdropClaimReqSchema,
  ErrorResponseSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/airdrop",
  tags: ["user-tier"],
  summary: "Relay a signed zUSDC airdrop claim",
  description:
    "Submits a P-256-signed airdrop claim to the V7 airdrop contract on the " +
    "destination chain. The relayer pays gas; the user authenticates per-call " +
    "by signing the body with their passkey (X-Z0tz-Sig header).",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AirdropClaimReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Malformed body or missing required fields.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Passkey-signature auth failed.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    503: {
      description: "Relayer disabled (env-flag off).",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/airdrop", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = AirdropClaimReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { chainId, claim } = parsed.data;
  ctx.chainId = chainId;
  try {
    const { txHash } = await submitAirdropClaim(chainId, claim as unknown as AirdropClaimReq);
    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
