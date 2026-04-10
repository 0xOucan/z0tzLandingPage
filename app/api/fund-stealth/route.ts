import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
};

const RPCS: Record<number, string> = {
  84532: "https://base-sepolia-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  421614: "https://arbitrum-sepolia-rpc.publicnode.com",
};

// Rate limit: max requests per IP per hour (set via FUND_STEALTH_LIMIT env, default 50)
const FUND_LIMIT = Number(process.env.FUND_STEALTH_LIMIT ?? "50");
const fundLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = Date.now();
  const entry = fundLimitMap.get(ip);
  if (entry && now < entry.resetAt && entry.count >= FUND_LIMIT) {
    return NextResponse.json({ success: false, error: `Rate limit: max ${FUND_LIMIT} stealth funds per hour` }, { status: 429, headers: corsHeaders });
  }
  if (!entry || now > (entry?.resetAt ?? 0)) {
    fundLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
  } else {
    entry.count++;
  }

  try {
    const { stealthAddress, chainId } = await req.json();
    if (!stealthAddress || !chainId) {
      return NextResponse.json({ success: false, error: "Missing stealthAddress or chainId" }, { status: 400, headers: corsHeaders });
    }

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ success: false, error: "Relayer not configured" }, { status: 500, headers: corsHeaders });
    }

    const chain = CHAINS[chainId];
    const rpc = RPCS[chainId];
    if (!chain || !rpc) {
      return NextResponse.json({ success: false, error: `Chain ${chainId} not supported` }, { status: 400, headers: corsHeaders });
    }

    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const client = createPublicClient({ chain, transport: http(rpc) });
    const wallet = createWalletClient({ account, chain, transport: http(rpc) });

    // Check if stealth already has ETH
    const balance = await client.getBalance({ address: stealthAddress as Address });
    if (balance > parseEther("0.00001")) {
      return NextResponse.json({ success: true, txHash: "already-funded", message: "Stealth already has ETH" }, { headers: corsHeaders });
    }

    // Estimate gas cost for stealth operations:
    // Private faucet: approve (~65K) + privateSweep (~800K) + ETH return (~21K) ≈ 900K
    // Cashout/bridge: unshield (~500K) + claim (~200K) + lock/send (~200K) + ETH return (~21K) ≈ 1M
    // Use 1.5M as safe upper bound
    const gasPrice = await client.getGasPrice();
    const estimatedCost = gasPrice * 1_500_000n;
    // Add 50% buffer
    const fundAmount = estimatedCost + (estimatedCost / 2n);
    // Min 0.0001 ETH, max 0.05 ETH (L1 needs more ETH due to higher gas prices)
    const MIN = parseEther("0.0001");
    const MAX = parseEther("0.05");
    const amount = fundAmount < MIN ? MIN : fundAmount > MAX ? MAX : fundAmount;

    const hash = await wallet.sendTransaction({
      to: stealthAddress as Address,
      value: amount,
    });

    await client.waitForTransactionReceipt({ hash });

    return NextResponse.json({ success: true, txHash: hash }, { headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
