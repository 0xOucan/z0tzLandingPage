import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitSweep, type SweepReq } from "@/lib/relayer/v7";
import {
  CashinReqSchema,
  ErrorResponseSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/cashin",
  tags: ["user-tier"],
  summary: "Relay a signed sweep (cash-in stealth → ledger)",
  description:
    "Submits a P-256-signed sweep that drains a one-time cash-in stealth into " +
    "the user's encrypted ledger balance. The relayer pays gas; the user " +
    "authenticates per-call by signing the body with their passkey.",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CashinReqSchema } },
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
  // OPEN endpoint (retail + B2B). Per-call auth comes from the contract:
  // every accepted op carries a P-256 sig the on-chain validator verifies.
  const finalize = async (_n: number) => {};
  try {
    const rawBody = await req.json();
    const parsed = CashinReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      await finalize(400);
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, sweep } = parsed.data;
    const { txHash } = await submitSweep(chainId, sweep as unknown as SweepReq);
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
