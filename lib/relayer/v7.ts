/**
 * V7 relayer — gasless submission of the signed ops the cli-v7 / GUI produce.
 * Mirrors lib/relayer/ledger.ts for the V7 contracts.
 *
 * Addresses per chain come from a single env JSON blob (the shape
 * scripts/deploy.ts emits): DEPLOYMENT_V7_{chainId} = the `deployment` object
 * { ledger, sweeper, airdropClaim, nameRegistry, recoveryHub, ... }.
 * Plus RPC_URL_{chainId} and RELAYER_PRIVATE_KEY.
 *
 * The relayer NEVER sees plaintext amounts/secrets — it forwards already-
 * signed, already-encrypted ops (the P-256 sig is the user's authorization).
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { makeTransport } from "./rpc";
// F-6 was the wakeup call: maintaining the same wire shapes in two places
// (landing + cli-v7) guarantees drift. The SDK is now the single source of
// truth for every request/response interface. Submitter logic stays local
// because it holds the operator private key — a strictly server concern.
export type {
  AirdropClaimReq, SweepReq, SpendReq, NameClaimReq,
  OrgClaimSubdomainReq, OrgRepointSubdomainReq, OrgRevokeSubdomainReq,
  OrgSetPolicyReq, OrgInitiateRecoveryReq,
  RecoverInitiateReq, RecoverExecuteReq,
  EncryptedArtifact, StealthWatchReq, StealthInboundResponse, StealthInboundRow,
  InEuint64,
} from "@z0tz/sdk-v7";

/** Server-side deployment shape — same fields as the SDK's V7Deployment
 *  but with optional flags on infra-only contracts that old testnet
 *  deployments may not have written into the env JSON. */
export interface V7Deployment {
  ledger: Address; sweeper: Address; airdropClaim: Address; nameRegistry: Address;
  recoveryHub: Address; vault: Address; zusdc: Address; usdc: Address;
  tokenRegistry: Address; paymaster: Address; entryPoint: Address;
  internalBridge?: Address; mockYieldStrategy?: Address; timedVault?: Address;
  emergencyKeyMethod?: Address; guardianQuorumMethod?: Address;
  policyFactory?: Address;
}

function chainFor(chainId: number): Chain {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    case 31337: return hardhat; // local hardhat node + cofhe mocks (PoC)
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}
function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}

export function isEnabled(): boolean {
  return Boolean(process.env.RELAYER_PRIVATE_KEY);
}

export function v7Deployment(chainId: number): V7Deployment {
  const raw = process.env[`DEPLOYMENT_V7_${chainId}`];
  if (!raw) throw new Error(`Missing DEPLOYMENT_V7_${chainId} (deploy + set the env blob)`);
  return JSON.parse(raw) as V7Deployment;
}

function clients(chainId: number) {
  const chain = chainFor(chainId);
  const rpc = envOrThrow(`RPC_URL_${chainId}`);
  const account = privateKeyToAccount(envOrThrow("RELAYER_PRIVATE_KEY") as Hex);
  return {
    account,
    pub: createPublicClient({ chain, transport: makeTransport(rpc) }),
    wallet: createWalletClient({ account, chain, transport: makeTransport(rpc) }),
  };
}

async function estimateOrFallback(pub: any, args: any, fallback: bigint): Promise<bigint> {
  try { const e = await pub.estimateContractGas(args); return e + e / 5n; } catch { return fallback; }
}

// ── ABIs (minimal, match the deployed contracts) ─────────────────────────
const airdropAbi = [{ name: "claim", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" }], outputs: [] }] as const;
const sweeperAbi = [{ name: "privateSweepToLedger", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "stealthAddress", type: "address" }, { name: "token", type: "address" }, { name: "account", type: "address" }, { name: "viewer", type: "address" }, { name: "nonce", type: "uint256" }, { name: "amount", type: "uint64" }, { name: "deadline", type: "uint256" }, { name: "signature", type: "bytes" }], outputs: [] }] as const;
const namesAbi = [
  { name: "claim", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "nameHash", type: "bytes32" }, { name: "nameLength", type: "uint256" }, { name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" }, { name: "resolvedAccount", type: "address" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" }], outputs: [] },
  // Phase 1 B2B: admin-signed onboarding of a user under a subdomain root.
  // The contract validates the admin's P-256 sig + the rootNonce + deadline.
  { name: "claimSubdomainFor", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "parentNameHash", type: "bytes32" }, { name: "leafNameHash", type: "bytes32" },
      { name: "userPubX", type: "uint256" }, { name: "userPubY", type: "uint256" },
      { name: "userResolvedAccount", type: "address" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [] },
  { name: "repointSubdomain", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "leafNameHash", type: "bytes32" },
      { name: "newUserPubX", type: "uint256" }, { name: "newUserPubY", type: "uint256" },
      { name: "newResolvedAccount", type: "address" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [] },
  { name: "revokeSubdomain", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "leafNameHash", type: "bytes32" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [] },
  { name: "setPolicy", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "rootNameHash", type: "bytes32" }, { name: "policy", type: "address" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [] },
] as const;
const hubAbi = [
  { name: "initiateRecovery", type: "function", stateMutability: "nonpayable", inputs: [{ name: "account", type: "address" }, { name: "methodIndex", type: "uint256" }, { name: "newOwnerX", type: "uint256" }, { name: "newOwnerY", type: "uint256" }, { name: "proof", type: "bytes" }], outputs: [{ type: "uint256" }] },
  { name: "executeRecovery", type: "function", stateMutability: "nonpayable", inputs: [{ name: "recoveryId", type: "uint256" }], outputs: [] },
  { name: "initiateOrgRecovery", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "newOwnerX", type: "uint256" }, { name: "newOwnerY", type: "uint256" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
    ], outputs: [{ type: "uint256" }] },
] as const;
const inEuint64 = { name: "amount", type: "tuple", components: [{ name: "ctHash", type: "uint256" }, { name: "securityZone", type: "uint8" }, { name: "utype", type: "uint8" }, { name: "signature", type: "bytes" }] } as const;
const ledgerAbi = [{ name: "spend", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "op", type: "tuple", components: [
    { name: "account", type: "address" }, { name: "token", type: "address" }, { name: "action", type: "uint8" },
    { name: "destAccount", type: "address" }, { name: "destAddress", type: "address" }, { name: "destChainId", type: "uint32" },
    inEuint64,
    // F-6 fix: contract's SpendOp has a uint64 plainAmount between amount
    // and nonce (audit C-2: binds plaintext to the signed digest so the
    // policy hook + vault verification catch sender lies about cashout
    // amounts). Internal paths pass 0; cashout paths pass the matching
    // unshield amount. Missing here meant every spend reverted with a
    // "function selector not recognized" mismatch.
    { name: "plainAmount", type: "uint64" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    { name: "pkX", type: "uint256" }, { name: "pkY", type: "uint256" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
  ] }], outputs: [] }] as const;

// (Request shapes now imported from @z0tz/sdk-v7 — top of file. Submitters
//  below take those typed shapes directly. F-6 prevention: there's only
//  ONE place to update an interface now, and the SDK's `digest.test.ts`
//  catches any encoded-shape drift before it can ship.)
import type {
  AirdropClaimReq as _AirdropReq, SweepReq as _SweepReq, SpendReq as _SpendReq,
  NameClaimReq as _NameReq, OrgClaimSubdomainReq as _OrgClaimSubReq,
  OrgRepointSubdomainReq as _OrgRepointReq, OrgRevokeSubdomainReq as _OrgRevokeReq,
  OrgSetPolicyReq as _OrgSetPolicyReq, OrgInitiateRecoveryReq as _OrgRecReq,
} from "@z0tz/sdk-v7";

// ── Submitters ───────────────────────────────────────────────────────────
export async function submitAirdropClaim(chainId: number, r: _AirdropReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.pubX), BigInt(r.pubY), r.nonce, BigInt(r.sigR), BigInt(r.sigS)] as const;
  const gas = await estimateOrFallback(pub, { address: d.airdropClaim, abi: airdropAbi, functionName: "claim", args, account }, 300_000n);
  return { txHash: await wallet.writeContract({ address: d.airdropClaim, abi: airdropAbi, functionName: "claim", args, gas } as any) };
}

export async function submitSweep(chainId: number, r: _SweepReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.stealthAddress, r.token, r.account, r.viewer, BigInt(r.nonce), BigInt(r.amount), BigInt(r.deadline), r.signature] as const;
  const gas = await estimateOrFallback(pub, { address: d.sweeper, abi: sweeperAbi, functionName: "privateSweepToLedger", args, account }, 800_000n);
  return { txHash: await wallet.writeContract({ address: d.sweeper, abi: sweeperAbi, functionName: "privateSweepToLedger", args, gas } as any) };
}

export async function submitSpend(chainId: number, r: _SpendReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const op = {
    account: r.account, token: r.token, action: r.action, destAccount: r.destAccount, destAddress: r.destAddress, destChainId: r.destChainId,
    amount: { ctHash: BigInt(r.amount.ctHash), securityZone: r.amount.securityZone, utype: r.amount.utype, signature: r.amount.signature },
    plainAmount: BigInt(r.plainAmount ?? "0"),
    nonce: BigInt(r.nonce), deadline: BigInt(r.deadline), pkX: BigInt(r.pkX), pkY: BigInt(r.pkY), sigR: BigInt(r.sigR), sigS: BigInt(r.sigS),
  };
  const gas = await estimateOrFallback(pub, { address: d.ledger, abi: ledgerAbi, functionName: "spend", args: [op as any], account }, 1_200_000n);
  return { txHash: await wallet.writeContract({ address: d.ledger, abi: ledgerAbi, functionName: "spend", args: [op as any], gas } as any) };
}

export async function submitNameClaim(chainId: number, r: _NameReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.nameHash, BigInt(r.nameLength), BigInt(r.pubX), BigInt(r.pubY), r.resolvedAccount, BigInt(r.sigR), BigInt(r.sigS)] as const;
  const gas = await estimateOrFallback(pub, { address: d.nameRegistry, abi: namesAbi, functionName: "claim", args, account }, 400_000n);
  return { txHash: await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claim", args, gas } as any) };
}

// ── B2B SaaS: org admin ops ──────────────────────────────────────────────
// (Request interfaces re-exported from @z0tz/sdk-v7 — top of file.)

export async function submitOrgClaimSubdomain(chainId: number, r: _OrgClaimSubReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.parentNameHash, r.leafNameHash,
    BigInt(r.userPubX), BigInt(r.userPubY), r.userResolvedAccount,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const gas = await estimateOrFallback(pub, { address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainFor", args, account }, 600_000n);
  return { txHash: await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainFor", args, gas } as any) };
}

export async function submitOrgRepointSubdomain(chainId: number, r: _OrgRepointReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.leafNameHash,
    BigInt(r.newUserPubX), BigInt(r.newUserPubY), r.newResolvedAccount,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const gas = await estimateOrFallback(pub, { address: d.nameRegistry, abi: namesAbi, functionName: "repointSubdomain", args, account }, 500_000n);
  return { txHash: await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "repointSubdomain", args, gas } as any) };
}

export async function submitOrgRevokeSubdomain(chainId: number, r: _OrgRevokeReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.leafNameHash,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const gas = await estimateOrFallback(pub, { address: d.nameRegistry, abi: namesAbi, functionName: "revokeSubdomain", args, account }, 400_000n);
  return { txHash: await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "revokeSubdomain", args, gas } as any) };
}

export async function submitOrgSetPolicy(chainId: number, r: _OrgSetPolicyReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.rootNameHash, r.policy,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const gas = await estimateOrFallback(pub, { address: d.nameRegistry, abi: namesAbi, functionName: "setPolicy", args, account }, 400_000n);
  return { txHash: await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "setPolicy", args, gas } as any) };
}

export async function submitOrgInitiateRecovery(chainId: number, r: _OrgRecReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.account,
    BigInt(r.newOwnerX), BigInt(r.newOwnerY),
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const gas = await estimateOrFallback(pub, { address: d.recoveryHub, abi: hubAbi, functionName: "initiateOrgRecovery", args, account }, 700_000n);
  return { txHash: await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "initiateOrgRecovery", args, gas } as any) };
}

export async function submitRecoverInitiate(chainId: number, r: { account: Address; methodIndex: string; newOwnerX: string; newOwnerY: string; proof: Hex }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.account, BigInt(r.methodIndex), BigInt(r.newOwnerX), BigInt(r.newOwnerY), r.proof] as const;
  const gas = await estimateOrFallback(pub, { address: d.recoveryHub, abi: hubAbi, functionName: "initiateRecovery", args, account }, 500_000n);
  return { txHash: await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "initiateRecovery", args, gas } as any) };
}

export async function submitRecoverExecute(chainId: number, r: { recoveryId: string }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.recoveryId)] as const;
  const gas = await estimateOrFallback(pub, { address: d.recoveryHub, abi: hubAbi, functionName: "executeRecovery", args, account }, 400_000n);
  return { txHash: await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "executeRecovery", args, gas } as any) };
}
