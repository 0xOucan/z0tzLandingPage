import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitAirdropClaim, type AirdropClaimReq } from "@/lib/relayer/v7";
import {
  AirdropClaimReqSchema,
  ErrorResponseSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

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

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  if (!isEnabled())
    return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
  // OPEN onboarding endpoint — retail + B2B both call this freely.
  // OPEN endpoint (retail + B2B). Per-call auth comes from the contract:
  // every accepted op carries a P-256 sig the on-chain validator verifies.
  const finalize = async (_n: number) => {};
  try {
    const rawBody = await req.json();
    const parsed = AirdropClaimReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      await finalize(400);
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, claim } = parsed.data;
    const { txHash } = await submitAirdropClaim(chainId, claim as unknown as AirdropClaimReq);
    await finalize(200);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    await finalize(500);
    return NextResponse.json(
      { error: e.message ?? "submit failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
