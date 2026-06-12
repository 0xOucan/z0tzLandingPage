import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Address } from "viem";
import { readPosition } from "@/lib/relayer/tezcatli";
import {
  ErrorResponseSchema,
  TezcatliPositionResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/tezcatli/position",
  tags: ["user-tier"],
  summary: "Tezcatli position for an (account, token) pair",
  description:
    "Returns principal / shares / grossPosition / pendingYield / pendingFeeBps / " +
    "withdrawUnlockAt / lockOption for a user's Tezcatli position. Open access — " +
    "this is all public on-chain data.",
  request: {
    query: z.object({
      account: z.string().openapi({ description: "Position owner" }),
      token: z.string().openapi({ description: "Underlying token" }),
      chainId: z.string().openapi({ description: "EVM chain id" }),
    }),
  },
  responses: {
    200: { description: "Position.", content: { "application/json": { schema: TezcatliPositionResponseSchema } } },
    400: { description: "Missing or malformed query.", content: { "application/json": { schema: ErrorResponseSchema } } },
    500: { description: "Read failure.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const account = sp.get("account");
    const token = sp.get("token");
    const chainIdStr = sp.get("chainId");
    if (!account || !ADDRESS_RE.test(account))
      return NextResponse.json({ error: "missing or invalid account" }, { status: 400, headers: v7CorsHeaders });
    if (!token || !ADDRESS_RE.test(token))
      return NextResponse.json({ error: "missing or invalid token" }, { status: 400, headers: v7CorsHeaders });
    if (!chainIdStr)
      return NextResponse.json({ error: "missing chainId" }, { status: 400, headers: v7CorsHeaders });
    const chainId = Number(chainIdStr);
    const pos = await readPosition(chainId, account as Address, token as Address);
    return NextResponse.json(
      { chainId, account, token, ...pos },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "read failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
