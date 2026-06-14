/**
 * Zod schemas for the V7 API surface.
 *
 * Every shape sent or returned by /api/v7/* is defined here as a zod
 * schema, then both:
 *   1. Runtime-validated at the route boundary (req.body.parse(...))
 *   2. Registered with the v7Registry for OpenAPI spec generation
 *
 * BigInt-bearing fields are sent as base-10 strings (browsers can't
 * JSON.stringify a BigInt). Address fields are 0x-prefixed lower-case
 * hex (viem Address). Hex bytes are 0x-prefixed.
 *
 * Auth headers (referenced by the security schemes in registry.ts):
 *   /api/v7/org/*  ->  X-Z0tz-Org-Auth: keyId=<8-hex>;ts=<unix-ms>;sig=<64-hex>
 *                      sig = HMAC_SHA256(plaintext_key,
 *                        `${ts}|${METHOD}|${path}|${sha256Hex(body)}`)
 *                      ±5 min replay window. `body` is the EXACT bytes the
 *                      client sends: stringify the payload once, sign that
 *                      string, then POST it — the server sha256s the raw
 *                      request body, not the parsed JSON.
 *   user-tier      ->  X-Z0tz-Sig (P-256 over body) + X-Z0tz-PubX / -PubY.
 */
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// One-time extension; safe to call repeatedly across module imports.
extendZodWithOpenApi(z);

// ── Primitive shape helpers ─────────────────────────────────────────────

const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 20-byte address")
  .openapi({ example: "0x000000000000000000000000000000000000dEaD" });

const Bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "must be 0x + 32 bytes")
  .openapi({ example: "0x" + "00".repeat(32) });

const HexSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, "0x-prefixed hex")
  .openapi({ example: "0x" });

const BigIntStr = z
  .string()
  .regex(/^\d+$/, "decimal string")
  .openapi({ example: "0", description: "uint256 / uint64 serialized as base-10 string" });

// ── Shared building blocks ──────────────────────────────────────────────

export const ChainIdSchema = z
  .number()
  .int()
  .positive()
  .openapi({ example: 421614, description: "EVM chain id (e.g. 421614 = arb-sepolia)" });

export const TxHashResponseSchema = z
  .object({ txHash: Bytes32Schema.openapi({ description: "Submitted transaction hash" }) })
  .openapi("TxHashResponse");

export const ErrorResponseSchema = z
  .object({ error: z.string().openapi({ description: "Human-readable error reason" }) })
  .openapi("ErrorResponse");

// CoFHE InEuint64 — encrypted-amount input as serialized by the CLI/GUI.
const InEuint64Schema = z
  .object({
    ctHash: BigIntStr.openapi({ description: "Ciphertext handle (uint256 decimal)" }),
    securityZone: z.number().int().min(0),
    utype: z.number().int().min(0),
    signature: HexSchema.openapi({ description: "CoFHE input proof signature" }),
  })
  .openapi("InEuint64");

// ── /api/v7/airdrop ─────────────────────────────────────────────────────

export const AirdropClaimReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        pubX: BigIntStr,
        pubY: BigIntStr,
        stealth: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/)
          .openapi({ description: "Stealth address bound into the signed digest" }),
        nonce: Bytes32Schema,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("AirdropClaim"),
  })
  .openapi("AirdropClaimRequest");

// ── /api/v7/cashin ──────────────────────────────────────────────────────

export const SweepReqSchema = z
  .object({
    stealthAddress: AddressSchema,
    token: AddressSchema,
    account: AddressSchema,
    viewer: AddressSchema,
    nonce: BigIntStr,
    amount: BigIntStr,
    deadline: BigIntStr.openapi({ description: "Unix seconds; reverts past this" }),
    signature: HexSchema.openapi({ description: "P-256 sig over the sweep digest" }),
  })
  .openapi("SweepParams");

export const CashinReqSchema = z
  .object({ chainId: ChainIdSchema, sweep: SweepReqSchema })
  .openapi("CashinRequest");

// ── /api/v7/tezcatli/sweep ───────────────────────────────────────────────
// V7-FINAL #10: sweepToTezcatli — like cashin but routes the swept funds into
// the Tezcatli yield vault instead of the ledger. lockOption picks the deposit
// lock tier (0=none, 1/2=timed). Digest binds bytes32("tezcatliNonce").
export const TezcatliSweepParamsSchema = z
  .object({
    stealthAddress: AddressSchema,
    token: AddressSchema,
    account: AddressSchema,
    viewer: AddressSchema,
    nonce: BigIntStr,
    amount: BigIntStr,
    lockOption: z.number().int().min(0).max(2).openapi({ description: "0=none 1/2=timed lock tier" }),
    deadline: BigIntStr.openapi({ description: "Unix seconds; reverts past this" }),
    signature: HexSchema.openapi({ description: "P-256 sig over the tezcatli sweep digest" }),
  })
  .openapi("TezcatliSweepParams");

export const TezcatliSweepReqSchema = z
  .object({ chainId: ChainIdSchema, sweep: TezcatliSweepParamsSchema })
  .openapi("TezcatliSweepRequest");

// ── /api/v7/spend ───────────────────────────────────────────────────────

export const SpendOpSchema = z
  .object({
    account: AddressSchema.openapi({ description: "Smart-account signer" }),
    token: AddressSchema,
    action: z.number().int().min(0).max(3).openapi({ description: "0=Internal 1=Cashout 2=CrossChainInternal 3=CrossChainCashout" }),
    destAccount: AddressSchema.openapi({ description: "Used on Internal/CC-Internal" }),
    destAddress: AddressSchema.openapi({ description: "Used on Cashout/CC-Cashout" }),
    destChainId: z.number().int().openapi({ description: "Non-zero on CC-* actions" }),
    // V7-FINAL #1: signature-bound user-supplied source-chain stealth used
    // on CrossChain* actions; address(0) on same-chain. The ledger unshields
    // to this stealth via the vault; the stealth then drives the cctp-clone
    // burn off-chain.
    srcStealth: AddressSchema.openapi({ description: "User-supplied src stealth for CrossChain*; address(0) for same-chain" }),
    // V7-FINAL-2 H-1: dest-credit viewer for CrossChainInternal, bound into
    // the signed digest + authorizedHook commitment. address(0) for same-chain
    // and CrossChainCashout. Field order matches Z0tzLedgerV7.SpendOp.
    viewer: AddressSchema.openapi({ description: "Dest-credit viewer for CC-Internal; address(0) for same-chain/CC-Cashout" }),
    amount: InEuint64Schema,
    // F-6 fix: SpendOp on-chain has plainAmount (uint64) between amount and
    // nonce. Internal paths pass "0"; cashout paths pass the matching
    // unshield amount (audit C-2 binds plaintext to the signed digest).
    plainAmount: BigIntStr.openapi({ description: "0 for Internal; matching unshield amount for Cashout" }),
    nonce: BigIntStr,
    deadline: BigIntStr,
    pkX: BigIntStr,
    pkY: BigIntStr,
    sigR: BigIntStr,
    sigS: BigIntStr,
  })
  .openapi("SpendOp");

export const SpendReqSchema = z
  .object({ chainId: ChainIdSchema, op: SpendOpSchema })
  .openapi("SpendRequest");

// ── /api/v7/multispend ──────────────────────────────────────────────────

export const MultispendRecipientSchema = z
  .object({
    mode: z.number().int().min(0).max(3),
    encAmount: InEuint64Schema,
    plainAmount: BigIntStr,
    destAccount: AddressSchema,
    destAddress: AddressSchema,
    destChainId: z.number().int().min(0).max(0xffffffff),
  })
  .openapi("MultispendRecipient");

export const MultispendOpSchema = z
  .object({
    account: AddressSchema,
    token: AddressSchema,
    totalPlainAmount: BigIntStr,
    senderExecutor: AddressSchema,
    nonce: BigIntStr,
    deadline: BigIntStr,
    pkX: BigIntStr,
    pkY: BigIntStr,
    sigR: BigIntStr,
    sigS: BigIntStr,
    // Hard cap of 50 rows on the API boundary (defense-in-depth for H-1b);
    // the route also enforces 50 server-side. Contract documents "up to 30
    // rows" but the API accepts up to 50 to avoid a foot-gun mismatch with
    // future contract revisions.
    recipients: z.array(MultispendRecipientSchema).min(1).max(50),
  })
  .openapi("MultispendOp");

export const MultispendReqSchema = z
  .object({ chainId: ChainIdSchema, op: MultispendOpSchema })
  .openapi("MultispendRequest");

// ── /api/v7/names ───────────────────────────────────────────────────────

export const NameClaimReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        // V7-FINAL #14: cleartext name (a-z 0-9 - only, length 4-32). The
        // contract validates ASCII + length on-chain and verifies that
        // keccak256(abi.encode(name)) === nameHash.
        name: z.string().openapi({ description: "Cleartext name (a-z0-9- only); contract validates on-chain", example: "alice" }),
        nameHash: Bytes32Schema,
        nameLength: BigIntStr,
        pubX: BigIntStr,
        pubY: BigIntStr,
        resolvedAccount: AddressSchema,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("SignedNameClaim"),
  })
  .openapi("NameClaimRequest");

// ── /api/v7/resolve/:nameHash ───────────────────────────────────────────
//
// V7-FINAL #11: off-chain name resolution. The on-chain contract returns
// the address(0x1) sentinel for non-LEDGER_ROLE callers; the relayer caches
// (nameHash -> resolvedAccount) at submit time + a one-shot backfill, and
// exposes it here gated by a P-256 passkey signature so casual scrapers
// cannot bulk-enumerate the namespace.

export const ResolveResSchema = z
  .object({
    nameHash: Bytes32Schema,
    resolvedAccount: AddressSchema,
    chainId: ChainIdSchema,
    active: z.boolean(),
    claimedAt: z.number().int().openapi({ description: "ms since epoch (first observation by the relayer)" }),
  })
  .openapi("ResolveResponse");

// ── /api/v7/recover ─────────────────────────────────────────────────────

export const RecoverInitiateReqSchema = z
  .object({
    chainId: ChainIdSchema,
    action: z.literal("initiate"),
    account: AddressSchema,
    methodIndex: BigIntStr,
    newOwnerX: BigIntStr,
    newOwnerY: BigIntStr,
    proof: HexSchema.openapi({ description: "Method-specific proof bytes" }),
  })
  .openapi("RecoverInitiateRequest");

export const RecoverExecuteReqSchema = z
  .object({
    chainId: ChainIdSchema,
    action: z.literal("execute"),
    recoveryId: BigIntStr,
  })
  .openapi("RecoverExecuteRequest");

// ── /api/v7/recover/xchain — V7-FINAL-2 H-1 two-step cross-chain recovery ──
//
// `attest`: relayer signs the 10-field RECOVERY_ATTEST_TAG digest and calls
// attestRecoveryForChain on the dest hub (opens the timelock). `execute`:
// permissionless, after the timelock. `cancel`: owner-only (the relayer cannot
// satisfy the msg.sender==account check; surfaced as a 400 on-chain revert —
// the route exists for completeness / future account-signed relay).
export const RecoverAttestXChainReqSchema = z
  .object({
    chainId: ChainIdSchema.openapi({ description: "Destination chain id" }),
    action: z.literal("attest"),
    account: AddressSchema,
    newOwnerX: BigIntStr,
    newOwnerY: BigIntStr,
    srcChainId: ChainIdSchema.openapi({ description: "Source chain where local recovery completed" }),
    srcRecoveryId: BigIntStr,
    srcEpoch: BigIntStr,
  })
  .openapi("RecoverAttestXChainRequest");

export const RecoverExecuteXChainReqSchema = z
  .object({
    chainId: ChainIdSchema,
    action: z.literal("execute-xchain"),
    recoveryId: BigIntStr,
  })
  .openapi("RecoverExecuteXChainRequest");

export const RecoverCancelXChainReqSchema = z
  .object({
    chainId: ChainIdSchema,
    action: z.literal("cancel-xchain"),
    recoveryId: BigIntStr,
  })
  .openapi("RecoverCancelXChainRequest");

// /api/v7/recover/artifact PUT body (encrypted-blob storage).
export const EncryptedArtifactSchema = z
  .object({
    pubkeyHash: Bytes32Schema,
    chainId: ChainIdSchema.optional(),
    account: AddressSchema.optional(),
    version: z.number().int().optional(),
    ciphertext: z.string().openapi({ description: "base64 ciphertext blob" }),
    iv: z.string(),
    salt: z.string(),
    tag: z.string(),
    kdf: z.string().optional(),
  })
  .openapi("EncryptedArtifact");

// ── /api/v7/admin/issue-org-key ─────────────────────────────────────────

export const IssueOrgKeyReqSchema = z
  .object({
    orgName: z.string().min(1).max(128),
    subdomainRoot: z.string().min(1).max(64),
    tier: z.enum(["sandbox", "verified"]).optional(),
    contactEmail: z.string().email().max(256).optional().nullable(),
  })
  .openapi("IssueOrgKeyRequest");

// ── /api/v7/stealth/{watch,inbound} ────────────────────────────────────

export const StealthWatchReqSchema = z
  .object({
    pubkeyHash: Bytes32Schema,
    address: AddressSchema.openapi({ description: "Deterministic stealth address derived from passkey" }),
    index: z.number().int().min(0).optional().openapi({ description: "Derivation index (one per payer/stream)" }),
  })
  .openapi("StealthWatchRequest");

export const StealthInboundRowSchema = z
  .object({
    chain_id: z.number().int(),
    stealth_address: AddressSchema,
    token: AddressSchema,
    from_addr: AddressSchema,
    amount: z.string(),
    block: z.number().int(),
    tx_hash: Bytes32Schema,
    log_index: z.number().int(),
    ts: z.number().int(),
    swept: z.number().int().min(0).max(1),
  })
  .openapi("StealthInbound");

export const StealthInboundResponseSchema = z
  .object({ inbound: z.array(StealthInboundRowSchema) })
  .openapi("StealthInboundResponse");

// ── /api/v7/org/* — B2B SaaS admin surface ──────────────────────────────

/**
 * Org-admin-signed claim of a subdomain under the caller's root. The
 * server scope-checks that `parentNameHash` matches the API key's
 * `subdomainRootHash` — even with a valid key you cannot onboard under
 * someone else's subdomain.
 *
 * The P-256 signature is over the names contract's claimSubdomainFor
 * digest (chainid, registry, ADMIN_CLAIM_SUB_TAG, parentNameHash,
 * leafNameHash, userPubkeyHash, userResolvedAccount, adminPubkeyHash,
 * rootNonce, deadline). The relayer submits the tx; gas is on Z0tz.
 */
export const OrgClaimSubdomainReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        // V7-FINAL #14: cleartext leaf segment validated on-chain.
        leafSegment: z.string().openapi({ description: "Cleartext leaf segment (a-z0-9- only) — e.g. \"arturo\" for arturo.coppel.z0tz", example: "arturo" }),
        parentNameHash: Bytes32Schema.openapi({
          description:
            "Must equal the API key's subdomainRootHash. Server-side scope check.",
        }),
        leafNameHash: Bytes32Schema.openapi({
          description: "Hash of the new subdomain being claimed (e.g. arturo.coppel.z0tz)",
        }),
        userPubX: BigIntStr.openapi({ description: "Onboarded user's P-256 pubkey X" }),
        userPubY: BigIntStr,
        userResolvedAccount: AddressSchema.openapi({
          description: "Smart-account address the subdomain resolves to",
        }),
        adminPubX: BigIntStr.openapi({ description: "Org admin's P-256 pubkey X" }),
        adminPubY: BigIntStr,
        deadline: BigIntStr.openapi({ description: "Unix seconds; sig expires after" }),
        sigR: BigIntStr.openapi({ description: "Admin P-256 signature r" }),
        sigS: BigIntStr,
        // AUDIT M-3: the contract's ClaimSubFor struct also takes the
        // user's own P-256 sig over a per-account consent nonce. The
        // landing forwards it as part of the tuple; without it the
        // contract reverts BadSignature on _verifySubdomainConsent.
        userSigR: BigIntStr.optional().openapi({ description: "User-consent P-256 sig r (audit M-3); defaults to 0 if absent which the contract will refuse" }),
        userSigS: BigIntStr.optional().openapi({ description: "User-consent P-256 sig s (audit M-3)" }),
      })
      .openapi("OrgSubdomainClaim"),
  })
  .openapi("OrgClaimSubdomainRequest");

/**
 * Org-admin-signed repoint of an already-claimed subdomain leaf to a new
 * user pubkey + resolved account. The contract enforces the admin sig
 * via `parent.pubkeyHash == keccak256(adminPubX, adminPubY)`; the API
 * key proves the caller is the right org. We do NOT scope-check the
 * parent on the API side (the request only carries the leaf hash) — the
 * parent.adminPubkey check on-chain is the authoritative gate.
 */
export const OrgRepointSubdomainReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        leafNameHash: Bytes32Schema.openapi({ description: "Subdomain leaf being repointed" }),
        newUserPubX: BigIntStr.openapi({ description: "New user P-256 pubkey X" }),
        newUserPubY: BigIntStr,
        newResolvedAccount: AddressSchema.openapi({ description: "New smart-account the leaf resolves to" }),
        adminPubX: BigIntStr.openapi({ description: "Org admin's P-256 pubkey X" }),
        adminPubY: BigIntStr,
        deadline: BigIntStr,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("OrgSubdomainRepoint"),
  })
  .openapi("OrgRepointSubdomainRequest");

/**
 * Org-admin-signed revoke of a subdomain leaf. Same scope model as
 * repoint: on-chain parent.adminPubkey check is authoritative; the API
 * key proves the caller is the right org.
 */
export const OrgRevokeSubdomainReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        leafNameHash: Bytes32Schema,
        adminPubX: BigIntStr,
        adminPubY: BigIntStr,
        deadline: BigIntStr,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("OrgSubdomainRevoke"),
  })
  .openapi("OrgRevokeSubdomainRequest");

/**
 * Org-admin-signed attach of a policy contract to the org's subdomain
 * root. API-side scope check: `claim.rootNameHash` MUST equal the API
 * key's `subdomainRootHash` — a policy can only be set on this org's
 * root.
 */
export const OrgSetPolicyReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        rootNameHash: Bytes32Schema.openapi({
          description: "Must equal the API key's subdomainRootHash. Server-side scope check.",
        }),
        policy: AddressSchema.openapi({ description: "Deployed policy contract address" }),
        adminPubX: BigIntStr,
        adminPubY: BigIntStr,
        deadline: BigIntStr,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("OrgSetPolicyClaim"),
  })
  .openapi("OrgSetPolicyRequest");

/**
 * Org-admin-signed `initiateOrgRecovery` on the recovery hub. The hub
 * derives the org root + admin pubkey from `nameRegistry.orgRootOfAccount`,
 * so the API-side cannot pre-scope without an extra contract call. The
 * API key still proves the caller is the right org; the chain enforces
 * admin sig + policy delay.
 */
export const OrgInitiateRecoveryReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
        account: AddressSchema.openapi({ description: "User smart-account being recovered" }),
        newOwnerX: BigIntStr,
        newOwnerY: BigIntStr,
        adminPubX: BigIntStr,
        adminPubY: BigIntStr,
        deadline: BigIntStr,
        sigR: BigIntStr,
        sigS: BigIntStr,
      })
      .openapi("OrgInitiateRecoveryClaim"),
  })
  .openapi("OrgInitiateRecoveryRequest");

// ── /api/v7/bridge-relay ────────────────────────────────────────────────
//
// V7-FINAL #1/#2: cross-chain delivery is now a single attested channel.
// The ledger unshields directly into a user-supplied `srcStealth` via
// `vault.confidentialTransferOut`; the stealth then drives the cctp-clone
// `depositForBurn` off-chain. This endpoint observes ONLY the resulting
// `ZUSDCMessageTransmitter.MessageSent(bytes)` event on the source tx —
// the old `Z0tzInternalBridge.InternalMessageSent` channel was deleted.
//
// The relayer signs the cctp-clone attestation digest
//   keccak256(abi.encode("ZUSDCMessageTransmitterReceive",
//                        destChainId, destTransmitter, message))
// (EIP-191) and submits `receiveMessage(message, signature)` on the dest
// chain's `ZUSDCMessageTransmitter`.
//
// Idempotent on `(srcChainId, srcTxHash)` — see `bridge_replays` table.

export const BridgeRelayReqSchema = z
  .object({
    srcChainId: ChainIdSchema,
    dstChainId: ChainIdSchema,
    srcTxHash: Bytes32Schema.openapi({
      description: "Source tx that emitted ZUSDCMessageTransmitter.MessageSent",
    }),
  })
  .openapi("BridgeRelayRequest");

export const BridgeRelayResponseSchema = z
  .object({
    dstTxHash: Bytes32Schema.openapi({
      description:
        "Dest-chain `receiveMessage` tx. On a replayed request, returns the prior hash.",
    }),
    status: z.enum(["delivered", "already-used"]).openapi({
      description:
        "`delivered` = the dest tx mined this call; `already-used` = the dest transmitter's nonce was already consumed (idempotent replay).",
    }),
  })
  .openapi("BridgeRelayResponse");

// ── /api/v7/tezcatli/* — yield-vault read + cosign surface ──────────────

export const TezcatliApyResponseSchema = z
  .object({
    chainId: ChainIdSchema,
    apyBps: z.number().int().min(0).openapi({ description: "Adapter's current APY in basis points (10000 = 100%)" }),
    apyPercent: z.string().openapi({ example: "5.23", description: "Same value rendered as a percentage string" }),
  })
  .openapi("TezcatliApyResponse");

export const TezcatliPositionResponseSchema = z
  .object({
    chainId: ChainIdSchema,
    account: AddressSchema,
    token: AddressSchema,
    principal: BigIntStr.openapi({ description: "Principal amount (uint256, in token's base units)" }),
    shares: BigIntStr.openapi({ description: "Vault share balance" }),
    grossPosition: BigIntStr.openapi({ description: "Principal + pending yield" }),
    pendingYield: BigIntStr.openapi({ description: "grossPosition - principal" }),
    pendingFeeBps: z.number().int().min(0).openapi({ description: "Early-withdraw fee at current time, in bps" }),
    withdrawUnlockAt: BigIntStr.openapi({ description: "Unix seconds; position is locked until then" }),
    lockOption: z.number().int().min(0).max(2).openapi({ description: "0=NONE, 1=30D, 2=90D" }),
  })
  .openapi("TezcatliPositionResponse");

export const TezcatliTotalsResponseSchema = z
  .object({
    chainId: ChainIdSchema,
    token: AddressSchema,
    totalAssets: BigIntStr.openapi({ description: "TVL in token base units" }),
    totalShares: BigIntStr,
  })
  .openapi("TezcatliTotalsResponse");

// Cosign requests — caller passes the *intent*; server returns prepared
// calldata + target. The deployed TezcatliVaultV7 has caller-authenticated
// deposit/withdraw paths (no separate-signer entrypoint), so the cosign
// flow today is "build the tx and let the org's account broadcast". An
// SDK update can switch this to a meta-tx submission when the contract
// adds a signed-intent path.
export const TezcatliCashinCosignReqSchema = z
  .object({
    chainId: ChainIdSchema,
    token: AddressSchema,
    amount: BigIntStr.openapi({ description: "Deposit amount in token base units" }),
    beneficiary: AddressSchema.openapi({ description: "Smart-account that owns the resulting position" }),
    lockOption: z.number().int().min(0).max(2).openapi({ description: "0=NONE, 1=30D, 2=90D" }),
  })
  .openapi("TezcatliCashinCosignRequest");

export const TezcatliCashoutCosignReqSchema = z
  .object({
    chainId: ChainIdSchema,
    token: AddressSchema,
    shares: BigIntStr.openapi({ description: "Shares to redeem" }),
    recipient: AddressSchema.openapi({ description: "Address that receives the unwound assets" }),
  })
  .openapi("TezcatliCashoutCosignRequest");

export const TezcatliCosignResponseSchema = z
  .object({
    chainId: ChainIdSchema,
    to: AddressSchema.openapi({ description: "Tezcatli vault address on this chain" }),
    data: HexSchema.openapi({ description: "ABI-encoded calldata; caller signs + broadcasts" }),
    value: BigIntStr.openapi({ example: "0", description: "Always 0 — vault entry points are non-payable" }),
    note: z.string().optional().openapi({
      description: "Free-form server hint (e.g. lock-option semantics). Not authoritative.",
    }),
  })
  .openapi("TezcatliCosignResponse");

export const OrgScopedErrorSchema = z
  .object({
    error: z.string(),
    code: z
      .enum(["unauthorized", "scope_mismatch", "validation_failed", "relayer_disabled", "submit_failed"])
      .optional(),
  })
  .openapi("OrgScopedError");
