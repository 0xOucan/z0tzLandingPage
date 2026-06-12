import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";

// Z0tzNameRegistry.updateResolvedAccount — repoint a name to a new
// smart account. The owning passkey signs over the new account, the
// current nameNonce, and a deadline. Permissionless caller.

const CHAINS: Record<number, any> = {
  84532: baseSepolia, 11155111: sepolia, 421614: arbitrumSepolia, 31337: hardhat,
};

const abi = [
  { name: "updateResolvedAccount", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "nameHash", type: "bytes32" }, { name: "newAccount", type: "address" },
      { name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" },
      { name: "deadline", type: "uint64" },
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
    const { chainId, update } = await req.json();
    if (!chainId || !update) {
      return NextResponse.json({ error: "Missing chainId or update" }, { status: 400, headers: v7CorsHeaders });
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

    const args = [
      update.nameHash as Hex,
      update.newAccount as Address,
      BigInt(update.pubX), BigInt(update.pubY),
      BigInt(update.deadline),
      BigInt(update.sigR), BigInt(update.sigS),
    ] as const;

    let gas: bigint;
    try {
      const e = await pub.estimateContractGas({ address: reg, abi, functionName: "updateResolvedAccount", args, account });
      gas = e * 2n;
      if (gas < 300_000n) gas = 300_000n;
    } catch { gas = 500_000n; }

    const txHash = await wallet.writeContract({ address: reg, abi, functionName: "updateResolvedAccount", args, account, chain, gas } as any);
    await pub.waitForTransactionReceipt({ hash: txHash });
    triggerScanAndRecord({ chainId, txHash, opKind: "names-update", req });
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "names update failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
