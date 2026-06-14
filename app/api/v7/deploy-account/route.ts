import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerV7ScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// Deploy a passkey-owned smart account via Z0tzAccountFactory.createAccount.
// The factory is permissionless — anyone can call it for any (ownerX, ownerY,
// salt) tuple; the resulting address is fully determined by those inputs +
// the factory's salt-encoded CreateX deploy. So the relayer can deploy on
// the user's behalf with no signature: the address is what the user expects
// and the recovery module is the factory's immutable wiring. We charge the
// account-creation gas to the relayer; downstream spend / send ops then
// succeed (the ledger's spend() requires op.account.code.length > 0 to read
// ownerX/ownerY).
//
// Idempotent: if the account is already deployed, return `already-deployed`
// without re-calling the factory.

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

const factoryAbi = [
  { name: "createAccount", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "ownerX", type: "uint256" },
      { name: "ownerY", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "address" }] },
  { name: "getAddress", type: "function", stateMutability: "view",
    inputs: [
      { name: "ownerX", type: "uint256" },
      { name: "ownerY", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "address" }] },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/deploy-account", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const { chainId, factory, ownerX, ownerY, salt } = json.value ?? {};
    if (!chainId || !factory || ownerX == null || ownerY == null) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: "Missing chainId / factory / ownerX / ownerY" },
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
      return NextResponse.json({ error: `Chain ${chainId} not supported` }, { status: 400, headers: v7CorsHeaders });
    }

    const account = privateKeyToAccount(relayerKey as Hex);
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });

    const predicted = (await pub.readContract({
      address: factory as Address,
      abi: factoryAbi,
      functionName: "getAddress",
      args: [BigInt(ownerX), BigInt(ownerY), BigInt(salt ?? 0)],
    })) as Address;

    const code = await pub.getCode({ address: predicted });
    if (code && code !== "0x") {
      return NextResponse.json({ account: predicted, txHash: "already-deployed" }, { headers: v7CorsHeaders });
    }

    const hash = await wallet.writeContract({
      address: factory as Address,
      abi: factoryAbi,
      functionName: "createAccount",
      args: [BigInt(ownerX), BigInt(ownerY), BigInt(salt ?? 0)],
      account,
      chain,
    });
    await pub.waitForTransactionReceipt({ hash });

    triggerV7ScanAndRecord({ chainId, txHash: hash, opKind: "deploy-account", req });

    ctx.txHash = hash;
    return NextResponse.json({ account: predicted, txHash: hash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "deploy_failed";
    return errorResponse(500, "deploy_failed", v7CorsHeaders, e);
  }
});
