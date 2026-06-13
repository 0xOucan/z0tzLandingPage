import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, createWalletClient, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

// EntryPoint.handleOps relay — submits a pre-signed PackedUserOperation
// on the user's behalf so the relayer pays the gas + bundler beneficiary
// gets refunded by the paymaster envelope (when present).
//
// This is the gas-paying path for any account-self-call that needs to
// originate from msg.sender == smart account: recover.enableMethod /
// cancelMethod, DeFi approvals routed through account.execute, etc.
//
// Auth: the on-chain validator is the P-256 sig the user's passkey already
// covered. Relayer cannot forge a UserOp without that sig — we just bundle.

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

const entryPointAbi = [
  { name: "handleOps", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "ops", type: "tuple[]", components: [
        { name: "sender", type: "address" }, { name: "nonce", type: "uint256" },
        { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
        { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" },
        { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" }, { name: "signature", type: "bytes" },
      ] },
      { name: "beneficiary", type: "address" },
    ], outputs: [] },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export const POST = withApiLog("/api/v7/userop", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }
  try {
    const { chainId, op } = json.value ?? {};
    if (!chainId || !op) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json({ error: "Missing chainId or op" }, { status: 400, headers: v7CorsHeaders });
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

    const d = v7Deployment(chainId);
    const entryPoint = d.entryPoint as Address;
    if (!entryPoint) {
      ctx.errorCode = "deployment_missing";
      return errorResponse(500, "deployment_missing", v7CorsHeaders);
    }

    // Reconstruct the PackedUserOperation from the JSON body.
    const packed = {
      sender: op.sender as Address,
      nonce: BigInt(op.nonce),
      initCode: (op.initCode ?? "0x") as Hex,
      callData: op.callData as Hex,
      accountGasLimits: op.accountGasLimits as Hex,
      preVerificationGas: BigInt(op.preVerificationGas),
      gasFees: op.gasFees as Hex,
      paymasterAndData: (op.paymasterAndData ?? "0x") as Hex,
      signature: op.signature as Hex,
    };

    // Estimate then 2x safety floor; entryPoint.handleOps has variable cost
    // depending on the inner call (recover.enableMethod is moderate; defi
    // approvals are tiny). Floor at 600k so simple calls don't underfund.
    let gas: bigint;
    try {
      const e = await pub.estimateContractGas({
        address: entryPoint, abi: entryPointAbi, functionName: "handleOps",
        args: [[packed], account.address as Address], account,
      });
      gas = e * 2n;
      if (gas < 600_000n) gas = 600_000n;
    } catch {
      gas = 1_500_000n;
    }

    const txHash = await wallet.writeContract({
      address: entryPoint, abi: entryPointAbi, functionName: "handleOps",
      args: [[packed], account.address as Address],
      account, chain, gas,
    } as any);
    await pub.waitForTransactionReceipt({ hash: txHash });

    triggerScanAndRecord({ chainId, txHash, opKind: "userop", req });

    ctx.txHash = txHash;
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
