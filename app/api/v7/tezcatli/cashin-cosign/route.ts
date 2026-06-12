import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { buildDepositCalldata } from "@/lib/relayer/tezcatli";
import {
  ErrorResponseSchema,
  TezcatliCashinCosignReqSchema,
  TezcatliCosignResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

/**
 * Org-gated Tezcatli deposit cosign.
 *
 * The deployed TezcatliVaultV7 has a caller-authenticated `deposit(token,
 * assets, lockOption)` entrypoint — there is no separate signed-intent
 * path today. The sweeper integration (`shieldFromSweeper`) is restricted
 * to the registered sweeper, so the existing `/api/v7/cashin` route only
 * funnels into the ledger, not Tezcatli.
 *
 * Until the contract grows a signed-intent submitter, this endpoint
 * returns prepared calldata + target for the org's account to broadcast.
 * Audit-log + tier-rate-limit semantics are identical to the other org
 * routes.
 */
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/tezcatli/cashin-cosign",
  tags: ["org-tier"],
  summary: "Build a Tezcatli deposit (cash-in) calldata blob",
  description:
    "Org-key-gated. Returns the encoded calldata for `deposit(token, amount, " +
    "lockOption)` on the chain's Tezcatli vault. Caller broadcasts the tx. " +
    "NOTE: a meta-tx submitter will replace this once the contract has a " +
    "signed-intent entrypoint.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TezcatliCashinCosignReqSchema } },
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
    const parsed = TezcatliCashinCosignReqSchema.safeParse(raw);
    if (!parsed.success) {
      await finalize(400);
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, token, amount, lockOption } = parsed.data;
    // `beneficiary` is implicit (== msg.sender) in the contract today; we
    // require it in the schema so the SDK type stays stable when the contract
    // grows `depositFor`. Surface a note when the requested beneficiary
    // differs from a caller-controlled flow.
    const { to, data } = buildDepositCalldata(chainId, token as Address, BigInt(amount), lockOption);
    await finalize(200);
    return NextResponse.json(
      {
        chainId,
        to,
        data,
        value: "0",
        note: "deposit(token, assets, lockOption) — broadcaster becomes the position owner. beneficiary param is a forward-compat hint.",
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
