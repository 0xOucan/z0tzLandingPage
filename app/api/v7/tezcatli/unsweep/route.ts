import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitTezcatliWithdraw, type TezcatliWithdrawReq } from "@/lib/relayer/v7";
import {
  TezcatliWithdrawReqSchema,
  ErrorResponseSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/tezcatli/unsweep",
  tags: ["user-tier"],
  summary: "Relay a signed gasless exit out of the Tezcatli yield vault",
  description:
    "V7-FINAL-2: submits a P-256-signed sweepFromTezcatli that burns the " +
    "caller's Tezcatli (Aave V3) position shares and forwards the underlying " +
    "to a fresh one-time destStealth. The position is owned by the user's " +
    "smart account; authorization is the account's passkey signature over the " +
    "withdraw digest (raw keccak, verified vs the account's current owner). " +
    "No cash-in fee on the exit. The relayer pays gas.",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TezcatliWithdrawReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Malformed body, missing fields, or on-chain simulation revert.",
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

export const POST = withApiLog("/api/v7/tezcatli/unsweep", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = TezcatliWithdrawReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { chainId, withdraw } = parsed.data;
  ctx.chainId = chainId;
  try {
    const { txHash } = await submitTezcatliWithdraw(chainId, withdraw as unknown as TezcatliWithdrawReq);
    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    // bug-4 pattern: on-chain simulation revert → 400 (not 500), reason surfaced.
    const msg = String(e?.message ?? e);
    if (msg.startsWith("onchain_simulation_failed")) {
      ctx.errorCode = "onchain_simulation_failed";
      return NextResponse.json({ error: msg, code: "onchain_simulation_failed" }, { status: 400, headers: v7CorsHeaders });
    }
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
