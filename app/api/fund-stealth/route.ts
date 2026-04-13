import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig",
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

/** Verify P-256 passkey auth from request headers. Returns null if no auth (backward compat). */
function verifyAuth(req: NextRequest, body: Record<string, unknown>): { valid: boolean; legacy: boolean; error?: string } {
  const pubX = req.headers.get("x-z0tz-pubx");
  const pubY = req.headers.get("x-z0tz-puby");
  const sigHex = req.headers.get("x-z0tz-sig");
  if (!pubX || !pubY) return { valid: true, legacy: true }; // no auth = backward compat
  if (!sigHex || sigHex.replace(/^0x/, "").length !== 128) return { valid: false, legacy: false, error: "Invalid signature" };
  try {
    const xBytes = hexToBytes(pubX); const yBytes = hexToBytes(pubY);
    if (xBytes.length !== 32 || yBytes.length !== 32) return { valid: false, legacy: false, error: "Invalid public key" };
    const { signature: _s, ...bodyNoSig } = body;
    const canonical = JSON.stringify(bodyNoSig, Object.keys(bodyNoSig).sort());
    const message = sha256(new TextEncoder().encode(canonical));
    const clean = sigHex.replace(/^0x/, "");
    const r = BigInt("0x" + clean.slice(0, 64)); const s = BigInt("0x" + clean.slice(64));
    const pubKey = new Uint8Array(65); pubKey[0] = 0x04; pubKey.set(xBytes, 1); pubKey.set(yBytes, 33);
    const sig = new p256.Signature(r, s).toCompactRawBytes();
    return { valid: p256.verify(sig, message, pubKey), legacy: false };
  } catch { return { valid: false, legacy: false, error: "Verification failed" }; }
}

function hexToBytes(h: string): Uint8Array {
  const c = h.replace(/^0x/, ""); const o = new Uint8Array(c.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16); return o;
}

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
    const rawBody = await req.json();
    const auth = verifyAuth(req, rawBody);
    if (!auth.valid) return NextResponse.json({ success: false, error: auth.error ?? "Unauthorized" }, { status: 401, headers: corsHeaders });
    const { stealthAddress, chainId, gasNeeded, ethNeeded } = rawBody;
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
