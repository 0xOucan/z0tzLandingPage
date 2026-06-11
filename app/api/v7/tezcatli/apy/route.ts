import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readCurrentApyBps } from "@/lib/relayer/tezcatli";
import {
  ErrorResponseSchema,
  TezcatliApyResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/tezcatli/apy",
  tags: ["user-tier"],
  summary: "Current Tezcatli adapter APY",
  description:
    "Returns the deployed Tezcatli adapter's current APY in basis points " +
    "(adapter.currentApyBps()). Open access — APY is public on-chain data. " +
    "Cache cheaply at the edge; this is read by the GUI/CLI for the deposit UX.",
  request: {
    query: z.object({
      chainId: z.string().openapi({ description: "EVM chain id" }),
    }),
  },
  responses: {
    200: { description: "Current APY.", content: { "application/json": { schema: TezcatliApyResponseSchema } } },
    400: { description: "Missing chainId.", content: { "application/json": { schema: ErrorResponseSchema } } },
    500: { description: "Read failure (chain or adapter not deployed).", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const chainIdStr = new URL(req.url).searchParams.get("chainId");
    if (!chainIdStr)
      return NextResponse.json({ error: "missing chainId" }, { status: 400, headers: v7CorsHeaders });
    const chainId = Number(chainIdStr);
    const apyBps = await readCurrentApyBps(chainId);
    const apyPercent = (apyBps / 100).toFixed(2);
    return NextResponse.json({ chainId, apyBps, apyPercent }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "read failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
