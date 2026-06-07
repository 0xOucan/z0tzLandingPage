import { NextRequest, NextResponse } from "next/server";
import { verifyRelayerAuth } from "@/lib/relayer/auth";
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
  try {
    const rawBody = await req.json();
    const parsed = AirdropClaimReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, claim } = parsed.data;
    const auth = verifyRelayerAuth(
      {
        "x-z0tz-pubx": req.headers.get("x-z0tz-pubx") ?? undefined,
        "x-z0tz-puby": req.headers.get("x-z0tz-puby") ?? undefined,
        "x-z0tz-sig": req.headers.get("x-z0tz-sig") ?? undefined,
      },
      rawBody,
      false,
    );
    if (!auth.authenticated)
      return NextResponse.json(
        { error: auth.error ?? "unauthorized" },
        { status: 401, headers: v7CorsHeaders },
      );
    const { txHash } = await submitAirdropClaim(chainId, claim as unknown as AirdropClaimReq);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "submit failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
