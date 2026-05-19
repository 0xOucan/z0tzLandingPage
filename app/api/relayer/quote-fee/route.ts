import { NextRequest, NextResponse } from "next/server";
import { client, ensureSchema, isEnabled as tursoEnabled, getUserDebtMicros } from "@/lib/indexer/turso";
import { identityRootFor } from "@/lib/relayer/cost-tracker";

/**
 * GET /api/relayer/quote-fee?ownerX=0x…&ownerY=0x…&chainId=84532&grossAmountMicros=19800000
 *
 * Returns the fee the user should sign for at cashout time:
 *   {
 *     baseFeeBps:        number,   // current sweeper BPS (e.g. 100 for 1%)
 *     debtUsdcMicros:    number,   // accrued op-debt to settle, signed
 *     totalFeeUsdcMicros number,   // baseFee(amount) + debt
 *     effectiveFeeBps:   number,   // ceil(totalFee * 10000 / amount)
 *     etag:              string,   // identityRoot+chainId+amount hash; useful to detect stale quotes
 *   }
 *
 * Used by the GUI to display the breakdown to the user BEFORE asking
 * them to sign. The chosen effectiveFeeBps is what the GUI sets in
 * the sweeper digest so the on-chain fee deduction matches what we
 * just quoted.
 *
 * Open endpoint (testnet posture). Data revealed is trivially derivable
 * by the relayer anyway — no privacy gain from gating it.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_BASE_FEE_BPS = 100; // 1% — matches V6.5 sweeper defaults

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  if (!tursoEnabled()) {
    return NextResponse.json(
      { error: "indexer not configured" },
      { status: 500, headers: corsHeaders },
    );
  }
  await ensureSchema();

  const sp = req.nextUrl.searchParams;
  const ownerX = sp.get("ownerX") ?? "";
  const ownerY = sp.get("ownerY") ?? "";
  const chainId = Number(sp.get("chainId") ?? "0");
  const grossAmountMicros = BigInt(sp.get("grossAmountMicros") ?? "0");
  const baseFeeBps = Number(sp.get("baseFeeBps") ?? String(DEFAULT_BASE_FEE_BPS));

  if (!chainId || grossAmountMicros <= 0n) {
    return NextResponse.json(
      { error: "missing chainId or grossAmountMicros" },
      { status: 400, headers: corsHeaders },
    );
  }

  // Identity root — drives the debt lookup. If owner X/Y not given,
  // assume an anonymous quote and skip debt.
  let debtUsdcMicros = 0;
  let identityRoot: string | null = null;
  if (ownerX && ownerY) {
    try {
      identityRoot = identityRootFor(ownerX, ownerY);
      debtUsdcMicros = await getUserDebtMicros(identityRoot, chainId);
    } catch (e: any) {
      return NextResponse.json(
        { error: `bad owner: ${e?.message ?? e}` },
        { status: 400, headers: corsHeaders },
      );
    }
  }

  // Compute base fee in USDC micros: ceil(amount * bps / 10000).
  const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
  const baseFeeMicros = Number(
    ceilDiv(grossAmountMicros * BigInt(baseFeeBps), 10_000n),
  );
  // Debt is added on top. If debt is negative (credit), it reduces the
  // fee — but we floor the fee at the base BPS to avoid free cashouts.
  const totalFeeUsdcMicros = Math.max(baseFeeMicros, baseFeeMicros + debtUsdcMicros);
  // Effective bps: round UP so the on-chain fee deduction never falls
  // short of what we quoted. Sweeper uses floor BPS math, but the
  // user signs the digest with feeBps = ceiledBps, so the actual fee
  // sent is `amount * ceiledBps / 10000` ≥ totalFeeUsdcMicros.
  const effectiveFeeBps =
    grossAmountMicros > 0n
      ? Number(
          ceilDiv(BigInt(totalFeeUsdcMicros) * 10_000n, grossAmountMicros),
        )
      : 0;

  return NextResponse.json(
    {
      ok: true,
      identityRoot,
      chainId,
      grossAmountMicros: grossAmountMicros.toString(),
      baseFeeBps,
      baseFeeUsdcMicros: baseFeeMicros,
      debtUsdcMicros,
      totalFeeUsdcMicros,
      effectiveFeeBps,
    },
    { headers: corsHeaders },
  );
}
