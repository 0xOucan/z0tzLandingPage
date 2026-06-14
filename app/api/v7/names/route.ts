import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitNameClaim, ONCHAIN_SIM_FAILED, type NameClaimReq } from "@/lib/relayer/v7";
import {
  ErrorResponseSchema,
  NameClaimReqSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { checkReserved } from "@/lib/relayer/reserved-names";
import { consumeToken, callerIpKey, type Tier } from "@/lib/relayer/rate-limit";
import { withApiLog } from "@/lib/relayer/request-log";

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/names",
  tags: ["user-tier"],
  summary: "Relay a signed Z0tz-name claim",
  description:
    "Submits a P-256-signed name-claim binding a human-readable name to the " +
    "caller's smart account. The relayer pays gas; the user authenticates " +
    "per-call by signing the body with their passkey.",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NameClaimReqSchema } },
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
    429: {
      description: "Rate limit exceeded for this caller.",
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

export const POST = withApiLog("/api/v7/names", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  if (!isEnabled()) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }

  // Tier defaults to sandbox until org auth is wired in here.
  const tier: Tier = "sandbox";
  const rateKey = `${callerIpKey(req)}|names`;
  const allowed = await consumeToken(rateKey, tier);
  if (!allowed) {
    ctx.errorCode = "rate_limited";
    return errorResponse(429, "rate_limited", v7CorsHeaders);
  }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }

  const parsed = NameClaimReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed",
      },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { chainId, claim } = parsed.data;
  ctx.chainId = chainId;

  // C-1 sanity gate: reject obviously-unsigned / all-zero garbage so the
  // relayer never pays gas on a contract revert.
  try {
    const pkX = BigInt(claim.pubX);
    const pkY = BigInt(claim.pubY);
    const sigR = BigInt(claim.sigR);
    const sigS = BigInt(claim.sigS);
    const nameLen = BigInt(claim.nameLength);
    const ZERO = BigInt(0);
    const ONE = BigInt(1);
    const MAX_NAME = BigInt(32);
    if ((pkX === ZERO && pkY === ZERO) || sigR === ZERO || sigS === ZERO || nameLen < ONE || nameLen > MAX_NAME) {
      ctx.errorCode = "invalid_claim";
      return NextResponse.json(
        { error: "invalid claim (zero pubkey/sig or out-of-range name length)", code: "invalid_claim" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
  } catch {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: "invalid bigint field", code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }

  // C-1 reserved-names policy: hard-blocked refused outright; soft-blocked
  // requires a verified tier we don't have here yet, so it's refused too.
  const decision = checkReserved(claim.name, tier);
  if (!decision.allow) {
    ctx.errorCode = "name_reserved";
    return NextResponse.json(
      { error: `name reserved (${decision.reason})`, code: "name_reserved" },
      { status: 400, headers: v7CorsHeaders },
    );
  }

  try {
    const { txHash } = await submitNameClaim(chainId, claim as unknown as NameClaimReq);
    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    // Bug 4 fix: pre-broadcast simulation revert → 400 with revert reason.
    const msg = String(e?.message ?? e);
    if (msg.startsWith(ONCHAIN_SIM_FAILED)) {
      const reason = msg.slice(ONCHAIN_SIM_FAILED.length + 2);
      ctx.errorCode = ONCHAIN_SIM_FAILED;
      return NextResponse.json(
        { error: reason, code: ONCHAIN_SIM_FAILED },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
