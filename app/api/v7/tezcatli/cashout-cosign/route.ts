import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { buildWithdrawCalldata } from "@/lib/relayer/tezcatli";
import {
  ErrorResponseSchema,
  TezcatliCashoutCosignReqSchema,
  TezcatliCosignResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

/**
 * Org-gated Tezcatli withdraw cosign. Mirrors cashin-cosign — caller-
 * authenticated `withdraw(token, shares, recipient)` on the deployed
 * vault, so the route returns prepared calldata for the org's account
 * to broadcast.
 */
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/tezcatli/cashout-cosign",
  tags: ["org-tier"],
  summary: "Build a Tezcatli withdraw (cash-out) calldata blob",
  description:
    "Org-key-gated. Returns the encoded calldata for `withdraw(token, shares, " +
    "recipient)` on the chain's Tezcatli vault. The broadcaster must be the " +
    "position owner — the vault keys positions by `msg.sender`.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TezcatliCashoutCosignReqSchema } },
    },
  },
  responses: {
    200: { description: "Cosign payload.", content: { "application/json": { schema: TezcatliCosignResponseSchema } } },
    400: { description: "Validation failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
    401: { description: "Org auth failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
    500: { description: "Build failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  // OPEN endpoint (retail + B2B). Per-call auth comes from the contract:
  // every accepted op carries a P-256 sig the on-chain validator verifies.
  const finalize = async (_n: number) => {};
  try {
    const raw = await req.json();
    const parsed = TezcatliCashoutCosignReqSchema.safeParse(raw);
    if (!parsed.success) {
      await finalize(400);
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, token, shares, recipient } = parsed.data;
    const { to, data } = buildWithdrawCalldata(chainId, token as Address, BigInt(shares), recipient as Address);
    await finalize(200);
    return NextResponse.json(
      {
        chainId,
        to,
        data,
        value: "0",
        note: "withdraw(token, shares, recipient) — caller must be the position owner.",
      },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    await finalize(500);
    return NextResponse.json(
      { error: e.message ?? "cosign failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
