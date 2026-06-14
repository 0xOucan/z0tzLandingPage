import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { isBypassRequest } from "@/lib/relayer/bypass";
import { triggerV7ScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// V7 fund-stealth: relayer sends a small ETH top-up to a passkey-derived
// stealth so the stealth can pay for its own approve / unshield / forward
// txs. This is the same pattern V6.5 uses for cashin / cashout / bridge /
// defi flows — the stealth holds the user's tokens but never holds gas
// until the relayer funds it for the duration of a single op.
//
// Production-mode contract: the CLI/GUI/APK derives the stealth from the
// passkey, calls /api/v7/fund-stealth with the exact ETH it needs (gas
// estimate × current gasPrice × safety factor), runs the on-chain op
// signed by the stealth EOA, then transfers the residue (USDC dust + ETH
// dust) back to the relayer (see dust-sweep helper in cli-v7).
//
// Replay / Sybil:
//   - The endpoint is OPEN to retail and B2B (mirrors /api/v7/cashin).
//   - Per-IP hourly cap (override via FUND_STEALTH_LIMIT). Internal callers
//     present X-Z0tz-Bypass to skip rate limits.
//   - MIN / MAX clamps prevent griefing — caller can't drain the relayer
//     with a single call; min is high enough to actually pay for one tx.

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

const FUND_LIMIT = Number(process.env.FUND_STEALTH_LIMIT ?? "500");
const fundLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/fund-stealth", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }

  const bypass = isBypassRequest(req);
  if (!bypass) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const now = Date.now();
    const entry = fundLimitMap.get(ip);
    if (entry && now < entry.resetAt && entry.count >= FUND_LIMIT) {
      ctx.errorCode = "rate_limited";
      return NextResponse.json(
        { error: `Rate limit: max ${FUND_LIMIT} stealth funds per hour` },
        { status: 429, headers: v7CorsHeaders },
      );
    }
    if (!entry || now > (entry?.resetAt ?? 0)) {
      fundLimitMap.set(ip, { count: 1, resetAt: now + 3_600_000 });
    } else {
      entry.count++;
    }
  }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const body = json.value;
    const { chainId, stealthAddress, gasNeeded, ethNeeded } = body ?? {};
    if (!chainId || !stealthAddress) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: "Missing chainId or stealthAddress" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    ctx.chainId = chainId;

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      ctx.errorCode = "relayer_disabled";
      return errorResponse(503, "relayer_disabled", v7CorsHeaders);
    }

    const chain = CHAINS[chainId];
    const rpc = process.env[`RPC_URL_${chainId}`];
    if (!chain || !rpc) {
      ctx.errorCode = "chain_unsupported";
      return NextResponse.json(
        { error: `Chain ${chainId} not supported` },
        { status: 400, headers: v7CorsHeaders },
      );
    }

    const account = privateKeyToAccount(relayerKey as Hex);
    const client = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });

    // Two budget paths:
    //   1) Client pre-computed precise ETH (preferred — accounts for L1 data
    //      fees on rollups). Honored exactly within MIN/MAX clamps.
    //   2) Fallback: gasNeeded × current gasPrice × 2 safety factor.
    const gasPrice = await client.getGasPrice();
    let targetBalance: bigint;
    if (ethNeeded) {
      targetBalance = BigInt(ethNeeded);
    } else {
      const gasEstimate = gasNeeded ? BigInt(gasNeeded) : 2_000_000n;
      targetBalance = gasPrice * gasEstimate * 2n;
    }
    const isPrecise = !!ethNeeded;
    const MIN = isPrecise ? parseEther("0.000001") : parseEther("0.0001");
    const MAX = parseEther("0.05");

    const balance = await client.getBalance({ address: stealthAddress as Address });
    if (balance >= targetBalance) {
      return NextResponse.json(
        { txHash: "already-funded", balance: balance.toString(), target: targetBalance.toString() },
        { headers: v7CorsHeaders },
      );
    }

    const deficit = targetBalance > balance ? targetBalance - balance : targetBalance;
    const amount = deficit < MIN ? MIN : deficit > MAX ? MAX : deficit;

    const txHash = await wallet.sendTransaction({
      to: stealthAddress as Address,
      value: amount,
    });
    await client.waitForTransactionReceipt({ hash: txHash });

    triggerV7ScanAndRecord({
      chainId,
      txHash,
      opKind: "fund-stealth",
      req,
    });

    ctx.txHash = txHash;
    return NextResponse.json(
      { txHash, funded: amount.toString(), relayer: account.address },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    ctx.errorCode = "fund_failed";
    return errorResponse(500, "fund_failed", v7CorsHeaders, e);
  }
});

// GET — returns the relayer EOA address for this chain. The CLI needs it
// as the dust-sweep destination after running the flow at the stealth.
export const GET = withApiLog("/api/v7/fund-stealth", async (_req: NextRequest, ctx) => {
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerKey) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const account = privateKeyToAccount(relayerKey as Hex);
  return NextResponse.json({ relayer: account.address }, { headers: v7CorsHeaders });
});
