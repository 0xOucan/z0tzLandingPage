import { NextRequest, NextResponse } from "next/server";
import {
  indexChain,
  indexStealthFollowups,
  indexDefiVaults,
  etherscanConfigured,
} from "@/lib/indexer/indexer";
import { isEnabled as tursoEnabled } from "@/lib/indexer/turso";
import { SUPPORTED_CHAINS, type ChainId } from "@/lib/indexer/contracts";

/**
 * Vercel function duration cap. Hobby tier allows up to 60s (with this
 * export) — without it the default is 10s and the first backfill can't
 * complete a meaningful chunk before being killed. Pro tier can go to
 * 300s; bump this if you're on Pro and want longer per-call windows.
 */
export const maxDuration = 60;

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

// Internal soft deadline. Slightly less than maxDuration so we exit
// gracefully and serialize the response before Vercel hard-kills us.
// Hobby's 60s ceiling - 8s response margin = 52s default; user can set
// INDEXER_MAX_MS to override (e.g. 280_000 on Pro+max_duration=300).
const MAX_MS = Number(process.env.INDEXER_MAX_MS ?? "52000");

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
  if (!etherscanConfigured()) {
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
  const followups: any[] = [];

  // Tier 1: global event sources (sweeper/vault/ledger/factory/entrypoint).
  // Bounded contract address sets → topic0-only scans are cheap.
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

  const wantFollowups = !body.sourceKeys || body.sourceKeys.length === 0;

  // Tier 3 BEFORE Tier 2: per-vault DeFi scanner. This is BOUNDED work
  // (1-2 vaults × 2 directions per chain) — runs in ~5-10s total across
  // all chains, even on a cold first scan. Putting it ahead of the
  // followup pass guarantees vault data lands quickly. The followup pass
  // (Tier 2) is the one that takes ~50s on busy chains and can hog the
  // budget if it goes first.
  const vaultResults: any[] = [];
  if (wantFollowups) {
    for (const chainId of chains) {
      if (Date.now() > deadline) break;
      // Cap per-chain vault budget at 10s so we don't starve Tier 2.
      const remaining = Math.min(10_000, Math.max(2000, deadline - Date.now()));
      const out = await indexDefiVaults({ chainId, maxMs: remaining });
      vaultResults.push(...out);
    }
  }

  // Tier 2: stealth-followup scanner (USDC.Transfer + CCTP.DepositForBurn).
  // Runs LAST because per-stealth scans dominate the budget on busy
  // chains. Each call drains what fits; the next trigger picks up.
  if (wantFollowups) {
    for (const chainId of chains) {
      if (Date.now() > deadline) break;
      const remaining = Math.max(2000, deadline - Date.now());
      const out = await indexStealthFollowups({ chainId, maxMs: remaining });
      followups.push(out);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      results,
      followups,
      vaults: vaultResults,
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
