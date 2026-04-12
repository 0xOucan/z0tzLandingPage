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
    const { stealthAddress, chainId, gasNeeded, ethNeeded } = await req.json();
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

    // If the client pre-calculated the exact ETH needed, use that directly.
    // Otherwise fall back to gasNeeded-based estimation.
    const gasPrice = await client.getGasPrice();
    let targetBalance: bigint;
    if (ethNeeded) {
      // Client already calculated precise ETH amount with proper fee estimation
      targetBalance = BigInt(ethNeeded);
    } else {
      const gasEstimate = gasNeeded ? BigInt(gasNeeded) : 2_000_000n;
      targetBalance = gasPrice * gasEstimate * 2n;
    }
    // When ethNeeded is provided, the client already calculated precisely with
    // L1 data fees and proper gas estimation — respect the exact amount.
    // Only apply MIN/MAX for the legacy gasNeeded path.
    const isPrecise = !!ethNeeded;
    const MIN = isPrecise ? parseEther("0.000001") : parseEther("0.0001");
    const MAX = parseEther("0.05");

    // Check if stealth already has enough ETH
    const balance = await client.getBalance({ address: stealthAddress as Address });
    if (balance >= targetBalance) {
      return NextResponse.json({ success: true, txHash: "already-funded", message: `Stealth already has ${balance} wei (target: ${targetBalance})` }, { headers: corsHeaders });
    }

    // Fund the difference (or at least the target)
    const deficit = targetBalance > balance ? targetBalance - balance : targetBalance;
    const amount = deficit < MIN ? MIN : deficit > MAX ? MAX : deficit;

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
