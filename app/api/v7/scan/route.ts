/**
 * /api/v7/scan — manual trigger for the V7 indexer.
 *
 * F-1 fix: indexV7Chain() + indexStealthInbound() are exported from
 * lib/indexer/indexer-v7.ts but no route invoked them — `/api/v7/stealth/inbound`
 * was reading a table production never populated. This route closes the loop:
 *   POST /api/v7/scan?chainId=<id>[&maxMs=<ms>]
 * Idempotent. Bounded by maxMs (default 8s; well under Vercel's 10s limit).
 *
 * Pair with a vercel.json cron entry (`/api/v7/scan?chainId=…` every minute)
 * for hands-off operation, or call manually from the dashboard/CLI for a
 * freshness-on-demand UX.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { indexV7Chain } from "@/lib/indexer/indexer-v7";
import { v7Deployment } from "@/lib/relayer/v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { ErrorResponseSchema } from "@/lib/openapi/schemas-v7";

const ScanResponseSchema = z
  .object({
    ok: z.literal(true),
    chainId: z.number().int(),
    ms: z.number().int().openapi({ description: "Wall-clock duration of the scan" }),
  })
  .openapi("ScanResponse");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/scan",
  tags: ["infra"],
  summary: "Trigger the V7 event indexer for a chain",
  description:
    "Scans on-chain V7 events (Credited, Spent, MethodEnabled, RecoveryInitiated, " +
    "RecoveryExecuted, NameClaimed, SubdomainClaimed, airdrop Claimed, stealth " +
    "inbound Transfers) into the Turso v7 tables. Bounded by ?maxMs= (default 8000). " +
    "Idempotent — re-running picks up where the last cursor stopped. Designed to be " +
    "called from a cron (every 1 min on Vercel) or manually before a UI refresh.",
  request: {
    query: z.object({
      chainId: z.string().openapi({ description: "EVM chain id" }),
      maxMs: z.string().optional().openapi({ description: "Wall-clock budget; default 8000" }),
    }),
  },
  responses: {
    200: { description: "Scan complete.", content: { "application/json": { schema: ScanResponseSchema } } },
    400: { description: "Missing chainId.", content: { "application/json": { schema: ErrorResponseSchema } } },
    500: { description: "Indexer failure.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const chainIdStr = url.searchParams.get("chainId");
    if (!chainIdStr) {
      return NextResponse.json({ error: "missing chainId" }, { status: 400, headers: v7CorsHeaders });
    }
    const chainId = Number(chainIdStr);
    const maxMs = Number(url.searchParams.get("maxMs") ?? "8000");
    const d = v7Deployment(chainId);
    const t0 = Date.now();
    await indexV7Chain(chainId, d, { maxMs });
    return NextResponse.json(
      { ok: true, chainId, ms: Date.now() - t0 },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "scan failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
