import { NextRequest, NextResponse } from "next/server";
import {
  ensureSchema,
  isEnabled as tursoEnabled,
  getRecentOpCostMedian,
} from "@/lib/indexer/turso";

/**
 * GET /api/relayer/quote-fee
 *   ?chainId=84532
 *   &opKind=ledger-sweep             (which on-chain op the user is about to pay for)
 *   &grossAmountMicros=19800000      (USDC micro-units the user is moving)
 *   &baseFeeBps=100                  (optional override; default 100 = 1%)
 *
 * Returns a fee quote the GUI should encode into the sweeper digest:
 *   {
 *     baseFeeUsdcMicros:   number,   // amount × baseFeeBps / 10000 (ceil)
 *     overheadUsdcMicros:  number,   // measured op cost × markup (cost-recovery)
 *     totalFeeUsdcMicros:  number,   // baseFee + overhead
 *     effectiveFeeBps:     number,   // ceil(total * 10000 / amount) — what the digest signs
 *     overheadSource:      "median" | "fallback",
 *   }
 *
 * **Privacy-preserving by construction:** the endpoint takes ZERO
 * per-user inputs (no ownerX/ownerY, no smart-account address). The
 * overhead is computed from a rolling median of recent anonymous op
 * costs in the same chain × op-kind bucket, so the fee covers the
 * protocol's measured marginal cost regardless of which user is
 * asking. No row in the indexer DB links a user to their spend.
 *
 * Markup: default 1.5× (50% margin) so the protocol nets a small
 * profit even when gas spikes between quote and execution. Override
 * via QUOTE_OVERHEAD_MARKUP env (e.g., "1.25" for tighter margin).
 *
 * Fallback values when the cost log has no data for the bucket:
 * conservative defaults per op kind, configurable via env.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Default base fee in BPS, positioning between Railgun (0.25% one-way,
// 0.5% round-trip) and the gas-only privacy chains. 25 BPS = 0.25% per
// op; cash-in + cash-out = 0.5% round-trip, matching Railgun.
// Operators can override per-deployment via QUOTE_BASE_FEE_BPS env.
const DEFAULT_BASE_FEE_BPS = Number(process.env.QUOTE_BASE_FEE_BPS ?? "25");
const DEFAULT_MARKUP = 1.5;

/**
 * Fallback per-op overhead in USDC micros, used when there's not
 * enough data in relayer_op_costs for the (chain, op_kind) bucket
 * yet. Defaults targeting ~$0.02-0.05 per op — in line with
 * Aztec / Iron Fish, lower than Tornado, materially under any
 * % fee on a small transfer. Override per-bucket via env.
 */
const FALLBACK_OVERHEAD_MICROS: Record<string, number> = {
  "fund-stealth":    Number(process.env.QUOTE_FALLBACK_USDC_MICROS_FUND_STEALTH ?? "5000"),    // $0.005
  "ledger-sweep":    Number(process.env.QUOTE_FALLBACK_USDC_MICROS_LEDGER_SWEEP ?? "20000"),   // $0.02
  "ledger-op":       Number(process.env.QUOTE_FALLBACK_USDC_MICROS_LEDGER_OP ?? "20000"),      // $0.02
  "relay":           Number(process.env.QUOTE_FALLBACK_USDC_MICROS_RELAY ?? "15000"),          // $0.015
  "bridge":          Number(process.env.QUOTE_FALLBACK_USDC_MICROS_BRIDGE ?? "30000"),         // $0.03
  "private-bridge":  Number(process.env.QUOTE_FALLBACK_USDC_MICROS_PRIVATE_BRIDGE ?? "30000"), // $0.03
  "strategy-deploy": Number(process.env.QUOTE_FALLBACK_USDC_MICROS_STRATEGY_DEPLOY ?? "40000"),// $0.04
  "strategy-redeem": Number(process.env.QUOTE_FALLBACK_USDC_MICROS_STRATEGY_REDEEM ?? "40000"),// $0.04
};

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
  const chainId = Number(sp.get("chainId") ?? "0");
  const opKind = sp.get("opKind") ?? "";
  const grossAmountMicros = BigInt(sp.get("grossAmountMicros") ?? "0");
  const baseFeeBps = Number(sp.get("baseFeeBps") ?? String(DEFAULT_BASE_FEE_BPS));
  const markup = Number(process.env.QUOTE_OVERHEAD_MARKUP ?? String(DEFAULT_MARKUP));

  if (!chainId || !opKind || grossAmountMicros <= 0n) {
    return NextResponse.json(
      { error: "missing chainId, opKind, or grossAmountMicros" },
      { status: 400, headers: corsHeaders },
    );
  }

  // Measured median cost for this op kind on this chain.
  const medianMicros = await getRecentOpCostMedian(chainId, opKind, 20);
  let overheadUsdcMicros: number;
  let overheadSource: "median" | "fallback";
  if (medianMicros > 0) {
    overheadUsdcMicros = Math.ceil(medianMicros * markup);
    overheadSource = "median";
  } else {
    overheadUsdcMicros = FALLBACK_OVERHEAD_MICROS[opKind] ?? 20_000;
    overheadSource = "fallback";
  }

  // Base BPS fee on the amount.
  const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
  const baseFeeMicros = Number(ceilDiv(grossAmountMicros * BigInt(baseFeeBps), 10_000n));
  const totalFeeUsdcMicros = baseFeeMicros + overheadUsdcMicros;

  // What feeBps the user must sign in the digest so the on-chain
  // floor-BPS deduction nets at least totalFeeUsdcMicros.
  const effectiveFeeBps =
    grossAmountMicros > 0n
      ? Number(ceilDiv(BigInt(totalFeeUsdcMicros) * 10_000n, grossAmountMicros))
      : 0;

  return NextResponse.json(
    {
      ok: true,
      chainId,
      opKind,
      grossAmountMicros: grossAmountMicros.toString(),
      baseFeeBps,
      baseFeeUsdcMicros: baseFeeMicros,
      overheadUsdcMicros,
      overheadSource,
      totalFeeUsdcMicros,
      effectiveFeeBps,
      markup,
    },
    { headers: corsHeaders },
  );
}
