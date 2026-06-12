/**
 * Tezcatli (Aave V3 yield) read + cosign helpers.
 *
 * Strictly view-only on-chain reads + calldata builders for the org-key
 * cosign endpoints. No signing key is touched here — the deployed vault's
 * deposit/withdraw paths are caller-authenticated, so the cosign routes
 * return prepared calldata for the org's account to broadcast. A future
 * SDK rev can swap this for a meta-tx submitter when the contract adds a
 * signed-intent entrypoint.
 */
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { makeTransport } from "./rpc";
import { v7Deployment } from "./v7";

function chainFor(chainId: number): Chain {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    case 31337: return hardhat;
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function rpcUrl(chainId: number): string {
  const v = process.env[`RPC_URL_${chainId}`];
  if (!v) throw new Error(`Missing env var RPC_URL_${chainId}`);
  return v;
}

function pubClient(chainId: number) {
  return createPublicClient({ chain: chainFor(chainId), transport: makeTransport(rpcUrl(chainId)) });
}

export function tezcatliAddresses(chainId: number): { vault: Address; adapter: Address } {
  const d = v7Deployment(chainId);
  if (!d.tezcatliVault) throw new Error(`Tezcatli not deployed on chain ${chainId}`);
  if (!d.tezcatliAdapter) throw new Error(`Tezcatli adapter missing on chain ${chainId}`);
  return { vault: d.tezcatliVault, adapter: d.tezcatliAdapter };
}

// ── ABIs (minimal — match the deployed contracts) ────────────────────────
const adapterAbi = [
  { name: "currentApyBps", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
] as const;

const vaultReadAbi = [
  { name: "principalOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "sharesOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "grossPositionOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "pendingYieldOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "pendingFeeBpsOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint16" }] },
  { name: "withdrawUnlockAt", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }], outputs: [{ type: "uint64" }] },
  { name: "totalAssetsOf", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "totalSharesOf", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  // positionOf returns the UserPosition struct; we read lockOption from it.
  { name: "positionOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }],
    outputs: [{ type: "tuple", components: [
      { name: "principal", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "depositedAt", type: "uint64" },
      { name: "withdrawUnlockAt", type: "uint64" },
      { name: "lockOption", type: "uint8" },
    ] }] },
] as const;

const vaultWriteAbi = [
  { name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }, { name: "assets", type: "uint256" }, { name: "lockOption", type: "uint8" }],
    outputs: [{ type: "uint256" }] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }, { name: "shares", type: "uint256" }, { name: "recipient", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

// ── Read helpers ─────────────────────────────────────────────────────────

export async function readCurrentApyBps(chainId: number): Promise<number> {
  const { adapter } = tezcatliAddresses(chainId);
  const pub = pubClient(chainId);
  const v = (await pub.readContract({ address: adapter, abi: adapterAbi, functionName: "currentApyBps" })) as number;
  return Number(v);
}

export async function readPosition(chainId: number, account: Address, token: Address) {
  const { vault } = tezcatliAddresses(chainId);
  const pub = pubClient(chainId);
  const calls = [
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "principalOf", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "sharesOf", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "grossPositionOf", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "pendingYieldOf", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "pendingFeeBpsOf", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "withdrawUnlockAt", args: [account, token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "positionOf", args: [account, token] }),
  ] as const;
  const [principal, shares, gross, yieldP, feeBps, unlockAt, position] = await Promise.all(calls);
  const lockOption = Number((position as any).lockOption ?? 0);
  return {
    principal: String(principal as bigint),
    shares: String(shares as bigint),
    grossPosition: String(gross as bigint),
    pendingYield: String(yieldP as bigint),
    pendingFeeBps: Number(feeBps as number),
    withdrawUnlockAt: String(unlockAt as bigint),
    lockOption,
  };
}

export async function readTotals(chainId: number, token: Address) {
  const { vault } = tezcatliAddresses(chainId);
  const pub = pubClient(chainId);
  const [totalAssets, totalShares] = await Promise.all([
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "totalAssetsOf", args: [token] }),
    pub.readContract({ address: vault, abi: vaultReadAbi, functionName: "totalSharesOf", args: [token] }),
  ]);
  return {
    totalAssets: String(totalAssets as bigint),
    totalShares: String(totalShares as bigint),
  };
}

// ── Cosign (calldata-builder) helpers ────────────────────────────────────

export function buildDepositCalldata(chainId: number, token: Address, assets: bigint, lockOption: number): { to: Address; data: Hex } {
  const { vault } = tezcatliAddresses(chainId);
  const data = encodeFunctionData({ abi: vaultWriteAbi, functionName: "deposit", args: [token, assets, lockOption] });
  return { to: vault, data };
}

export function buildWithdrawCalldata(chainId: number, token: Address, shares: bigint, recipient: Address): { to: Address; data: Hex } {
  const { vault } = tezcatliAddresses(chainId);
  const data = encodeFunctionData({ abi: vaultWriteAbi, functionName: "withdraw", args: [token, shares, recipient] });
  return { to: vault, data };
}
