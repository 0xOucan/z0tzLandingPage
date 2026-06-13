/**
 * /api/v7/paymaster/cosign — operator sponsorship sig only.
 *
 * Hybrid-transport endpoint for the SDK. Client posts:
 *   - the un-finalized PackedUserOperation (paymasterAndData with the
 *     operator-sig region zeroed)
 *   - sponsorship parameters (feeCap, validUntil, validAfter)
 *
 * Server:
 *   - validates the feeCap is within policy
 *   - computes envelopeHash via paymaster.getEnvelopeHash() (eth-signed)
 *   - signs with the Z0tz operator key
 *   - returns the 65-byte sig + the assembled paymasterAndData blob
 *     ready for the client to drop into userOp.paymasterAndData
 *
 * The server NEVER submits the bundle. The client (or any bundler the
 * client picks) calls EntryPoint.handleOps with the operator-signed
 * UserOp. This is the "Z0tz can't censor submission" guarantee in the
 * hybrid-transport model.
 *
 * Open access — no org key required. IP-rate-limited per tier-badges spec.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { makeTransport } from "@/lib/relayer/rpc";
import { privateKeyToAccount, sign as signRaw, serializeSignature } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { v7Deployment } from "@/lib/relayer/v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { ErrorResponseSchema } from "@/lib/openapi/schemas-v7";

// ── Sponsorship policy ──────────────────────────────────────────────
// Hard caps on what the operator will cosign. Two protections:
//   1. feeCap upper bound — protects the paymaster deposit from a
//      malicious caller asking us to sponsor a gigantic op.
//   2. validity-window upper bound — prevents a presigned sponsorship
//      from sitting on the shelf for months.
const MAX_FEE_CAP_WEI = BigInt(process.env.Z0TZ_PAYMASTER_MAX_FEE_CAP ?? "1000000000000000000"); // 1 ETH default
const MAX_VALIDITY_WINDOW_SECS = Number(process.env.Z0TZ_PAYMASTER_MAX_VALIDITY ?? 600); // 10 min

const PackedUserOpSchema = z
  .object({
    sender: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    nonce: z.string().regex(/^\d+$/),
    initCode: z.string().regex(/^0x[a-fA-F0-9]*$/),
    callData: z.string().regex(/^0x[a-fA-F0-9]*$/),
    accountGasLimits: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    preVerificationGas: z.string().regex(/^\d+$/),
    gasFees: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    paymasterAndData: z.string().regex(/^0x[a-fA-F0-9]*$/),
    signature: z.string().regex(/^0x[a-fA-F0-9]*$/),
  })
  .openapi("PackedUserOperation");

const CosignReqSchema = z
  .object({
    chainId: z.number().int().positive(),
    userOp: PackedUserOpSchema,
    feeCap: z.string().regex(/^\d+$/).openapi({ description: "uint256 — wei. Hard-capped server-side." }),
    validUntil: z.number().int().min(0).openapi({ description: "uint48 unix seconds" }),
    validAfter: z.number().int().min(0).openapi({ description: "uint48 unix seconds" }),
  })
  .openapi("PaymasterCosignRequest");

const CosignRespSchema = z
  .object({
    paymasterAndData: z.string().regex(/^0x[a-fA-F0-9]+$/),
    operatorSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
    envelopeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    operator: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    configEpoch: z.string().regex(/^\d+$/).openapi({ description: "uint64 — paymaster config epoch bound into the envelope" }),
  })
  .openapi("PaymasterCosignResponse");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/paymaster/cosign",
  tags: ["paymaster"],
  summary: "Sign a paymaster sponsorship envelope without submitting",
  description:
    "Returns the operator's signature for the given userOp + sponsorship " +
    "parameters. Caller assembles paymasterAndData and submits to EntryPoint " +
    "themselves. Z0tz never holds the fully-signed bundle, so Z0tz cannot " +
    "censor submission — only refuse to sponsor gas. This is the hybrid " +
    "transport's middle path.",
  request: {
    body: { required: true, content: { "application/json": { schema: CosignReqSchema } } },
  },
  responses: {
    200: { description: "Cosigned.", content: { "application/json": { schema: CosignRespSchema } } },
    400: { description: "Validation error.", content: { "application/json": { schema: ErrorResponseSchema } } },
    403: { description: "Sponsorship refused (policy).", content: { "application/json": { schema: ErrorResponseSchema } } },
    503: { description: "Operator not configured on this server.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

function chainFor(chainId: number) {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    case 31337: return hardhat;
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

// Minimal ABI for getEnvelopeHash. The function takes a tuple matching
// PackedUserOperation + 3 sponsorship scalars and returns bytes32.
const paymasterAbi = [
  {
    name: "getEnvelopeHash",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "userOp", type: "tuple", components: [
          { name: "sender", type: "address" }, { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "feeCap", type: "uint256" },
      { name: "validUntil", type: "uint48" },
      { name: "validAfter", type: "uint48" },
      { name: "envelopeEpoch", type: "uint64" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  // AUDIT M-2: paymaster bumps `configEpoch` whenever fee economics or
  // sponsored-target surface changes. The cosign endpoint reads the live
  // value and binds it into the envelope so operator liability is pinned
  // to the config at sign time — if the owner mutates config mid-flight,
  // the pre-existing envelope reverts at validation rather than executing
  // under new rules.
  {
    name: "configEpoch",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const opKey = process.env.RELAYER_PRIVATE_KEY;
    if (!opKey) {
      return NextResponse.json(
        { error: "paymaster operator key not configured on this server" },
        { status: 503, headers: v7CorsHeaders },
      );
    }
    const body = await req.json();
    const parsed = CosignReqSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json(
        { error: msg, code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const { chainId, userOp, feeCap: feeCapStr, validUntil, validAfter } = parsed.data;
    const feeCap = BigInt(feeCapStr);
    if (feeCap > MAX_FEE_CAP_WEI) {
      return NextResponse.json(
        { error: `feeCap ${feeCap} exceeds server cap ${MAX_FEE_CAP_WEI}`, code: "fee_cap_exceeded" },
        { status: 403, headers: v7CorsHeaders },
      );
    }
    if (validUntil < validAfter) {
      return NextResponse.json(
        { error: "validUntil must be >= validAfter", code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const now = Math.floor(Date.now() / 1000);
    if (validUntil <= now) {
      return NextResponse.json(
        { error: "validUntil already in the past", code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    if (validUntil - now > MAX_VALIDITY_WINDOW_SECS) {
      return NextResponse.json(
        { error: `validity window > ${MAX_VALIDITY_WINDOW_SECS}s — refuse to presign long windows`, code: "validity_too_long" },
        { status: 403, headers: v7CorsHeaders },
      );
    }

    const d = v7Deployment(chainId);
    const chain = chainFor(chainId);
    const rpc = process.env[`RPC_URL_${chainId}`];
    if (!rpc) {
      return NextResponse.json(
        { error: `RPC_URL_${chainId} not set on this server` },
        { status: 503, headers: v7CorsHeaders },
      );
    }
    const pub = createPublicClient({ chain, transport: makeTransport(rpc) });
    const operator = privateKeyToAccount(opKey.startsWith("0x") ? (opKey as Hex) : (`0x${opKey}` as Hex));
    const wallet = createWalletClient({ chain, transport: makeTransport(rpc), account: operator });

    // AUDIT M-2: pull the live configEpoch so the envelope binds it. If the
    // owner mutates fee/target/factory config between this read and bundle
    // landing, validation reverts with ConfigEpochMismatch rather than
    // silently sponsoring under new rules.
    const envelopeEpoch = (await pub.readContract({
      address: d.paymaster as Address,
      abi: paymasterAbi,
      functionName: "configEpoch",
    })) as bigint;

    // Compute the envelope hash via the paymaster contract — this is the
    // exact hash the contract will recover from on validation, so we
    // can't drift.
    const envelopeHash = (await pub.readContract({
      address: d.paymaster as Address,
      abi: paymasterAbi,
      functionName: "getEnvelopeHash",
      args: [
        {
          sender: userOp.sender as Address,
          nonce: BigInt(userOp.nonce),
          initCode: userOp.initCode as Hex,
          callData: userOp.callData as Hex,
          accountGasLimits: userOp.accountGasLimits as Hex,
          preVerificationGas: BigInt(userOp.preVerificationGas),
          gasFees: userOp.gasFees as Hex,
          paymasterAndData: userOp.paymasterAndData as Hex,
          signature: userOp.signature as Hex,
        },
        feeCap,
        validUntil,
        validAfter,
        envelopeEpoch,
      ],
    })) as Hex;

    // Sign the envelope hash. `getEnvelopeHash` already wraps the data
    // in the EIP-191 prefix, so we sign the raw 32 bytes WITHOUT any
    // additional prefix. Use viem's low-level `sign({ hash, privateKey })`
    // which performs raw ECDSA signing of the digest (no prefixing).
    // `signMessage({ raw })` would add a SECOND EIP-191 prefix and break
    // the on-chain `ecrecover(envelopeHash, sig)` recovery.
    const rawSig = await signRaw({ hash: envelopeHash, privateKey: opKey.startsWith("0x") ? (opKey as Hex) : (`0x${opKey}` as Hex) });
    const operatorSignature = serializeSignature(rawSig);

    // Assemble paymasterAndData: caller already provided the userOp.paymasterAndData
    // with all the prefix bytes correctly laid out and a (8-byte configEpoch +
    // 65-byte sig) trailing region that the caller zeroed. We patch in the
    // live configEpoch + the operator sig at the trailing offset.
    // AUDIT M-2: layout is now [52 prefix][32 feeCap][6 validUntil][6 validAfter][8 configEpoch][65 sig] = 169 bytes
    if (userOp.paymasterAndData.length < 2 + (52 + 32 + 6 + 6 + 8 + 65) * 2) {
      return NextResponse.json(
        { error: "userOp.paymasterAndData too short — envelope prefix missing (expected 169 bytes incl. configEpoch slot)" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    // Strip the trailing 73 bytes (146 hex chars) the caller zeroed, then
    // append the live configEpoch (8 bytes, big-endian) + the 65-byte sig.
    const epochHex = envelopeEpoch.toString(16).padStart(16, "0");
    const before = userOp.paymasterAndData.slice(0, userOp.paymasterAndData.length - 146);
    const paymasterAndData = (before + epochHex + operatorSignature.slice(2)) as Hex;

    return NextResponse.json(
      { paymasterAndData, operatorSignature, envelopeHash, operator: operator.address, configEpoch: envelopeEpoch.toString() },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "cosign failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
