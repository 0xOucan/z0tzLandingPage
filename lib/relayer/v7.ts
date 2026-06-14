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
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, type Address, type Hex, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { makeTransport } from "./rpc";
import { backfillFromReceipt } from "./name-cache";
import { mirrorTxLogsToV7 } from "../indexer/indexer-v7";
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
} from "../sdk-v7-types";

/** Server-side deployment shape — same fields as the SDK's V7Deployment
 *  but with optional flags on infra-only contracts that old testnet
 *  deployments may not have written into the env JSON. */
export interface V7Deployment {
  ledger: Address; sweeper: Address; airdropClaim: Address; nameRegistry: Address;
  recoveryHub: Address; vault: Address; zusdc: Address; usdc: Address;
  tokenRegistry: Address; paymaster: Address; entryPoint: Address;
  // TODO(bridge-v7-wire-up): when the V7 internal-bridge relayer path lands
  //   here (currently the landing only forwards ledger/sweep/spend, NOT
  //   bridge messages), the wire shapes for `InternalMessage` and
  //   `BurnMessage` MUST include the new `uint64 burnNonce` field that the
  //   post-audit contracts now bind into the message digest. Without it the
  //   contract reverts with `InvalidBurnNonce` on `attestMint`. Matching SDK
  //   type lives in @z0tz/sdk-v7's bridge encoders — re-export from there
  //   rather than redefining locally (see F-6 comment elsewhere in this
  //   file). audit_alerts_v7 kind='bridge.PendingMintRecorded' surfaces the
  //   on-chain burnNonce for cross-checking.
  feeAccounting?: Address; // Z0tzFeeAccountingV7 — standalone recordFee emitter; NOT wired on testnet (nothing calls recordFee). Real fees come from `treasury`.
  treasury?: Address; // Z0tzTreasury — emits FeeAggregated on every fee route (ledger/sweeper). Live fee-event source.
  accountFactory?: Address; // Z0tzAccountFactory — emits AccountCreated on smart-account deploy. Source for accounts_v7.
  internalBridge?: Address; zusdcTransmitter?: Address; zusdcMessenger?: Address; mockYieldStrategy?: Address; timedVault?: Address;
  emergencyKeyMethod?: Address; guardianQuorumMethod?: Address;
  policyFactory?: Address;
  // Tezcatli (Aave V3 yield) — optional; only present on chains where
  // AAVE_V3_POOL_<chainId> was set at deploy time.
  tezcatliVault?: Address; tezcatliAdapter?: Address;
  tezcatliRiskPolicy?: Address; tezcatliFactory?: Address;
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

// Address fields that MUST be present and well-formed on every chain that has
// a V7 deployment env blob. (Registry-only chains that omit the whole blob are
// handled by the `!raw` guard above — if the blob exists, these must be valid.)
const REQUIRED_V7_ADDRESSES = [
  "ledger", "sweeper", "vault", "nameRegistry", "recoveryHub",
  "paymaster", "zusdc", "tokenRegistry",
] as const;
// Address fields that are optional (not deployed on every chain) but, when
// present, must still be valid 0x-20-byte hex (a corrupted paste must throw,
// not silently route a tx to a malformed address).
const OPTIONAL_V7_ADDRESSES = [
  "airdropClaim", "usdc", "entryPoint", "feeAccounting", "treasury",
  "accountFactory", "internalBridge", "zusdcTransmitter", "zusdcMessenger",
  "mockYieldStrategy", "timedVault", "emergencyKeyMethod", "guardianQuorumMethod",
  "policyFactory", "tezcatliVault", "tezcatliAdapter", "tezcatliRiskPolicy",
  "tezcatliFactory",
] as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isValidAddress(v: unknown): v is Address {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

/**
 * Parse + VALIDATE the DEPLOYMENT_V7_<chainId> env blob. The blob is pasted by
 * hand into Vercel, so the failure mode is a truncated / em-dash-mangled JSON
 * that either throws on parse or — worse — yields a partially-valid object
 * where e.g. `d.sweeper` is undefined and a tx silently goes to
 * `address(undefined)`. We fail loudly here instead, naming the offending
 * field + chainId so the misconfig is obvious in logs.
 */
export function v7Deployment(chainId: number): V7Deployment {
  const raw = process.env[`DEPLOYMENT_V7_${chainId}`];
  if (!raw) throw new Error(`Missing DEPLOYMENT_V7_${chainId} (deploy + set the env blob)`);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e: any) {
    throw new Error(`DEPLOYMENT_V7_${chainId} is not valid JSON (likely a truncated/mangled paste): ${e?.message ?? e}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`DEPLOYMENT_V7_${chainId} did not parse to a JSON object`);
  }

  for (const f of REQUIRED_V7_ADDRESSES) {
    const v = (parsed as any)[f];
    if (v === undefined || v === null) {
      throw new Error(`DEPLOYMENT_V7_${chainId} missing required address field "${f}"`);
    }
    if (!isValidAddress(v)) {
      throw new Error(`DEPLOYMENT_V7_${chainId} field "${f}" is not a valid 0x-20-byte address: "${String(v)}"`);
    }
  }
  for (const f of OPTIONAL_V7_ADDRESSES) {
    const v = (parsed as any)[f];
    if (v !== undefined && v !== null && !isValidAddress(v)) {
      throw new Error(`DEPLOYMENT_V7_${chainId} optional field "${f}" is present but malformed (expected 0x-20-byte address): "${String(v)}"`);
    }
  }

  return parsed as unknown as V7Deployment;
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

/**
 * Read-only public client — does NOT require RELAYER_PRIVATE_KEY. Used by
 * routes that only need to call view functions (e.g. H-4 ownerX/Y gate in
 * /api/v7/recover/artifact).
 */
export function publicClientFor(chainId: number) {
  const chain = chainFor(chainId);
  const rpc = envOrThrow(`RPC_URL_${chainId}`);
  return createPublicClient({ chain, transport: makeTransport(rpc) });
}

// Minimal ABI for the Z0tzAccount ownerX()/ownerY() public getters.
const accountOwnerAbi = [
  { name: "ownerX", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "ownerY", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

/** Read (ownerX, ownerY) from a Z0tzAccount on `chainId`. Throws on RPC error. */
export async function readAccountOwner(chainId: number, account: Address): Promise<{ ownerX: bigint; ownerY: bigint }> {
  const pub = publicClientFor(chainId);
  const [ownerX, ownerY] = await Promise.all([
    pub.readContract({ address: account, abi: accountOwnerAbi, functionName: "ownerX" }) as Promise<bigint>,
    pub.readContract({ address: account, abi: accountOwnerAbi, functionName: "ownerY" }) as Promise<bigint>,
  ]);
  return { ownerX, ownerY };
}

/**
 * Bug 4 fix (2026-06-14 smoke): pre-broadcast simulation.
 *
 * Org/name submitters were paying gas on tx that revert because the
 * relayer broadcast without checking. Now every submitter pre-simulates
 * via eth_call (pub.simulateContract) using the same args + account.
 * A revert short-circuits with a typed error the route handler maps to
 * a 400 (NOT 500, NOT 200) and the audit log entry is marked failed so
 * billing/quota doesn't overcount griefer traffic.
 *
 * Identified by the sentinel-prefix "onchain_simulation_failed: <reason>".
 * Routes match on the prefix when deciding the HTTP status code.
 */
export const ONCHAIN_SIM_FAILED = "onchain_simulation_failed";

async function simulateOrThrow(pub: any, args: any): Promise<void> {
  try {
    await pub.simulateContract(args);
  } catch (e: any) {
    // viem packs the user-friendly revert reason on shortMessage; fall
    // back to message or the literal "revert" so the caller always has
    // SOMETHING actionable. Strip newlines so the audit-log row stays
    // single-line.
    const raw = (e?.shortMessage ?? e?.details ?? e?.message ?? "revert") as string;
    const reason = String(raw).split("\n")[0].slice(0, 200);
    throw new Error(`${ONCHAIN_SIM_FAILED}: ${reason}`);
  }
}

async function estimateOrFallback(pub: any, args: any, fallback: bigint): Promise<bigint> {
  // 2x safety: eth_estimateGas under-funds FHE-heavy operations because the
  // CoFHE TaskManager's nested createTask delegatecalls allocate gas in 63/64
  // chunks (EIP-150). On base-sepolia in particular a 1.2x margin OOG'd the
  // inner createTask at sub-2k gas. Honor the user-provided fallback so any
  // function that doesn't estimate cleanly still has a sane ceiling.
  try { const e = await pub.estimateContractGas(args); const safe = e * 2n; return safe > fallback ? safe : fallback; }
  catch { return fallback; }
}

/**
 * Realtime mirror of a just-submitted tx's logs into the V7 typed event
 * tables (credit_events_v7, ledger_events_v7, sweeper_events_v7,
 * airdrop_claims_v7, name_records_v7, recovery_events_v7, fee_events_v7,
 * tezcatli_events_v7, audit_alerts_v7). Mirrors the
 * `scheduleNameCacheBackfill` pattern: detached promise, swallow errors,
 * never block the relay response. The cron indexer (scripts/indexer-v7.ts)
 * later re-scans the same range and the INSERT OR IGNORE inserts are a
 * no-op — so this only buys latency, never causes drift.
 */
function scheduleIndexerMirror(chainId: number, txHash: Hex, deployment: V7Deployment): void {
  // CRITICAL (DB-as-source-of-truth): on Vercel serverless a bare detached
  // promise is killed the instant the HTTP response is sent — that silently
  // dropped most sweep/credit/airdrop mirrors. Next.js `after()` keeps the
  // function alive until the background work finishes, so every relayed tx
  // reliably lands in the typed event tables. Falls back to a detached
  // promise if `after()` is unavailable (non-request scope / older runtime).
  const work = async () => {
    try {
      await mirrorTxLogsToV7({ chainId, txHash, deployment });
    } catch { /* best-effort */ }
  };
  try {
    // Lazy import keeps this module importable outside the Next request runtime.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { after } = require("next/server") as { after?: (fn: () => void | Promise<void>) => void };
    if (typeof after === "function") { after(work); return; }
  } catch { /* fall through to detached */ }
  void work();
}

/**
 * V7-FINAL #11: name-cache backfill helper.
 *
 * Wait for the tx receipt + walk the registry events into the
 * `name_resolutions` Turso table. Wrapped in try/catch and detached from
 * the response path — a cache miss MUST NOT fail the relay.
 */
function scheduleNameCacheBackfill(opts: {
  chainId: number;
  pub: any;
  txHash: Hex;
  registryAddress: Address;
  nameHint?: string;
  parentHint?: Hex;
}): void {
  void (async () => {
    try {
      const receipt = await opts.pub.waitForTransactionReceipt({ hash: opts.txHash });
      if (receipt.status !== "success") return;
      await backfillFromReceipt({
        chainId: opts.chainId,
        receipt,
        registryAddress: opts.registryAddress,
        nameHint: opts.nameHint,
        parentHint: opts.parentHint,
      });
    } catch { /* swallow — best-effort */ }
  })();
}

// ── ABIs (minimal, match the deployed contracts) ─────────────────────────
const airdropAbi = [{ name: "claim", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" }, { name: "stealth", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" }], outputs: [] }] as const;
const sweeperAbi = [{ name: "privateSweepToLedger", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "stealthAddress", type: "address" }, { name: "token", type: "address" }, { name: "account", type: "address" }, { name: "viewer", type: "address" }, { name: "nonce", type: "uint256" }, { name: "amount", type: "uint64" }, { name: "deadline", type: "uint256" }, { name: "signature", type: "bytes" }], outputs: [] }] as const;
// V7-FINAL #10 + DELTA M-2: Tezcatli sweep. Arg order MUST match
// Z0tzSweeperV7.sweepToTezcatli exactly — lockOption (uint8) sits between
// amount and deadline.
const tezcatliSweeperAbi = [{ name: "sweepToTezcatli", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "stealthAddress", type: "address" }, { name: "token", type: "address" }, { name: "account", type: "address" }, { name: "viewer", type: "address" }, { name: "nonce", type: "uint256" }, { name: "amount", type: "uint64" }, { name: "lockOption", type: "uint8" }, { name: "deadline", type: "uint256" }, { name: "signature", type: "bytes" }], outputs: [] }] as const;
// V7-FINAL-2: gasless Tezcatli exit. Position is owned by the smart `account`,
// authorized by the account's passkey P-256 sig (raw keccak vs current owner).
// Arg order MUST match Z0tzSweeperV7.sweepFromTezcatli exactly (10 args).
const tezcatliWithdrawAbi = [{ name: "sweepFromTezcatli", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "account", type: "address" }, { name: "token", type: "address" }, { name: "shares", type: "uint256" }, { name: "destStealth", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "pkX", type: "uint256" }, { name: "pkY", type: "uint256" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" }], outputs: [] }] as const;
const namesAbi = [
  // V7-FINAL #14: `claim` now takes cleartext `name` as the first param so
  // the contract can validate the ASCII allowlist + length on-chain and
  // cross-check keccak256(abi.encode(name)) === nameHash.
  { name: "claim", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }, { name: "nameHash", type: "bytes32" }, { name: "nameLength", type: "uint256" }, { name: "pubX", type: "uint256" }, { name: "pubY", type: "uint256" }, { name: "resolvedAccount", type: "address" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" }], outputs: [] },
  // V7-FINAL #7: relayer-as-namespace-authority paths.
  { name: "claimAsAuthority", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }, { name: "nameHash", type: "bytes32" }, { name: "nameLength", type: "uint256" }, { name: "resolvedAccount", type: "address" }], outputs: [] },
  { name: "claimSubdomainAsAuthority", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "leafSegment", type: "string" }, { name: "parentNameHash", type: "bytes32" }, { name: "leafNameHash", type: "bytes32" }, { name: "resolvedAccount", type: "address" }], outputs: [] },
  { name: "repointAsAuthority", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "nameHash", type: "bytes32" }, { name: "newAccount", type: "address" }], outputs: [] },
  { name: "revokeAsAuthority", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "nameHash", type: "bytes32" }], outputs: [] },
  // Phase 1 B2B: admin-signed onboarding of a user under a subdomain root.
  // AUDIT M-3: contract signature is `claimSubdomainFor(ClaimSubFor p)` — a
  // TUPLE struct of 12 fields including the user-consent signature
  // (userSigR/userSigS). Earlier ABI listed 10 individual params + missing
  // user consent; that produced an empty-data revert on every claim because
  // the contract's abi.decode saw mismatched calldata.
  // V7-FINAL #14: `claimSubdomainFor` now takes `leafSegment` cleartext
  // as the first param so the contract validates the leaf on-chain.
  { name: "claimSubdomainFor", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "leafSegment", type: "string" },
      { name: "p", type: "tuple", components: [
      { name: "parentNameHash", type: "bytes32" }, { name: "leafNameHash", type: "bytes32" },
      { name: "userPubX", type: "uint256" }, { name: "userPubY", type: "uint256" },
      { name: "userResolvedAccount", type: "address" },
      { name: "adminPubX", type: "uint256" }, { name: "adminPubY", type: "uint256" },
      { name: "deadline", type: "uint64" }, { name: "sigR", type: "uint256" }, { name: "sigS", type: "uint256" },
      { name: "userSigR", type: "uint256" }, { name: "userSigS", type: "uint256" },
    ] }],
    outputs: [] },
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
  // V7-FINAL-2 H-1/M-1: 2-step cross-chain recovery. The relayer signs a
  // 10-field attest digest (RECOVERY_ATTEST_TAG, srcChainId, dstChainId, hub,
  // account, newOwnerX, newOwnerY, srcRecoveryId, srcEpoch, dstEpoch) over
  // toEthSignedMessageHash, then calls attestRecoveryForChain. The contract
  // reads its own recoveryEpoch[account] as dstEpoch, so the relayer MUST read
  // the same value on the dest chain to build the matching digest. After the
  // timelock anyone calls executeCrossChainRecovery; the account-owner may
  // cancelCrossChainRecovery during the window.
  { name: "recoveryEpoch", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint64" }] },
  { name: "attestRecoveryForChain", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "newOwnerX", type: "uint256" }, { name: "newOwnerY", type: "uint256" },
      { name: "srcChainId", type: "uint32" }, { name: "dstChainId", type: "uint256" },
      { name: "srcRecoveryId", type: "uint256" }, { name: "srcEpoch", type: "uint64" },
      { name: "attestation", type: "bytes" },
    ], outputs: [{ type: "uint256" }] },
  { name: "executeCrossChainRecovery", type: "function", stateMutability: "nonpayable", inputs: [{ name: "recoveryId", type: "uint256" }], outputs: [] },
  { name: "cancelCrossChainRecovery", type: "function", stateMutability: "nonpayable", inputs: [{ name: "recoveryId", type: "uint256" }], outputs: [] },
] as const;
// V7-FINAL-2: solidity `bytes32("z0tz-v7-recovery-attest")` — left-aligned,
// right-zero-padded to 32 bytes. Matches Z0tzRecoveryHub.RECOVERY_ATTEST_TAG.
const RECOVERY_ATTEST_TAG = ("0x" + Buffer.from(
  (() => { const e = new TextEncoder().encode("z0tz-v7-recovery-attest"); const p = new Uint8Array(32); p.set(e, 0); return p; })(),
).toString("hex")) as Hex;
const inEuint64 = { name: "amount", type: "tuple", components: [{ name: "ctHash", type: "uint256" }, { name: "securityZone", type: "uint8" }, { name: "utype", type: "uint8" }, { name: "signature", type: "bytes" }] } as const;
const ledgerAbi = [{ name: "spend", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "op", type: "tuple", components: [
    { name: "account", type: "address" }, { name: "token", type: "address" }, { name: "action", type: "uint8" },
    { name: "destAccount", type: "address" }, { name: "destAddress", type: "address" }, { name: "destChainId", type: "uint32" },
    // V7-FINAL #1: srcStealth bound at end of struct so non-xchain rows
    // (srcStealth = address(0)) stay byte-stable for prior signers; CrossChain*
    // actions REQUIRE non-zero. Field order matches Z0tzLedgerV7.SpendOp.
    { name: "srcStealth", type: "address" },
    // V7-FINAL-2 H-1: recipient decryption viewer for the DESTINATION-chain
    // credit of a CrossChainInternal spend. Bound into the signed digest AND
    // the source-chain authorizedHook[srcStealth] commitment so the dest-side
    // receiveDelivered hookData (action, finalAccount, viewer) is provably
    // passkey-authorized. Zero for non-xchain actions + CrossChainCashout.
    // Field order matches Z0tzLedgerV7.SpendOp (srcStealth, viewer, amount).
    { name: "viewer", type: "address" },
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
  ] }], outputs: [] },
  // Z0tzLedgerV7 custom errors — included so viem decodes the NAMED revert
  // (simulateOrThrow previously surfaced a bare "spend reverted").
  ...["AccountNotDeployed","AlreadyLocked","BadMode","BadNonce","BatchEmpty","BatchTooLarge","BridgeNotSet","DestNotFound","EntryNotFound","ExecutorMismatch","Expired","HookNotAuthorized","InvalidAction","InvalidDestination","InvalidPlainAmount","InvalidSignature","NotBridge","NotLocked","NotOwner","NotSelf","NotSweeper","NotZUSDCMessenger","PlainAmountTooSmall","PubkeyMismatch","TokenNotEnabled","TotalMismatch","ZeroAddress","ZeroAmount","ZUSDCMessengerNotSet"].map((n) => ({ name: n, type: "error", inputs: [] as const })),
] as const;

// (Request shapes now imported from @z0tz/sdk-v7 — top of file. Submitters
//  below take those typed shapes directly. F-6 prevention: there's only
//  ONE place to update an interface now, and the SDK's `digest.test.ts`
//  catches any encoded-shape drift before it can ship.)
import type {
  AirdropClaimReq as _AirdropReq, SweepReq as _SweepReq, SpendReq as _SpendReq,
  NameClaimReq as _NameReq, OrgClaimSubdomainReq as _OrgClaimSubReq,
  OrgRepointSubdomainReq as _OrgRepointReq, OrgRevokeSubdomainReq as _OrgRevokeReq,
  OrgSetPolicyReq as _OrgSetPolicyReq, OrgInitiateRecoveryReq as _OrgRecReq,
} from "../sdk-v7-types";

// ── Submitters ───────────────────────────────────────────────────────────
export async function submitAirdropClaim(chainId: number, r: _AirdropReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.pubX), BigInt(r.pubY), r.stealth, r.nonce, BigInt(r.sigR), BigInt(r.sigS)] as const;
  const simArgs = { address: d.airdropClaim, abi: airdropAbi, functionName: "claim", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 300_000n);
  const txHash = await wallet.writeContract({ address: d.airdropClaim, abi: airdropAbi, functionName: "claim", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitSweep(chainId: number, r: _SweepReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.stealthAddress, r.token, r.account, r.viewer, BigInt(r.nonce), BigInt(r.amount), BigInt(r.deadline), r.signature] as const;
  const simArgs = { address: d.sweeper, abi: sweeperAbi, functionName: "privateSweepToLedger", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 800_000n);
  const txHash = await wallet.writeContract({ address: d.sweeper, abi: sweeperAbi, functionName: "privateSweepToLedger", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

// V7-FINAL #10 + DELTA M-2: one-tx cash-in straight into the Tezcatli yield
// vault via Z0tzSweeperV7.sweepToTezcatli (independent `tezcatliNonce` track).
export interface TezcatliSweepReq {
  stealthAddress: Address; token: Address; account: Address; viewer: Address;
  nonce: string; amount: string; lockOption: number; deadline: string; signature: Hex;
}
export async function submitTezcatliSweep(chainId: number, r: TezcatliSweepReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  // Arg order mirrors the contract: stealth, token, account, viewer, nonce,
  // amount(uint64), lockOption(uint8), deadline, signature.
  const args = [r.stealthAddress, r.token, r.account, r.viewer, BigInt(r.nonce), BigInt(r.amount), r.lockOption, BigInt(r.deadline), r.signature] as const;
  const simArgs = { address: d.sweeper, abi: tezcatliSweeperAbi, functionName: "sweepToTezcatli", args, account } as const;
  // Bug-#4 fix: simulate before broadcast so contract-level reverts surface
  // as a 5xx with the revert reason instead of a silently-mined failed tx.
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 900_000n);
  const txHash = await wallet.writeContract({ address: d.sweeper, abi: tezcatliSweeperAbi, functionName: "sweepToTezcatli", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

// V7-FINAL-2: one-tx gasless Tezcatli exit via Z0tzSweeperV7.sweepFromTezcatli.
// The account's passkey P-256 sig authorizes burning `shares`; the sweeper
// unshields the underlying out of the vault and forwards it to a fresh one-time
// destStealth (no cash-in fee on the exit). Independent tezcatliWithdrawNonce
// track binds bytes32("tezcatliWithdraw") so a deposit/cashin sig can't replay.
export interface TezcatliWithdrawReq {
  account: Address; token: Address; shares: string; destStealth: Address;
  nonce: string; deadline: string; pkX: string; pkY: string; sigR: string; sigS: string;
}
export async function submitTezcatliWithdraw(chainId: number, r: TezcatliWithdrawReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  // Arg order mirrors the contract: account, token, shares(uint256),
  // destStealth, nonce, deadline, pkX, pkY, sigR, sigS.
  const args = [r.account, r.token, BigInt(r.shares), r.destStealth, BigInt(r.nonce), BigInt(r.deadline), BigInt(r.pkX), BigInt(r.pkY), BigInt(r.sigR), BigInt(r.sigS)] as const;
  const simArgs = { address: d.sweeper, abi: tezcatliWithdrawAbi, functionName: "sweepFromTezcatli", args, account } as const;
  // Bug-#4 pattern: simulate before broadcast so contract-level reverts surface
  // as a 400 with the revert reason instead of a silently-mined failed tx.
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 900_000n);
  const txHash = await wallet.writeContract({ address: d.sweeper, abi: tezcatliWithdrawAbi, functionName: "sweepFromTezcatli", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitSpend(chainId: number, r: _SpendReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const op = {
    account: r.account, token: r.token, action: r.action, destAccount: r.destAccount, destAddress: r.destAddress, destChainId: r.destChainId,
    // V7-FINAL #1: srcStealth — address(0) for same-chain; non-zero for
    // CrossChain* (signature-bound, contract reverts ZeroAddress otherwise).
    srcStealth: (r.srcStealth ?? "0x0000000000000000000000000000000000000000") as Address,
    // V7-FINAL-2 H-1: dest-credit viewer, zero for non-xchain / CC-Cashout.
    viewer: (r.viewer ?? "0x0000000000000000000000000000000000000000") as Address,
    amount: { ctHash: BigInt(r.amount.ctHash), securityZone: r.amount.securityZone, utype: r.amount.utype, signature: r.amount.signature },
    plainAmount: BigInt(r.plainAmount ?? "0"),
    nonce: BigInt(r.nonce), deadline: BigInt(r.deadline), pkX: BigInt(r.pkX), pkY: BigInt(r.pkY), sigR: BigInt(r.sigR), sigS: BigInt(r.sigS),
  };
  const simArgs = { address: d.ledger, abi: ledgerAbi, functionName: "spend", args: [op as any], account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 1_200_000n);
  const txHash = await wallet.writeContract({ address: d.ledger, abi: ledgerAbi, functionName: "spend", args: [op as any], gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitNameClaim(chainId: number, r: _NameReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  // V7-FINAL #14: contract takes the cleartext `name` as the first param.
  const args = [r.name, r.nameHash, BigInt(r.nameLength), BigInt(r.pubX), BigInt(r.pubY), r.resolvedAccount, BigInt(r.sigR), BigInt(r.sigS)] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "claim", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claim", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry, nameHint: r.name });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

// ── B2B SaaS: org admin ops ──────────────────────────────────────────────
// (Request interfaces re-exported from @z0tz/sdk-v7 — top of file.)

export async function submitOrgClaimSubdomain(chainId: number, r: _OrgClaimSubReq & { userSigR?: string | bigint; userSigS?: string | bigint }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  // AUDIT M-3: the contract's claimSubdomainFor expects the ClaimSubFor
  // tuple INCLUDING the user-consent signature (userSigR/userSigS). If the
  // caller didn't include them, default to zero — the on-chain
  // _verifySubdomainConsent will refuse and the tx will revert
  // BadSignature, which is the correct outcome (auth-required by design).
  const tuple = {
    parentNameHash: r.parentNameHash, leafNameHash: r.leafNameHash,
    userPubX: BigInt(r.userPubX), userPubY: BigInt(r.userPubY),
    userResolvedAccount: r.userResolvedAccount,
    adminPubX: BigInt(r.adminPubX), adminPubY: BigInt(r.adminPubY),
    deadline: BigInt(r.deadline),
    sigR: BigInt(r.sigR), sigS: BigInt(r.sigS),
    userSigR: r.userSigR !== undefined ? BigInt(r.userSigR) : 0n,
    userSigS: r.userSigS !== undefined ? BigInt(r.userSigS) : 0n,
  };
  // V7-FINAL #14: contract takes cleartext `leafSegment` first.
  const args = [r.leafSegment, tuple] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainFor", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 600_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainFor", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry, nameHint: r.leafSegment, parentHint: r.parentNameHash as Hex });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitOrgRepointSubdomain(chainId: number, r: _OrgRepointReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.leafNameHash,
    BigInt(r.newUserPubX), BigInt(r.newUserPubY), r.newResolvedAccount,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "repointSubdomain", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 500_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "repointSubdomain", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitOrgRevokeSubdomain(chainId: number, r: _OrgRevokeReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.leafNameHash,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "revokeSubdomain", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "revokeSubdomain", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitOrgSetPolicy(chainId: number, r: _OrgSetPolicyReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.rootNameHash, r.policy,
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "setPolicy", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "setPolicy", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitOrgInitiateRecovery(chainId: number, r: _OrgRecReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [
    r.account,
    BigInt(r.newOwnerX), BigInt(r.newOwnerY),
    BigInt(r.adminPubX), BigInt(r.adminPubY),
    BigInt(r.deadline), BigInt(r.sigR), BigInt(r.sigS),
  ] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "initiateOrgRecovery", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 700_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "initiateOrgRecovery", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRecoverInitiate(chainId: number, r: { account: Address; methodIndex: string; newOwnerX: string; newOwnerY: string; proof: Hex }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.account, BigInt(r.methodIndex), BigInt(r.newOwnerX), BigInt(r.newOwnerY), r.proof] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "initiateRecovery", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 500_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "initiateRecovery", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRecoverExecute(chainId: number, r: { recoveryId: string }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.recoveryId)] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "executeRecovery", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "executeRecovery", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

// ── V7-FINAL-2 H-1: cross-chain recovery (2-step attest) submitters ─────
//
// The relayer is the on-chain `crossChainRelayer`. To attest a rotation that
// already happened on `srcChainId`, it signs the 10-field digest the dest hub
// rebuilds in `attestRecoveryForChain` and submits the attestation. The hub
// reads its own `recoveryEpoch[account]` as the `dstEpoch` field, so we read
// the SAME value on the dest chain and bind it into the signed preimage —
// otherwise `digest.recover(attestation) != crossChainRelayer` reverts.
export interface RecoverAttestXChainReq {
  /** Destination chain — where the new owner key takes effect. */
  chainId: number;
  account: Address;
  newOwnerX: string;
  newOwnerY: string;
  /** Source chain where the local recovery completed (uint32). */
  srcChainId: number;
  /** Source recoveryId (off-chain trace, bound into the digest). */
  srcRecoveryId: string;
  /** Source post-rotation epoch (bound into the digest). */
  srcEpoch: string;
}

export async function submitRecoverAttestXChain(chainId: number, r: RecoverAttestXChainReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  // dstEpoch == the hub's current recoveryEpoch[account] on THIS (dest) chain.
  const dstEpoch = await pub.readContract({ address: d.recoveryHub, abi: hubAbi, functionName: "recoveryEpoch", args: [r.account] }) as bigint;
  // Rebuild the 10-field inner digest exactly as Z0tzRecoveryHub does:
  //   keccak256(abi.encode(TAG, srcChainId, dstChainId, hub, account,
  //                        newOwnerX, newOwnerY, srcRecoveryId, srcEpoch, dstEpoch))
  const inner = keccak256(encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint32" }, { type: "uint256" }, { type: "address" },
      { type: "address" }, { type: "uint256" }, { type: "uint256" },
      { type: "uint256" }, { type: "uint64" }, { type: "uint64" },
    ],
    [
      RECOVERY_ATTEST_TAG, r.srcChainId, BigInt(chainId), d.recoveryHub,
      r.account, BigInt(r.newOwnerX), BigInt(r.newOwnerY),
      BigInt(r.srcRecoveryId), BigInt(r.srcEpoch), dstEpoch,
    ],
  ));
  // toEthSignedMessageHash(inner) — account.signMessage over raw 32 bytes does
  // the \x19Ethereum Signed Message prefixing the contract expects.
  const attestation = await account.signMessage({ message: { raw: inner } });
  const args = [r.account, BigInt(r.newOwnerX), BigInt(r.newOwnerY), r.srcChainId, BigInt(chainId), BigInt(r.srcRecoveryId), BigInt(r.srcEpoch), attestation] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "attestRecoveryForChain", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 500_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "attestRecoveryForChain", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRecoverExecuteXChain(chainId: number, r: { recoveryId: string }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.recoveryId)] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "executeCrossChainRecovery", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "executeCrossChainRecovery", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRecoverCancelXChain(chainId: number, r: { recoveryId: string }): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [BigInt(r.recoveryId)] as const;
  const simArgs = { address: d.recoveryHub, abi: hubAbi, functionName: "cancelCrossChainRecovery", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 300_000n);
  const txHash = await wallet.writeContract({ address: d.recoveryHub, abi: hubAbi, functionName: "cancelCrossChainRecovery", args, gas } as any) as Hex;
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

// ── V7-FINAL #7: relayer-as-namespace-authority submitters ─────────────
//
// The calling relayer EOA (this key) is the on-chain authority — pubkeyHash
// is derived from msg.sender. Cross-chain canonical uniqueness is enforced
// by the off-chain state machine BEFORE these tx submit.
import type {
  NameClaimAsAuthorityReq as _AuthClaimReq,
  SubdomainClaimAsAuthorityReq as _AuthSubClaimReq,
  RepointAsAuthorityReq as _AuthRepointReq,
  RevokeAsAuthorityReq as _AuthRevokeReq,
} from "../sdk-v7-types";

export async function submitNameClaimAsAuthority(chainId: number, r: _AuthClaimReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.name, r.nameHash, BigInt(r.nameLength), r.resolvedAccount] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "claimAsAuthority", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claimAsAuthority", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry, nameHint: r.name });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitSubdomainClaimAsAuthority(chainId: number, r: _AuthSubClaimReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.leafSegment, r.parentNameHash, r.leafNameHash, r.resolvedAccount] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainAsAuthority", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 400_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "claimSubdomainAsAuthority", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry, nameHint: r.leafSegment, parentHint: r.parentNameHash as Hex });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRepointAsAuthority(chainId: number, r: _AuthRepointReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.nameHash, r.newAccount] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "repointAsAuthority", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 300_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "repointAsAuthority", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}

export async function submitRevokeAsAuthority(chainId: number, r: _AuthRevokeReq): Promise<{ txHash: Hex }> {
  const d = v7Deployment(chainId); const { account, pub, wallet } = clients(chainId);
  const args = [r.nameHash] as const;
  const simArgs = { address: d.nameRegistry, abi: namesAbi, functionName: "revokeAsAuthority", args, account } as const;
  await simulateOrThrow(pub, simArgs);
  const gas = await estimateOrFallback(pub, simArgs, 300_000n);
  const txHash = await wallet.writeContract({ address: d.nameRegistry, abi: namesAbi, functionName: "revokeAsAuthority", args, gas } as any);
  scheduleNameCacheBackfill({ chainId, pub, txHash, registryAddress: d.nameRegistry });
  scheduleIndexerMirror(chainId, txHash, d);
  return { txHash };
}
