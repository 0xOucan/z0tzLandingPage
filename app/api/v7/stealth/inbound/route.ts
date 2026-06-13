import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getInboundForPubkey } from "@/lib/indexer/turso-v7";
import {
  ErrorResponseSchema,
  StealthInboundResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

/**
 * List inbound funds across all chains for a user's watched stealth addresses.
 * The GUI re-derives its pubkeyHash from the passkey and reads this to show
 * "you received X on chain Y" + a one-tap sweep. Public data only.
 */

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/stealth/inbound",
  tags: ["user-tier"],
  summary: "List inbound stealth-address transfers for a pubkeyHash",
  description:
    "Returns every ERC-20 transfer the indexer has seen to any stealth " +
    "address registered under ?pubkeyHash=, across all supported chains. " +
    "Public data; no auth needed (the pubkeyHash itself is the read capability).",
  request: {
    query: z.object({
      pubkeyHash: z.string().openapi({ description: "0x-prefixed 32-byte pubkey hash" }),
    }),
  },
  responses: {
    200: {
      description: "List of inbound rows (may be empty).",
      content: { "application/json": { schema: StealthInboundResponseSchema } },
    },
    400: {
      description: "Missing pubkeyHash query param.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const GET = withApiLog("/api/v7/stealth/inbound", async (req: NextRequest, ctx) => {
  try {
    const pubkeyHash = new URL(req.url).searchParams.get("pubkeyHash");
    if (!pubkeyHash) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "missing pubkeyHash" }, { status: 400, headers: v7CorsHeaders });
    }
    const inbound = await getInboundForPubkey(pubkeyHash);
    return NextResponse.json({ inbound }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "fetch_failed";
    return errorResponse(500, "fetch_failed", v7CorsHeaders, e);
  }
});
