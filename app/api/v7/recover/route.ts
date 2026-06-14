import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitRecoverInitiate, submitRecoverExecute } from "@/lib/relayer/v7";
import { z } from "zod";
import {
  ErrorResponseSchema,
  RecoverExecuteReqSchema,
  RecoverInitiateReqSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// Permissionless recovery: the proof itself is the authorization (the relayer
// just pays gas). `action` dispatches between initiate and execute legs.
const RecoverReqSchema = z
  .union([RecoverInitiateReqSchema, RecoverExecuteReqSchema])
  .openapi("RecoverRequest");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/recover",
  tags: ["user-tier"],
  summary: "Relay a permissionless recovery (initiate or execute)",
  description:
    "Submits either an `initiate` (start the timelocked recovery using a " +
    "method-specific proof) or `execute` (finalize after the timelock) " +
    "transaction. Permissionless — the proof itself is the authorization, " +
    "so this route is unauthenticated; the relayer only pays gas.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecoverReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Malformed body, missing required fields, or unknown action.",
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

export const POST = withApiLog("/api/v7/recover", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const parsed = RecoverReqSchema.safeParse(json.value);
    if (!parsed.success) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const data = parsed.data;
    if (data.action === "initiate") {
      const { chainId, account, methodIndex, newOwnerX, newOwnerY, proof } = data;
      ctx.chainId = chainId;
      const { txHash } = await submitRecoverInitiate(chainId, {
        account: account as `0x${string}`,
        methodIndex,
        newOwnerX,
        newOwnerY,
        proof: proof as `0x${string}`,
      });
      ctx.txHash = txHash;
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    if (data.action === "execute") {
      ctx.chainId = data.chainId;
      const { txHash } = await submitRecoverExecute(data.chainId, { recoveryId: data.recoveryId });
      ctx.txHash = txHash;
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    ctx.errorCode = "unknown_action";
    return NextResponse.json({ error: "unknown action" }, { status: 400, headers: v7CorsHeaders });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.startsWith("onchain_simulation_failed")) {
      ctx.errorCode = "onchain_simulation_failed";
      return NextResponse.json({ error: msg, code: "onchain_simulation_failed" }, { status: 400, headers: v7CorsHeaders });
    }
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
