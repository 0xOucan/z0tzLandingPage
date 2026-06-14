import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerV7ScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

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

export const POST = withApiLog("/api/v7/names/sub", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }
  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const { chainId, claim } = json.value ?? {};
    if (!chainId || !claim) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "Missing chainId or claim" }, { status: 400, headers: v7CorsHeaders });
    }
    ctx.chainId = chainId;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) { ctx.errorCode = "relayer_disabled"; return errorResponse(503, "relayer_disabled", v7CorsHeaders); }
    const chain = CHAINS[chainId];
    const rpc = process.env[`RPC_URL_${chainId}`];
    if (!chain || !rpc) { ctx.errorCode = "chain_unsupported"; return NextResponse.json({ error: `Chain ${chainId} not supported` }, { status: 400, headers: v7CorsHeaders }); }

    const account = privateKeyToAccount(relayerKey as Hex);
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });
    const d = v7Deployment(chainId);
    const reg = d.nameRegistry as Address;

    // V7-FINAL #14: forward cleartext leafSegment.
    if (typeof claim.leafSegment !== "string" || !claim.leafSegment) {
      ctx.errorCode = "validation_failed";
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
    triggerV7ScanAndRecord({ chainId, txHash, opKind: "names-sub", req });
    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
