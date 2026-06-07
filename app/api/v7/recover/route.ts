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

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  if (!isEnabled())
    return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
  try {
    const rawBody = await req.json();
    const parsed = RecoverReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const data = parsed.data;
    if (data.action === "initiate") {
      const { chainId, account, methodIndex, newOwnerX, newOwnerY, proof } = data;
      const { txHash } = await submitRecoverInitiate(chainId, {
        account: account as `0x${string}`,
        methodIndex,
        newOwnerX,
        newOwnerY,
        proof: proof as `0x${string}`,
      });
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    if (data.action === "execute") {
      const { txHash } = await submitRecoverExecute(data.chainId, { recoveryId: data.recoveryId });
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400, headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "submit failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
