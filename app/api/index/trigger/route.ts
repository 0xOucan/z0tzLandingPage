import { NextRequest, NextResponse } from "next/server";
import { indexChain, etherscanConfigured } from "@/lib/indexer/indexer";
import { isEnabled as tursoEnabled } from "@/lib/indexer/turso";
import { SUPPORTED_CHAINS, type ChainId } from "@/lib/indexer/contracts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * V6.5 deployment block per chain. Used as the fromBlock for a first-time
 * scan when scan_state has no prior cursor. Sourced from
 * contracts/deployments/v6.5-ledger-{chainId}.json. Hard-coded here so the
 * indexer has no compile-time dependency on the contracts package.
 */
const V65_DEPLOY_BLOCK: Record<ChainId, number> = {
  84532: 40_942_604,    // base-sepolia (deployed 2026-05-01)
  11155111: 10_769_757, // eth-sepolia
  421614: 264_507_246,  // arb-sepolia
};

// Vercel hobby = 10s, pro = 60s, pro+max_duration = 300s. We aim for 50s
// budget here so we leave headroom for the response serialization.
const MAX_MS = Number(process.env.INDEXER_MAX_MS ?? "50000");

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/index/trigger
 *   { chainId?: number, sourceKeys?: string[] }
 *
 * If chainId is provided, indexes only that chain. Otherwise iterates
 * all supported chains in series.
 *
 * Returns the per-source result rows so callers can see what advanced.
 * Each result indicates whether the scan was time-truncated — the trigger
 * can be called repeatedly to drain the backlog.
 *
 * Currently OPEN (no auth) since the data is public on chain and we want
 * the fund-stealth route to be able to fire-and-forget into this endpoint
 * without setting up server-to-server auth. Add a shared-secret header
 * before production.
 */
export async function POST(req: NextRequest) {
  if (!tursoEnabled()) {
    return NextResponse.json(
      { error: "Indexer not configured (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)" },
      { status: 500, headers: corsHeaders }
    );
  }
  if (!etherscanConfigured) {
    return NextResponse.json(
      { error: "ETHERSCAN_API_KEY not configured" },
      { status: 500, headers: corsHeaders }
    );
  }

  let body: { chainId?: number; sourceKeys?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults to scan all chains
  }

  const chains = body.chainId
    ? ([body.chainId] as ChainId[]).filter((c) => SUPPORTED_CHAINS.includes(c))
    : SUPPORTED_CHAINS;

  if (chains.length === 0) {
    return NextResponse.json(
      { error: `Chain ${body.chainId} not supported` },
      { status: 400, headers: corsHeaders }
    );
  }

  const startedAt = Date.now();
  const deadline = startedAt + MAX_MS;
  const results: any[] = [];

  for (const chainId of chains) {
    if (Date.now() > deadline) break;
    const remaining = Math.max(2000, deadline - Date.now());
    const out = await indexChain({
      chainId,
      startBlockFallback: V65_DEPLOY_BLOCK[chainId],
      maxMs: remaining,
      sourceKeys: body.sourceKeys,
    });
    results.push(...out);
  }

  return NextResponse.json(
    {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      results,
    },
    { headers: corsHeaders }
  );
}

/**
 * GET /api/index/trigger
 *   Same as POST with no body — scans all supported chains. Handy for
 *   manual one-off triggers via curl and for the Vercel Cron Jobs runner
 *   (which only supports GET).
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
