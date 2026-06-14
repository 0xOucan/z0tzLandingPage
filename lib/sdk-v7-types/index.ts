/**
 * Z0tz V7 protocol types — the SINGLE place every interface is defined.
 *
 * landing's zod schemas, the relayer's ABI shapes, the CLI's request
 * builders, and the GUI's wire types all derive from THIS file. If you
 * see drift between layers (e.g. F-6 today: landing's spend ABI missing
 * `plainAmount`), the answer is always "add the field here, then make
 * every other layer re-import."
 *
 * BigInt-bearing fields are sent as base-10 strings (browsers can't
 * JSON.stringify a BigInt). Address fields are 0x-prefixed lower-case
 * hex. Hex bytes are 0x-prefixed.
 */

export type Hex = `0x${string}`;
export type Address = Hex;

// ── Deployment shape (per-chain) ─────────────────────────────────────

export interface V7Deployment {
  accountFactory: Address;
  recoveryHub: Address;
  emergencyKeyMethod: Address;
  guardianQuorumMethod: Address;
  usdc: Address;
  zusdc: Address;
  tokenRegistry: Address;
  vault: Address;
  ledger: Address;
  sweeper: Address;
  treasury: Address;
  feeAccounting: Address;
  airdropClaim: Address;
  paymaster: Address;
  entryPoint: Address;
  nameRegistry: Address;
  internalBridge: Address;
  zusdcMessenger: Address;
  zusdcTransmitter: Address;
  mockYieldStrategy: Address;
  timedVault: Address;
  complianceGate: Address;
  /** F-2: present since the policy-factory deploy fix landed. May be
   *  absent in deployments produced before that. Treat as optional for
   *  backward compatibility with older deployments JSON files. */
  policyFactory?: Address;
  /** Tezcatli (Aave V3 yield) — optional; only present on chains where
   *  the Tezcatli vault stack is deployed. Matches landing's shape. */
  tezcatliVault?: Address;
  tezcatliAdapter?: Address;
  tezcatliRiskPolicy?: Address;
  tezcatliFactory?: Address;
}

// ── CoFHE encrypted-input wrapper ────────────────────────────────────

export interface InEuint64 {
  /** Ciphertext handle (uint256 as decimal string). */
  ctHash: string;
  /** Encryption security zone — 0 in mock mode. */
  securityZone: number;
  /** Encrypted-type discriminator — 5 for uint64. */
  utype: number;
  /** CoFHE input proof signature. */
  signature: Hex;
}

// ── Request shapes (wire format) ─────────────────────────────────────

export interface AirdropClaimReq {
  pubX: string;
  pubY: string;
  stealth: Address;
  nonce: Hex;
  sigR: string;
  sigS: string;
}

export interface SweepReq {
  stealthAddress: Address;
  token: Address;
  account: Address;
  viewer: Address;
  nonce: string;
  amount: string;
  deadline: string;
  signature: Hex;
}

/**
 * Ledger spend op (action = Internal / Cashout / CrossChainInternal /
 * CrossChainCashout). The `plainAmount` field is critical (audit C-2):
 * binds plaintext to the signed digest so policy hook + vault verify
 * can catch sender lies about cashout amounts. Internal paths pass "0";
 * cashout paths pass the matching unshield amount.
 */
export interface SpendReq {
  account: Address;
  token: Address;
  /** 0 = Internal, 1 = Cashout, 2 = CrossChainInternal, 3 = CrossChainCashout */
  action: 0 | 1 | 2 | 3;
  /** Used on Internal / CrossChainInternal. address(0) otherwise. */
  destAccount: Address;
  /** Used on Cashout / CrossChainCashout. address(0) otherwise. */
  destAddress: Address;
  /** Non-zero on CC-* actions; 0 on same-chain. */
  destChainId: number;
  /** V7-FINAL #1: user-supplied source-chain stealth address for
   *  CrossChain* actions; address(0) for same-chain. Bound into the
   *  spend digest so the relayer cannot redirect funds. */
  srcStealth: Address;
  /** V7-FINAL-2 H-1: recipient decryption viewer for the DESTINATION-chain
   *  credit of a CrossChainInternal spend. Bound into the spend digest AND
   *  the source-chain authorizedHook[srcStealth] commitment so the dest-side
   *  receiveDelivered hookData (action, finalAccount, viewer) is provably the
   *  passkey-authorized one. address(0) for same-chain + CrossChainCashout. */
  viewer: Address;
  amount: InEuint64;
  /** uint64 as decimal string. "0" for Internal, matching unshield for Cashout. */
  plainAmount: string;
  nonce: string;
  deadline: string;
  pkX: string;
  pkY: string;
  sigR: string;
  sigS: string;
}

export interface NameClaimReq {
  /** V7-FINAL #14: cleartext name (a-z 0-9 - only). Contract validates
   *  ASCII + length on-chain and checks keccak256(abi.encode(name)) === nameHash. */
  name: string;
  nameHash: Hex;
  nameLength: string;
  pubX: string;
  pubY: string;
  resolvedAccount: Address;
  sigR: string;
  sigS: string;
}

/** V7-FINAL #7: relayer-as-authority top-level claim. No user signature —
 *  the calling authority (the relayer holding CLAIM_AUTHORITY_ROLE) is
 *  the signer-of-record. */
export interface NameClaimAsAuthorityReq {
  name: string;
  nameHash: Hex;
  nameLength: string;
  resolvedAccount: Address;
}

/** V7-FINAL #7: relayer-as-authority subdomain claim. */
export interface SubdomainClaimAsAuthorityReq {
  leafSegment: string;
  parentNameHash: Hex;
  leafNameHash: Hex;
  resolvedAccount: Address;
}

/** V7-FINAL #7: relayer-as-authority repoint / revoke. */
export interface RepointAsAuthorityReq {
  nameHash: Hex;
  newAccount: Address;
}
export interface RevokeAsAuthorityReq {
  nameHash: Hex;
}

/**
 * AUDIT M-3: `claimSubdomainFor` now requires the user's own P-256
 * consent signature in addition to the org admin's. The contract takes
 * a single `ClaimSubFor` struct (stack-depth fix); we mirror that as
 * one request object here. `userSigR/userSigS` are signed by the user's
 * passkey over the SUBDOMAIN_CONSENT digest (see
 * subdomainConsentDigest in ../digest).
 */
export interface OrgClaimSubdomainReq {
  /** V7-FINAL #14: cleartext leaf segment (e.g. "arturo" for
   *  arturo.coppel.z0tz). Contract validates ASCII + depth on-chain. */
  leafSegment: string;
  parentNameHash: Hex;
  leafNameHash: Hex;
  userPubX: string;
  userPubY: string;
  userResolvedAccount: Address;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
  /** AUDIT M-3: user passkey consent sig over the consent digest. */
  userSigR: string;
  /** AUDIT M-3: user passkey consent sig over the consent digest. */
  userSigS: string;
}

/**
 * AUDIT H-1: `cancelEmergencyRepoint` now takes a `deadline` so the
 * admin's cancel signature is single-use and time-bounded.
 */
export interface CancelEmergencyRepointReq {
  rootNameHash: Hex;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
}

export interface OrgRepointSubdomainReq {
  leafNameHash: Hex;
  newUserPubX: string;
  newUserPubY: string;
  newResolvedAccount: Address;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
}

export interface OrgRevokeSubdomainReq {
  leafNameHash: Hex;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
}

export interface OrgSetPolicyReq {
  rootNameHash: Hex;
  policy: Address;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
}

export interface OrgInitiateRecoveryReq {
  account: Address;
  newOwnerX: string;
  newOwnerY: string;
  adminPubX: string;
  adminPubY: string;
  deadline: string;
  sigR: string;
  sigS: string;
}

export interface RecoverInitiateReq {
  account: Address;
  methodIndex: string;
  newOwnerX: string;
  newOwnerY: string;
  proof: Hex;
}

export interface RecoverExecuteReq {
  recoveryId: string;
}

export interface EncryptedArtifact {
  pubkeyHash: Hex;
  chainId?: number;
  account?: Address;
  version?: number;
  ciphertext: string;
  iv: string;
  salt: string;
  tag: string;
  kdf?: string;
}

export interface StealthWatchReq {
  pubkeyHash: Hex;
  address: Address;
  index?: number;
}

// ── Response shapes ──────────────────────────────────────────────────

export interface TxHashResponse {
  txHash: Hex;
}

export interface StealthInboundRow {
  chain_id: number;
  stealth_address: Address;
  token: Address;
  from_addr: Address;
  amount: string;
  block: number;
  tx_hash: Hex;
  log_index: number;
  ts: number;
  swept: 0 | 1;
}

export interface StealthInboundResponse {
  inbound: StealthInboundRow[];
}

// ── Tezcatli (Aave V3 yield) ─────────────────────────────────────────
//
// Plaintext-shares, multi-asset, Aave-strategy vault. Storage keyed by
// (account, token). Shares are uint256 (not encrypted) — anonymity comes
// from the stealth/smart-account layer.

// ── Bridge wire structs ──────────────────────────────────────────────
//
// Audit fix: both InternalMessage and BurnMessage gained a `burnNonce`
// field. InternalMessage adds it between `nonce` and `action`; BurnMessage
// appends it after `messageSender`. The bridge digest helper in
// ../digest binds the new field so source + dest agree.

export interface InternalMessage {
  version: number;          // uint32
  sourceDomain: number;     // uint32
  destinationDomain: number; // uint32
  nonce: string;            // uint64 (decimal)
  /** Audit fix: new — bound to BurnMessage's burnNonce on cross-chain
   *  flows so the two messages can't be mismatched at the destination. */
  burnNonce: string;        // uint64 (decimal)
  action: number;           // uint8
  token: Address;
  destAccount: Address;
  destAddress: Address;
  viewer: Address;
  amount: string;           // uint256 (decimal)
}

export interface BurnMessage {
  burnToken: Address;
  mintRecipient: Address;
  amount: string;           // uint256 (decimal)
  messageSender: Address;
  /** Audit fix: new — same identifier the InternalMessage binds. */
  burnNonce: string;        // uint64 (decimal)
}

// ── Bridge ops ───────────────────────────────────────────────────────
//
// V7-FINAL #2: source-side `dispatchPlaintext` / `initiateCrossChain` /
// `Intent` were removed from Z0tzInternalBridge. The ledger now unshields
// CrossChain* spends to a user-supplied srcStealth via the vault, and the
// stealth itself calls zusdcMessenger.depositForBurn off-chain. The bridge
// keeps only the cctp-clone receive. V7-FINAL-2: `receiveInternal` is now a
// reverting stub — dest-credit happens automatically inside `receiveDelivered`
// via the cctp message hookData. The relayer never calls receiveInternal.
//
// `ExpireIntentReq` is removed accordingly. The InternalMessage /
// BurnMessage destination-side decode shapes remain.

// ── Vault ops ────────────────────────────────────────────────────────

/** Guardian-only ERC20 recover. Reverts `RegisteredUnderlying` if the
 *  token is a wrap underlying. */
export interface VaultRecoverERC20Req {
  token: Address;
  to: Address;
  amount: string;           // uint256 (decimal)
}

/** lockOption: 0 = none, 1 = 7d, 2 = 30d, 3 = 90d (matches contract). */
export type TezcatliLockOption = 0 | 1 | 2 | 3;

export interface TezcatliDepositViaSweeperReq {
  token: Address;
  amount: string;       // uint256 assets, decimal string
  beneficiary: Address; // smart account receiving shares
  lockOption: TezcatliLockOption;
}

export interface TezcatliWithdrawViaSweeperReq {
  token: Address;
  account: Address;
  shares: string;       // uint256, decimal string
}

export interface TezcatliDepositReq {
  token: Address;
  amount: string;
  lockOption: TezcatliLockOption;
}

export interface TezcatliWithdrawReq {
  token: Address;
  shares: string;
  recipient: Address;
}

/** Read-model returned by `sdk.tezcatli.position(...)`. */
export interface TezcatliPosition {
  shares: string;             // uint256
  principal: string;          // uint256
  grossPosition: string;      // uint256
  pendingYield: string;       // uint256
  pendingFeeBps: number;      // uint16
  withdrawUnlockAt: string;   // uint64 unix seconds
  lockOption: TezcatliLockOption;
  /** Audit fix: APY snapshot at deposit time (uint16 bps). Surface so
   *  callers can show a realized-vs-current APY delta. Optional because
   *  not every reader path returns it; the SDK omits when absent. */
  apyBpsAtDeposit?: number;
}

// ── Client-side validation (audit-driven guards) ─────────────────────

/**
 * Audit fix: `Z0tzTokenRegistry.MAX_DECIMALS` was lowered from 18 → 8.
 * Reject locally so callers don't burn gas on a guaranteed
 * `MaxDecimalsExceeded` revert.
 */
export const TOKEN_REGISTRY_MAX_DECIMALS = 8;

export function assertTokenRegistryDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > TOKEN_REGISTRY_MAX_DECIMALS) {
    throw new Error(
      `Z0tzTokenRegistry: decimals=${decimals} exceeds MAX_DECIMALS=${TOKEN_REGISTRY_MAX_DECIMALS} ` +
      `(audit fix lowered cap from 18 → 8); on-chain registry would revert MaxDecimalsExceeded.`,
    );
  }
}

/**
 * Audit fix: `MULTISEND_MAX_ROWS` lowered from 100 → 30 to bound the
 * multisend gas envelope. Client-side reject keeps wire size sane and
 * gives a friendlier error than the on-chain revert.
 */
export const SDK_MULTISEND_MAX_ROWS = 30;

export function assertMultisendRowCount(rows: number): void {
  if (!Number.isInteger(rows) || rows < 1 || rows > SDK_MULTISEND_MAX_ROWS) {
    throw new Error(
      `Multisend: rowCount=${rows} exceeds MULTISEND_MAX_ROWS=${SDK_MULTISEND_MAX_ROWS} ` +
      `(audit fix lowered cap from 100 → 30).`,
    );
  }
}

/**
 * Audit fix: ledger spend rejects `plainAmount < 100` (the on-chain
 * `PlainAmountTooSmall` revert). Mirrors the ledger's
 * `MIN_PLAIN_AMOUNT` constant.
 */
export const MIN_PLAIN_AMOUNT = 100n;

export function assertMinPlainAmount(plainAmount: bigint | string): void {
  const v = typeof plainAmount === "string" ? BigInt(plainAmount) : plainAmount;
  if (v < MIN_PLAIN_AMOUNT) {
    throw new Error(
      `Ledger.spend: plainAmount=${v} is below MIN_PLAIN_AMOUNT=${MIN_PLAIN_AMOUNT}; ` +
      `on-chain ledger would revert PlainAmountTooSmall.`,
    );
  }
}

// ── Error parsing surface ────────────────────────────────────────────

/**
 * Audit-fix error name → friendly explanation. Used by `parseZ0tzError()`
 * to turn raw revert names into actionable messages for userland.
 */
export const Z0TZ_ERROR_MESSAGES: Record<string, string> = {
  // Token registry
  MaxDecimalsExceeded:        "Token decimals exceed MAX_DECIMALS (8). Register a token with ≤8 decimals.",
  RegisteredUnderlying:       "Token is a registered underlying — guardian recoverERC20 refuses to move it.",
  // Compliance
  BulkTooLarge:               "Bulk blacklist exceeds the on-chain cap.",
  // Bridge
  UnknownChainId:             "Bridge: unknown chainId — mapChain has not been configured for this destination.",
  IntentExpired:              "Bridge intent has expired; call expireIntent() to reap, then re-initiate.",
  // Ledger
  PlainAmountTooSmall:        `Ledger.spend: plainAmount below MIN_PLAIN_AMOUNT (${MIN_PLAIN_AMOUNT}).`,
  InvalidPlainAmount:         "Ledger.spend: plainAmount must be non-zero on Cashout / CrossChainCashout.",
  // Tezcatli
  AdapterLimitReached:        "Tezcatli adapter capacity reached; retry later or reduce the deposit.",
  // Vault
  NotPaused:                  "Vault.unpauseCashIn called while cash-in was not paused.",
  // Generic
  RenounceDisabled:           "Ownership renouncement is disabled on this contract.",
  ConfigEpochMismatch:        "Paymaster envelope epoch mismatch — refetch configEpoch() and retry.",
};

/**
 * Best-effort parser: extracts the first `Error:` / custom-error name
 * from a thrown viem `ContractFunctionRevertedError` (or similar) and
 * maps it via `Z0TZ_ERROR_MESSAGES`. Falls back to the raw message.
 */
export function parseZ0tzError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  // Match a custom-error name. viem formats them like
  // "ContractFunctionExecutionError: ... reverted with the following reason:\nPlainAmountTooSmall()".
  const m = msg.match(/\b([A-Z][A-Za-z0-9_]+)\s*\(/);
  if (m) {
    const name = m[1]!;
    const friendly = Z0TZ_ERROR_MESSAGES[name];
    if (friendly) return `${name}: ${friendly}`;
  }
  return msg;
}
