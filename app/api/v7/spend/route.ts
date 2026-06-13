import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitSpend, type SpendReq } from "@/lib/relayer/v7";
import {
  ErrorResponseSchema,
  SpendReqSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// ── OpenAPI registration (side-effect on module import) ─────────────────
//
// Reference template for the other 6 V7 routes — same shape:
//   1. registerPath with the request body's zod schema + response schemas.
//   2. Use SAME schema for runtime validation inside POST.
// docs (generated) and behavior (runtime) literally share the source of
// truth, so they cannot drift.
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/spend",
  tags: ["user-tier"],
  summary: "Relay a signed ledger spend (cashout, internal, cross-chain)",
  description:
    "Submits a P-256-signed SpendOp to Z0tzLedgerV7 on the destination chain. " +
    "The relayer pays gas. The user authenticates per-call by signing the body " +
    "with their passkey (X-Z0tz-Sig header).",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SpendReqSchema } },
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

// ── Route handlers ──────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/spend", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  // OPEN endpoint (retail + B2B). Per-call auth comes from the contract:
  // every accepted op carries a P-256 sig the on-chain validator verifies.
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = SpendReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { chainId, op } = parsed.data;
  ctx.chainId = chainId;
  try {
    const { txHash } = await submitSpend(chainId, op as unknown as SpendReq);
    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
