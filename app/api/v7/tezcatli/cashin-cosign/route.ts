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
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

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

export const POST = withApiLog("/api/v7/tezcatli/cashin-cosign", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = TezcatliCashinCosignReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  try {
    const { chainId, token, amount, lockOption } = parsed.data;
    ctx.chainId = chainId;
    const { to, data } = buildDepositCalldata(chainId, token as Address, BigInt(amount), lockOption);
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
    ctx.errorCode = "cosign_failed";
    return errorResponse(500, "cosign_failed", v7CorsHeaders, e);
  }
});
