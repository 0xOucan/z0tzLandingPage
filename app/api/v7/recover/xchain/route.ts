import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import {
  isEnabled,
  submitRecoverAttestXChain,
  submitRecoverExecuteXChain,
  submitRecoverCancelXChain,
} from "@/lib/relayer/v7";
import { z } from "zod";
import {
  ErrorResponseSchema,
  RecoverAttestXChainReqSchema,
  RecoverExecuteXChainReqSchema,
  RecoverCancelXChainReqSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// V7-FINAL-2 H-1: two-step cross-chain recovery.
//   attest         — relayer signs the 10-field RECOVERY_ATTEST_TAG digest
//                    (srcChainId, dstChainId, hub, account, newOwnerX/Y,
//                    srcRecoveryId, srcEpoch, dstEpoch) over
//                    toEthSignedMessageHash and calls attestRecoveryForChain,
//                    opening the dest-side timelock.
//   execute-xchain — permissionless; calls executeCrossChainRecovery after the
//                    timelock elapses (re-checks dstEpoch on-chain).
//   cancel-xchain  — owner-veto; the relayer cannot satisfy the contract's
//                    msg.sender==account guard, so this simulates-fails with a
//                    400. Exposed for completeness + future account-signed
//                    relay paths.
const RecoverXChainReqSchema = z
  .union([
    RecoverAttestXChainReqSchema,
    RecoverExecuteXChainReqSchema,
    RecoverCancelXChainReqSchema,
  ])
  .openapi("RecoverXChainRequest");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/recover/xchain",
  tags: ["user-tier"],
  summary: "Relay a cross-chain recovery (attest / execute-xchain / cancel-xchain)",
  description:
    "Two-step cross-chain account recovery (V7-FINAL-2 H-1). `attest` signs " +
    "the 10-field relayer attestation and opens the destination timelock; " +
    "`execute-xchain` finalizes after the timelock (permissionless); " +
    "`cancel-xchain` is the owner veto (relayer call reverts NotAccount).",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RecoverXChainReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the dest-chain tx hash.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Malformed body, unknown action, or on-chain simulation revert.",
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

export const POST = withApiLog("/api/v7/recover/xchain", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const parsed = RecoverXChainReqSchema.safeParse(json.value);
    if (!parsed.success) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const data = parsed.data;
    ctx.chainId = data.chainId;
    if (data.action === "attest") {
      const { txHash } = await submitRecoverAttestXChain(data.chainId, {
        chainId: data.chainId,
        account: data.account as `0x${string}`,
        newOwnerX: data.newOwnerX,
        newOwnerY: data.newOwnerY,
        srcChainId: data.srcChainId,
        srcRecoveryId: data.srcRecoveryId,
        srcEpoch: data.srcEpoch,
      });
      ctx.txHash = txHash;
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    if (data.action === "execute-xchain") {
      const { txHash } = await submitRecoverExecuteXChain(data.chainId, { recoveryId: data.recoveryId });
      ctx.txHash = txHash;
      return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
    }
    if (data.action === "cancel-xchain") {
      const { txHash } = await submitRecoverCancelXChain(data.chainId, { recoveryId: data.recoveryId });
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
