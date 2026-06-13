import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Address } from "viem";
import { readTotals } from "@/lib/relayer/tezcatli";
import {
  ErrorResponseSchema,
  TezcatliTotalsResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/tezcatli/totals",
  tags: ["user-tier"],
  summary: "Tezcatli vault TVL totals for a token",
  description:
    "Returns totalAssetsOf + totalSharesOf for a given (chain, token). Used by the " +
    "internal dashboard for TVL aggregation. Open access — all public on-chain data.",
  request: {
    query: z.object({
      chainId: z.string().openapi({ description: "EVM chain id" }),
      token: z.string().openapi({ description: "Underlying token" }),
    }),
  },
  responses: {
    200: { description: "Totals.", content: { "application/json": { schema: TezcatliTotalsResponseSchema } } },
    400: { description: "Missing or malformed query.", content: { "application/json": { schema: ErrorResponseSchema } } },
    500: { description: "Read failure.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const GET = withApiLog("/api/v7/tezcatli/totals", async (req: NextRequest, ctx) => {
  try {
    const sp = new URL(req.url).searchParams;
    const chainIdStr = sp.get("chainId");
    const token = sp.get("token");
    if (!chainIdStr) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "missing chainId" }, { status: 400, headers: v7CorsHeaders });
    }
    if (!token || !ADDRESS_RE.test(token)) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "missing or invalid token" }, { status: 400, headers: v7CorsHeaders });
    }
    const chainId = Number(chainIdStr);
    ctx.chainId = chainId;
    const totals = await readTotals(chainId, token as Address);
    return NextResponse.json({ chainId, token, ...totals }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "read_failed";
    return errorResponse(500, "read_failed", v7CorsHeaders, e);
  }
});
