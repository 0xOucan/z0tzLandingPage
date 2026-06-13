import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { watchStealth } from "@/lib/indexer/turso-v7";
import {
  ErrorResponseSchema,
  StealthWatchReqSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

/**
 * Register a deterministic stealth address for inbound scanning. The client
 * derives the address from its passkey and sends the PUBLIC address + its
 * pubkeyHash + index — no key material. The indexer then scans every chain
 * for ERC-20 transfers to it.
 */

const OkResponseSchema = z.object({ ok: z.literal(true) }).openapi("StealthWatchOk");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/stealth/watch",
  tags: ["user-tier"],
  summary: "Register a deterministic stealth address for inbound scanning",
  description:
    "Tells the indexer to scan every supported chain for ERC-20 transfers to " +
    "the given stealth address. Only PUBLIC data is sent (the address + the " +
    "pubkeyHash + derivation index) — no key material.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: StealthWatchReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Registered.",
      content: { "application/json": { schema: OkResponseSchema } },
    },
    400: {
      description: "Malformed body or missing required fields.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/stealth/watch", async (req: NextRequest, ctx) => {
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  const parsed = StealthWatchReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  try {
    const { pubkeyHash, address, index } = parsed.data;
    await watchStealth(pubkeyHash, address, Number(index ?? 0));
    return NextResponse.json({ ok: true }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "watch_failed";
    return errorResponse(500, "watch_failed", v7CorsHeaders, e);
  }
});
