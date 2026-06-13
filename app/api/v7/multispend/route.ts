import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, createWalletClient, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";
import {
  ErrorResponseSchema,
  MultispendReqSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { consumeToken, callerIpKey } from "@/lib/relayer/rate-limit";
import { withApiLog } from "@/lib/relayer/request-log";

// Z0tzLedgerV7.multiSpend — batched ledger spend (up to 50 rows in the API
// boundary; contract docs "up to 30"). The passkey-signed envelope binds
// the full recipient array via batchHash; the contract verifies the P-256
// sig over (chainid, ledger, tag, account, token, batchHash, totalPlainAmount,
// senderExecutor, nonce, deadline) and runs each row under try/catch.

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/multispend",
  tags: ["user-tier"],
  summary: "Relay a signed batched ledger spend",
  description:
    "Submits a P-256-signed MultispendOp to Z0tzLedgerV7. Cap 50 recipients " +
    "per call. The relayer pays gas; per-call auth is the on-chain signature.",
  security: [{ passkey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: MultispendReqSchema } },
    },
  },
  responses: {
    200: { description: "Submitted.", content: { "application/json": { schema: TxHashResponseSchema } } },
    400: { description: "Validation failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
    429: { description: "Rate-limited.", content: { "application/json": { schema: ErrorResponseSchema } } },
    503: { description: "Relayer disabled.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

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
    { name: "securityZone", type: "uint8" },
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

export const POST = withApiLog("/api/v7/multispend", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }

  const allowed = await consumeToken(`${callerIpKey(req)}|multispend`);
  if (!allowed) {
    ctx.errorCode = "rate_limited";
    return errorResponse(429, "rate_limited", v7CorsHeaders);
  }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }

  const parsed = MultispendReqSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed",
      },
      { status: 400, headers: v7CorsHeaders },
    );
  }

  const { chainId, op } = parsed.data;
  ctx.chainId = chainId;

  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerKey) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }
  const chain = CHAINS[chainId];
  const rpc = process.env[`RPC_URL_${chainId}`];
  if (!chain || !rpc) {
    ctx.errorCode = "unsupported_chain";
    return NextResponse.json(
      { error: "unsupported chain", code: "unsupported_chain" },
      { status: 400, headers: v7CorsHeaders },
    );
  }

  try {
    const account = privateKeyToAccount(relayerKey as Hex);
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });
    const d = v7Deployment(chainId);
    const ledger = d.ledger as Address;

    let onchainOp: any;
    try {
      onchainOp = {
        account: op.account as Address,
        token: op.token as Address,
        totalPlainAmount: BigInt(op.totalPlainAmount),
        senderExecutor: op.senderExecutor as Address,
        nonce: BigInt(op.nonce),
        deadline: BigInt(op.deadline),
        pkX: BigInt(op.pkX), pkY: BigInt(op.pkY),
        sigR: BigInt(op.sigR), sigS: BigInt(op.sigS),
        recipients: op.recipients.map((r) => ({
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
    } catch {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: "invalid bigint field", code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }

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
    ctx.txHash = txHash;

    triggerScanAndRecord({ chainId, txHash, opKind: "multispend", req });

    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "submit_failed";
    return errorResponse(500, "submit_failed", v7CorsHeaders, e);
  }
});
