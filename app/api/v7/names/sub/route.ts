import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";

// Z0tzNameRegistry.claimSubdomain — user-self-subdomain claim under a
// subdomain-root they own. Permissionless: the P-256 sig is the
// authorization. This is the retail subdomain flow (distinct from the
// admin-managed B2B SaaS flow at /api/v7/org/subdomain).

const CHAINS: Record<number, any> = {
  84532: baseSepolia, 11155111: sepolia, 421614: arbitrumSepolia, 31337: hardhat,
};

// V7-FINAL #14: claimSubdomain takes the cleartext leaf segment first.
const abi = [
  { name: "claimSubdomain", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "leafSegment", type: "string" },
      { name: "parentNameHash", type: "bytes32" }, { name: "leafNameHash", type: "bytes32" },
      { name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" },
      { name: "resolvedAccount", type: "address" },
      { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [] },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  try {
    const { chainId, claim } = await req.json();
    if (!chainId || !claim) {
      return NextResponse.json({ error: "Missing chainId or claim" }, { status: 400, headers: v7CorsHeaders });
    }
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
    const chain = CHAINS[chainId];
    const rpc = process.env[`RPC_URL_${chainId}`];
    if (!chain || !rpc) return NextResponse.json({ error: `Chain ${chainId} not supported` }, { status: 400, headers: v7CorsHeaders });

    const account = privateKeyToAccount(relayerKey as Hex);
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });
    const d = v7Deployment(chainId);
    const reg = d.nameRegistry as Address;

    // V7-FINAL #14: forward cleartext leafSegment.
    if (typeof claim.leafSegment !== "string" || !claim.leafSegment) {
      return NextResponse.json({ error: "Missing claim.leafSegment (V7-FINAL #14)" }, { status: 400, headers: v7CorsHeaders });
    }
    const args = [
      claim.leafSegment as string,
      claim.parentNameHash as Hex,
      claim.leafNameHash as Hex,
      BigInt(claim.pubX), BigInt(claim.pubY),
      claim.resolvedAccount as Address,
      BigInt(claim.sigR), BigInt(claim.sigS),
    ] as const;

    let gas: bigint;
    try {
      const e = await pub.estimateContractGas({ address: reg, abi, functionName: "claimSubdomain", args, account });
      gas = e * 2n;
      if (gas < 400_000n) gas = 400_000n;
    } catch { gas = 600_000n; }

    const txHash = await wallet.writeContract({ address: reg, abi, functionName: "claimSubdomain", args, account, chain, gas } as any);
    await pub.waitForTransactionReceipt({ hash: txHash });
    triggerScanAndRecord({ chainId, txHash, opKind: "names-sub", req });
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "names sub failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
