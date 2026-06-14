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
import { errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog, type LoggedContext } from "@/lib/relayer/request-log";

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

async function runScan(req: NextRequest, ctx: LoggedContext): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const chainIdStr = url.searchParams.get("chainId");
    if (!chainIdStr) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "missing chainId" }, { status: 400, headers: v7CorsHeaders });
    }
    const chainId = Number(chainIdStr);
    ctx.chainId = chainId;
    const maxMs = Number(url.searchParams.get("maxMs") ?? "8000");
    const d = v7Deployment(chainId);
    const t0 = Date.now();
    await indexV7Chain(chainId, d, { maxMs });
    return NextResponse.json(
      { ok: true, chainId, ms: Date.now() - t0 },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    ctx.errorCode = "scan_failed";
    return errorResponse(500, "scan_failed", v7CorsHeaders, e);
  }
}

export const POST = withApiLog("/api/v7/scan", runScan);

// Vercel cron invokes the scheduled path with GET. Same logic. If CRON_SECRET
// is set, require it (Vercel sends x-vercel-cron + the bearer for crons);
// otherwise allow — the indexer only writes public on-chain data, idempotently.
export const GET = withApiLog("/api/v7/scan", async (req: NextRequest, ctx) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const isVercelCron = req.headers.get("x-vercel-cron") != null;
    if (!isVercelCron && auth !== `Bearer ${secret}`) {
      ctx.errorCode = "unauthorized";
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: v7CorsHeaders });
    }
  }
  return runScan(req, ctx);
});
