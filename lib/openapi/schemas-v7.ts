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

// ── /api/v7/spend ───────────────────────────────────────────────────────

export const SpendOpSchema = z
  .object({
    account: AddressSchema.openapi({ description: "Smart-account signer" }),
    token: AddressSchema,
    action: z.number().int().min(0).max(3).openapi({ description: "0=Internal 1=Cashout 2=CrossChainInternal 3=CrossChainCashout" }),
    destAccount: AddressSchema.openapi({ description: "Used on Internal/CC-Internal" }),
    destAddress: AddressSchema.openapi({ description: "Used on Cashout/CC-Cashout" }),
    destChainId: z.number().int().openapi({ description: "Non-zero on CC-* actions" }),
    amount: InEuint64Schema,
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

// ── /api/v7/names ───────────────────────────────────────────────────────

export const NameClaimReqSchema = z
  .object({
    chainId: ChainIdSchema,
    claim: z
      .object({
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
