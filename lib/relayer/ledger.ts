/**
 * V6.5 ledger relay — privateSweepToLedger + ledger.spend submission.
 * Ported from Z0tz/relayer/lib/ledger.ts for Next.js serverless.
 *
 * Reads V6.5 contract addresses from env:
 *   LEDGER_ADDRESS_{chainId}
 *   SWEEPER_V65_ADDRESS_{chainId}
 *   RPC_URL_{chainId}
 *   RELAYER_PRIVATE_KEY
 *   USE_LEDGER=1
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";

const SWEEPER_ABI = [
  {
    name: "privateSweepToLedger",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stealthAddress", type: "address" },
      { name: "underlying", type: "address" },
      { name: "ledgerId", type: "bytes32" },
      { name: "pubkeyHash", type: "bytes32" },
      { name: "viewer", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "amount", type: "uint64" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const LEDGER_ABI = [
  {
    name: "spend",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "op",
        type: "tuple",
        components: [
          { name: "oldId", type: "bytes32" },
          { name: "newId", type: "bytes32" },
          { name: "newPubkeyHash", type: "bytes32" },
          { name: "newViewer", type: "address" },
          { name: "action", type: "uint8" },
          { name: "destLedgerId", type: "bytes32" },
          { name: "destPubkeyHash", type: "bytes32" },
          { name: "destViewer", type: "address" },
          {
            name: "destAttest",
            type: "tuple",
            components: [
              { name: "pkX", type: "uint256" },
              { name: "pkY", type: "uint256" },
              { name: "sigR", type: "uint256" },
              { name: "sigS", type: "uint256" },
            ],
          },
          { name: "destAddress", type: "address" },
          {
            name: "amount",
            type: "tuple",
            components: [
              { name: "ctHash", type: "uint256" },
              { name: "securityZone", type: "uint8" },
              { name: "utype", type: "uint8" },
              { name: "signature", type: "bytes" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "pkX", type: "uint256" },
          { name: "pkY", type: "uint256" },
          { name: "sigR", type: "uint256" },
          { name: "sigS", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export function isLedgerEnabled(): boolean {
  return process.env.USE_LEDGER === "1";
}

function chainFor(chainId: number): Chain {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}

const LEDGER_SWEEP_FALLBACK_GAS = 800_000n;
const LEDGER_SPEND_FALLBACK_GAS = 900_000n;

async function estimateOrFallback(client: any, args: any, fallback: bigint): Promise<bigint> {
  try {
    const est = await client.estimateContractGas(args);
    return est + (est / 5n);
  } catch {
    return fallback;
  }
}

export interface SerializedSpendOp {
  oldId: string; newId: string; newPubkeyHash: string; newViewer: string;
  action: number;
  destLedgerId: string; destPubkeyHash: string; destViewer: string;
  destAttest: { pkX: string; pkY: string; sigR: string; sigS: string };
  destAddress: string;
  amount: { ctHash: string; securityZone: number; utype: number; signature: string };
  nonce: string; deadline: string;
  pkX: string; pkY: string; sigR: string; sigS: string;
}

function deserializeOp(s: SerializedSpendOp) {
  return {
    oldId: s.oldId, newId: s.newId, newPubkeyHash: s.newPubkeyHash, newViewer: s.newViewer,
    action: s.action,
    destLedgerId: s.destLedgerId, destPubkeyHash: s.destPubkeyHash, destViewer: s.destViewer,
    destAttest: {
      pkX: BigInt(s.destAttest.pkX), pkY: BigInt(s.destAttest.pkY),
      sigR: BigInt(s.destAttest.sigR), sigS: BigInt(s.destAttest.sigS),
    },
    destAddress: s.destAddress,
    amount: {
      ctHash: BigInt(s.amount.ctHash), securityZone: s.amount.securityZone,
      utype: s.amount.utype, signature: s.amount.signature,
    },
    nonce: BigInt(s.nonce), deadline: BigInt(s.deadline),
    pkX: BigInt(s.pkX), pkY: BigInt(s.pkY),
    sigR: BigInt(s.sigR), sigS: BigInt(s.sigS),
  };
}

export async function submitSweepToLedger(
  chainId: number,
  call: {
    stealthAddress: Address;
    underlying: Address;
    ledgerId: Hex;
    pubkeyHash: Hex;
    viewer: Address;
    nonce: string;
    amount: string;
    deadline: string;
    signature: Hex;
  },
): Promise<{ txHash: Hex }> {
  const chain = chainFor(chainId);
  const sweeper = envOrThrow(`SWEEPER_V65_ADDRESS_${chainId}`) as Address;
  const rpc = envOrThrow(`RPC_URL_${chainId}`);
  const account = privateKeyToAccount(envOrThrow("RELAYER_PRIVATE_KEY") as Hex);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });

  const sweepArgs = [
    call.stealthAddress, call.underlying,
    call.ledgerId, call.pubkeyHash, call.viewer,
    BigInt(call.nonce), BigInt(call.amount), BigInt(call.deadline),
    call.signature,
  ] as const;

  const gas = await estimateOrFallback(
    publicClient,
    { address: sweeper, abi: SWEEPER_ABI, functionName: "privateSweepToLedger", args: sweepArgs, account },
    LEDGER_SWEEP_FALLBACK_GAS,
  );
  const txHash = await wallet.writeContract({
    address: sweeper, abi: SWEEPER_ABI, functionName: "privateSweepToLedger",
    args: sweepArgs, gas,
  } as any);
  return { txHash };
}

export async function submitSpend(
  chainId: number,
  op: SerializedSpendOp,
): Promise<{ txHash: Hex }> {
  const chain = chainFor(chainId);
  const ledger = envOrThrow(`LEDGER_ADDRESS_${chainId}`) as Address;
  const rpc = envOrThrow(`RPC_URL_${chainId}`);
  const account = privateKeyToAccount(envOrThrow("RELAYER_PRIVATE_KEY") as Hex);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  const deserializedOp = deserializeOp(op);

  const gas = await estimateOrFallback(
    publicClient,
    { address: ledger, abi: LEDGER_ABI, functionName: "spend", args: [deserializedOp as any], account },
    LEDGER_SPEND_FALLBACK_GAS,
  );
  const txHash = await wallet.writeContract({
    address: ledger, abi: LEDGER_ABI, functionName: "spend",
    args: [deserializedOp as any], gas,
  } as any);
  return { txHash };
}
