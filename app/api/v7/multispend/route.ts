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

// Z0tzLedgerV7.multiSpend — batched ledger spend (up to 30 rows). The
// passkey-signed envelope binds the full recipient array via batchHash;
// the contract verifies the P-256 sig over (chainid, ledger, tag,
// account, token, batchHash, totalPlainAmount, senderExecutor, nonce,
// deadline) and runs each row under a try/catch (DoS-M1) so a single
// bad row doesn't grief the batch.
//
// Open endpoint mirroring /api/v7/spend — per-call auth is the on-chain
// P-256 signature, not an HTTP header.

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

const inEuint64 = {
  type: "tuple",
  components: [
    { name: "ctHash", type: "uint256" },
    { name: "securityZone", type: "int32" },
    { name: "utype", type: "uint8" },
    { name: "signature", type: "bytes" },
  ],
} as const;

const ledgerAbi = [
  { name: "multiSpend", type: "function", stateMutability: "nonpayable",
    inputs: [{
      name: "op", type: "tuple", components: [
        { name: "account", type: "address" },
        { name: "token", type: "address" },
        { name: "totalPlainAmount", type: "uint64" },
        { name: "senderExecutor", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "pkX", type: "uint256" },
        { name: "pkY", type: "uint256" },
        { name: "sigR", type: "uint256" },
        { name: "sigS", type: "uint256" },
        { name: "recipients", type: "tuple[]", components: [
          { name: "mode", type: "uint8" },
          { name: "encAmount", ...inEuint64 },
          { name: "plainAmount", type: "uint64" },
          { name: "destAccount", type: "address" },
          { name: "destAddress", type: "address" },
          { name: "destChainId", type: "uint32" },
        ] },
      ],
    }], outputs: [] },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const { chainId, op } = body ?? {};
    if (!chainId || !op) {
      return NextResponse.json({ error: "Missing chainId or op" }, { status: 400, headers: v7CorsHeaders });
    }
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
    }
    const chain = CHAINS[chainId];
    const rpc = process.env[`RPC_URL_${chainId}`];
    if (!chain || !rpc) {
      return NextResponse.json({ error: `Chain ${chainId} not supported` }, { status: 400, headers: v7CorsHeaders });
    }

    const account = privateKeyToAccount(relayerKey as Hex);
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });

    const d = v7Deployment(chainId);
    const ledger = d.ledger as Address;

    // Rebuild the on-chain tuple from the JSON body (BigIntStr → bigint).
    const onchainOp = {
      account: op.account as Address,
      token: op.token as Address,
      totalPlainAmount: BigInt(op.totalPlainAmount),
      senderExecutor: op.senderExecutor as Address,
      nonce: BigInt(op.nonce),
      deadline: BigInt(op.deadline),
      pkX: BigInt(op.pkX), pkY: BigInt(op.pkY),
      sigR: BigInt(op.sigR), sigS: BigInt(op.sigS),
      recipients: (op.recipients as any[]).map((r) => ({
        mode: Number(r.mode),
        encAmount: {
          ctHash: BigInt(r.encAmount.ctHash),
          securityZone: Number(r.encAmount.securityZone),
          utype: Number(r.encAmount.utype),
          signature: r.encAmount.signature as Hex,
        },
        plainAmount: BigInt(r.plainAmount),
        destAccount: r.destAccount as Address,
        destAddress: r.destAddress as Address,
        destChainId: Number(r.destChainId),
      })),
    };

    // Estimate then submit with 2x safety floored at 1.5M (FHE-heavy +
    // per-row vault forwarding).
    let gas: bigint;
    try {
      const e = await pub.estimateContractGas({
        address: ledger, abi: ledgerAbi, functionName: "multiSpend",
        args: [onchainOp as any], account,
      });
      gas = e * 2n;
      const floor = 1_500_000n;
      if (gas < floor) gas = floor;
    } catch {
      gas = 1_500_000n + 600_000n * BigInt(onchainOp.recipients.length);
    }

    const txHash = await wallet.writeContract({
      address: ledger, abi: ledgerAbi, functionName: "multiSpend",
      args: [onchainOp as any],
      account, chain, gas,
    } as any);
    await pub.waitForTransactionReceipt({ hash: txHash });

    triggerScanAndRecord({ chainId, txHash, opKind: "multispend", req });

    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "multispend failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
