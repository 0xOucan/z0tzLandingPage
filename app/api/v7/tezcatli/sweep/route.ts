import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitTezcatliSweep, type TezcatliSweepReq } from "@/lib/relayer/v7";
import {
  TezcatliSweepReqSchema,
  ErrorResponseSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/tezcatli/sweep",
  tags: ["user-tier"],
  summary: "Relay a signed sweep into the Tezcatli yield vault",
  description:
    "V7-FINAL #10: submits a P-256-signed sweepToTezcatli that drains a " +
    "one-time stealth into the Tezcatli (Aave V3) yield vault with the user's " +
    "smart account as beneficiary. Mirrors /api/v7/cashin but routes to the " +
    "vault instead of the ledger; lockOption picks the deposit lock tier. The " +
    "relayer pays gas; the user authenticates by signing the body with their passkey.",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TezcatliSweepReqSchema } },
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

export const POST = withApiLog("/api/v7/tezcatli/sweep", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = TezcatliSweepReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { chainId, sweep } = parsed.data;
  ctx.chainId = chainId;
  try {
    const { txHash } = await submitTezcatliSweep(chainId, sweep as unknown as TezcatliSweepReq);
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
