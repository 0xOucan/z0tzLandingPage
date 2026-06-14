import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, createWalletClient, decodeAbiParameters, decodeEventLog,
  keccak256, encodeAbiParameters, parseAbiItem, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { z } from "zod";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";
import { withApiLog, type LoggedContext } from "@/lib/relayer/request-log";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { consumeToken, callerIpKey } from "@/lib/relayer/rate-limit";
import {
  BridgeRelayReqSchema,
  BridgeRelayResponseSchema,
  ErrorResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { client as tursoClient, isEnabled as tursoEnabled } from "@/lib/indexer/turso-v7";

/**
 * V7-FINAL src-side cross-chain delivery.
 *
 * Patch #1 + #2 deleted the source-side `Z0tzInternalBridge.dispatchPlaintext`
 * path. The ledger now unshields directly to a user-supplied `srcStealth`
 * via `vault.confidentialTransferOut`, and the stealth itself calls
 * `ZUSDCTokenMessenger.depositForBurn` off-chain. This endpoint therefore
 * sees ONE attested channel: the cctp-clone `MessageSent(bytes)` emitted by
 * `ZUSDCMessageTransmitter`. The legacy `InternalMessageSent` event no longer
 * exists.
 *
 * Flow:
 *   1. Load the src tx receipt; require exactly one `MessageSent`.
 *   2. Decode the cctp-clone Message struct; map destinationDomain → chainId.
 *      Cross-check that the caller-supplied `dstChainId` matches.
 *   3. Sign the EIP-191 digest the dest transmitter expects:
 *        keccak256(abi.encode("ZUSDCMessageTransmitterReceive",
 *                             destChainId, destTransmitter, message))
 *   4. Submit `receiveMessage(message, signature)` on the dest transmitter.
 *      If the dest recipient is the local `Z0tzInternalBridge`, the
 *      transmitter's call into the messenger then records `pendingMint` and
 *      mints zUSDC to the bridge — re-crediting the ledger happens inside
 *      the bridge contract chain (no extra relayer work needed here).
 *   5. Return `{dstTxHash, status: "delivered" | "already-used"}`.
 *
 * Idempotency: `(srcChainId, srcTxHash)` is a primary key in `bridge_replays`.
 * A second call returns the prior dest tx without re-submitting.
 */

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

// Z0tz CCTP-clone INTERNAL domain → EVM chain id. These are the z0tz
// internal domains the cctp-clone messenger burns with (NOT Circle's CCTP
// domains). Confirmed in deployments/*.json `"domain"` + scripts/link-bridges.ts
// (arb=1, base=0, eth=2). Using Circle's {3,6,0} here would reject arb/eth
// deliveries and mis-map base.
const DOMAIN_TO_CHAIN_ID: Record<number, number> = {
  1: 421614,    // arb-sepolia (z0tz internal domain 1)
  0: 84532,     // base-sepolia (z0tz internal domain 0)
  2: 11155111,  // eth-sepolia (z0tz internal domain 2)
};

const MessageSentEvent = parseAbiItem("event MessageSent(bytes message)");

const transmitterAbi = [
  { name: "receiveMessage", type: "function", stateMutability: "nonpayable",
    inputs: [{ type: "bytes", name: "message" }, { type: "bytes", name: "attestation" }],
    outputs: [{ type: "bool" }] },
] as const;

// Mirrors ZUSDCMessageTransmitter.Message exactly. Field order load-bearing.
const cctpMessageTypes = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "nonce", type: "uint64" },
  { name: "sender", type: "address" },
  { name: "recipient", type: "address" },
  { name: "destinationCaller", type: "address" },
  { name: "messageBody", type: "bytes" },
] as const;

// ZUSDCTokenMessenger.BurnMessage (informational — returned in the response).
// XCHAIN-7B: `hookData` (abi.encode(uint8 action, address finalAccount,
// address viewer)) was appended to the struct. The relayer forwards the whole
// cctp message verbatim, so the hookData rides along to the dest transmitter
// automatically (it is part of the attested bytes); this decode is only for the
// diagnostic response. Field order is load-bearing — must match the contract.
const burnMessageTypes = [
  { name: "burnToken", type: "address" },
  { name: "mintRecipient", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "messageSender", type: "address" },
  { name: "burnNonce", type: "uint64" },
  { name: "hookData", type: "bytes" },
] as const;

// Solidity `bytes32("…")` literal: left-aligned, right-padded with zeros.
function tagBytes32(s: string): Hex {
  const enc = new TextEncoder().encode(s);
  if (enc.length > 32) throw new Error(`tag ${s} > 32 bytes`);
  const padded = new Uint8Array(32);
  padded.set(enc, 0);
  return ("0x" + Buffer.from(padded).toString("hex")) as Hex;
}

// ── bridge_replays durable idempotency ─────────────────────────────────────

let _bridgeReplaysReady = false;
async function ensureBridgeReplaysSchema(): Promise<void> {
  if (_bridgeReplaysReady || !tursoEnabled()) return;
  try {
    await tursoClient().execute(
      `CREATE TABLE IF NOT EXISTS bridge_replays (
        src_chain_id INTEGER NOT NULL,
        src_tx_hash  TEXT    NOT NULL,
        dst_chain_id INTEGER NOT NULL,
        dst_tx_hash  TEXT    NOT NULL,
        status       TEXT    NOT NULL,
        ts           INTEGER NOT NULL,
        PRIMARY KEY (src_chain_id, src_tx_hash)
      )`,
    );
    try {
      await tursoClient().execute(
        `CREATE INDEX IF NOT EXISTS idx_bridge_replays_dst ON bridge_replays(dst_chain_id, ts)`,
      );
    } catch { /* swallow */ }
    _bridgeReplaysReady = true;
  } catch { /* swallow */ }
}

type ReplayRow = { dstTxHash: string; status: "delivered" | "already-used"; dstChainId: number };

async function lookupReplay(srcChainId: number, srcTxHash: string): Promise<ReplayRow | null> {
  if (!tursoEnabled()) return null;
  try {
    await ensureBridgeReplaysSchema();
    const r = await tursoClient().execute({
      sql: `SELECT dst_chain_id, dst_tx_hash, status FROM bridge_replays
            WHERE src_chain_id = ? AND src_tx_hash = ? LIMIT 1`,
      args: [srcChainId, srcTxHash.toLowerCase()],
    });
    const row = r.rows?.[0];
    if (!row) return null;
    return {
      dstChainId: Number(row.dst_chain_id),
      dstTxHash: String(row.dst_tx_hash),
      status: String(row.status) as "delivered" | "already-used",
    };
  } catch {
    return null;
  }
}

async function recordReplay(row: { srcChainId: number; srcTxHash: string; dstChainId: number; dstTxHash: string; status: "delivered" | "already-used" }): Promise<void> {
  if (!tursoEnabled()) return;
  try {
    await ensureBridgeReplaysSchema();
    await tursoClient().execute({
      sql: `INSERT OR IGNORE INTO bridge_replays
              (src_chain_id, src_tx_hash, dst_chain_id, dst_tx_hash, status, ts)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        row.srcChainId,
        row.srcTxHash.toLowerCase(),
        row.dstChainId,
        row.dstTxHash.toLowerCase(),
        row.status,
        Date.now(),
      ],
    });
  } catch { /* swallow */ }
}

// ── OpenAPI registration ───────────────────────────────────────────────────

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/bridge-relay",
  tags: ["user-tier"],
  summary: "Deliver a V7 cross-chain spend on the destination chain",
  description:
    "Reads the source-chain tx, extracts the cctp-clone MessageSent event, " +
    "signs the dest transmitter's attestation digest, and submits " +
    "receiveMessage(message, signature) on the destination ZUSDCMessageTransmitter. " +
    "Idempotent on (srcChainId, srcTxHash).",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: BridgeRelayReqSchema } },
    },
  },
  responses: {
    200: { description: "Delivered (or replayed).", content: { "application/json": { schema: BridgeRelayResponseSchema } } },
    400: { description: "Malformed body.", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Source tx not found.", content: { "application/json": { schema: ErrorResponseSchema } } },
    409: { description: "Replay — same (srcChainId, srcTxHash) already delivered.", content: { "application/json": { schema: BridgeRelayResponseSchema } } },
    422: { description: "Source tx has no MessageSent event.", content: { "application/json": { schema: ErrorResponseSchema } } },
    429: { description: "Rate-limited.", content: { "application/json": { schema: ErrorResponseSchema } } },
    503: { description: "Relayer disabled (env-flag off).", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

type BridgeRelayReq = z.infer<typeof BridgeRelayReqSchema>;

async function handler(req: NextRequest, ctx: LoggedContext): Promise<NextResponse> {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;

  // Bridge is expensive — tighter cap than the per-tier defaults; sandbox=5/min
  // is enforced via the bucket key, while the verified shape (30/min) is left
  // to the per-tier path by piggybacking on a "|bridge-relay" suffix so the
  // limiter's CAPACITY table treats it as a distinct bucket per caller.
  const rlKey = `${callerIpKey(req)}|bridge-relay`;
  const allowed = await consumeToken(rlKey, "sandbox");
  if (!allowed) {
    ctx.errorCode = "rate_limited";
    return errorResponse(429, "rate_limited", v7CorsHeaders);
  }

  const parsedBody = await parseJson(req, v7CorsHeaders);
  if (!parsedBody.ok) {
    ctx.errorCode = "validation_failed";
    return parsedBody.response;
  }
  const parsed = BridgeRelayReqSchema.safeParse(parsedBody.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "validation_failed" },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const { srcChainId, dstChainId, srcTxHash } = parsed.data as BridgeRelayReq;

  // 409 — already replayed.
  const prior = await lookupReplay(srcChainId, srcTxHash);
  if (prior) {
    ctx.chainId = prior.dstChainId;
    ctx.txHash = prior.dstTxHash;
    return NextResponse.json(
      { dstTxHash: prior.dstTxHash, status: prior.status },
      { status: 409, headers: v7CorsHeaders },
    );
  }

  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerKey) {
    ctx.errorCode = "relayer_disabled";
    return errorResponse(503, "relayer_disabled", v7CorsHeaders);
  }

  const srcChain = CHAINS[srcChainId];
  const srcRpc = process.env[`RPC_URL_${srcChainId}`];
  if (!srcChain || !srcRpc) {
    ctx.errorCode = "validation_failed";
    return errorResponse(400, "validation_failed", v7CorsHeaders);
  }
  const dstChain = CHAINS[dstChainId];
  const dstRpc = process.env[`RPC_URL_${dstChainId}`];
  if (!dstChain || !dstRpc) {
    ctx.errorCode = "validation_failed";
    return errorResponse(400, "validation_failed", v7CorsHeaders);
  }

  let destDeploy;
  try {
    destDeploy = v7Deployment(dstChainId);
  } catch (e) {
    ctx.errorCode = "internal";
    return errorResponse(500, "internal", v7CorsHeaders, e);
  }
  const destTransmitter = destDeploy.zusdcTransmitter as Address | undefined;
  if (!destTransmitter) {
    ctx.errorCode = "internal";
    return errorResponse(500, "internal", v7CorsHeaders, new Error("dest zusdcTransmitter missing"));
  }

  const account = privateKeyToAccount(relayerKey as Hex);
  const srcPub = createPublicClient({ chain: srcChain, transport: makeTransport(srcRpc) });

  let receipt;
  try {
    receipt = await srcPub.getTransactionReceipt({ hash: srcTxHash as Hex });
  } catch {
    receipt = null;
  }
  if (!receipt) {
    ctx.errorCode = "not_found";
    return errorResponse(404, "not_found", v7CorsHeaders);
  }

  // 1. Find MessageSent in the src receipt.
  let cctpMessage: Hex | null = null;
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: [MessageSentEvent], data: log.data, topics: log.topics });
      cctpMessage = ev.args.message as Hex;
      break;
    } catch { /* not this log */ }
  }
  if (!cctpMessage) {
    ctx.errorCode = "no_message_sent";
    return errorResponse(422, "no_message_sent", v7CorsHeaders);
  }

  // 2. Decode the cctp-clone Message + the inner BurnMessage. Cross-check
  //    the dest domain against the caller-supplied dstChainId so the relayer
  //    can't be redirected by a lying client (the message is the source of
  //    truth; dstChainId is a sanity assertion).
  let cctpDecoded: any;
  let burnBody: any;
  try {
    [cctpDecoded] = decodeAbiParameters(
      [{ type: "tuple", components: cctpMessageTypes as any }],
      cctpMessage,
    ) as any;
    [burnBody] = decodeAbiParameters(
      [{ type: "tuple", components: burnMessageTypes as any }],
      cctpDecoded.messageBody as Hex,
    ) as any;
  } catch (e) {
    ctx.errorCode = "decode_failed";
    return errorResponse(422, "decode_failed", v7CorsHeaders, e);
  }

  const destDomain = Number(cctpDecoded.destinationDomain);
  const expectedDestChainId = DOMAIN_TO_CHAIN_ID[destDomain];
  if (!expectedDestChainId || expectedDestChainId !== dstChainId) {
    ctx.errorCode = "dest_mismatch";
    return errorResponse(400, "dest_mismatch", v7CorsHeaders);
  }

  // 3. Sign the dest transmitter's EIP-191 digest. Bound to
  //    (chainid, destTransmitter) so it can't replay across deployments.
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes" }],
      [
        tagBytes32("ZUSDCMessageTransmitterReceive"),
        BigInt(dstChainId),
        destTransmitter,
        cctpMessage,
      ],
    ),
  );
  // V7-FINAL-2 (bridge M-1): the dest transmitter now supports an N-of-M
  // attester set. When `attestationThreshold > 1` it expects K concatenated
  // 65-byte signatures from DISTINCT signers in ASCENDING signer-address order.
  // Alpha runs threshold == 1 (single relayer signer), so the single-sig path
  // below is correct and unchanged. TODO(mainnet): when threshold > 1, fan the
  // `inner` digest out to the K attester keys, sort recovered addresses
  // ascending, and concat the 65-byte sigs here.
  const attestation = await account.signMessage({ message: { raw: inner } });

  // 4. Submit receiveMessage on the dest transmitter.
  const destPub = createPublicClient({ chain: dstChain, transport: makeTransport(dstRpc) });
  const destWallet = createWalletClient({ account, chain: dstChain, transport: makeTransport(dstRpc) });

  let dstTxHash: Hex;
  let status: "delivered" | "already-used" = "delivered";
  try {
    dstTxHash = await destWallet.writeContract({
      address: destTransmitter,
      abi: transmitterAbi,
      functionName: "receiveMessage",
      args: [cctpMessage, attestation],
      chain: dstChain,
      account,
    });
    await destPub.waitForTransactionReceipt({ hash: dstTxHash });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("AlreadyUsed") || msg.includes("0x9ad0fe48")) {
      // The dest already consumed this (sourceDomain, nonce). Treat as a
      // successful no-op; surface the prior delivery if we have one cached.
      const cached = await lookupReplay(srcChainId, srcTxHash);
      if (cached) {
        ctx.chainId = cached.dstChainId;
        ctx.txHash = cached.dstTxHash;
        return NextResponse.json(
          { dstTxHash: cached.dstTxHash, status: "already-used" as const },
          { status: 200, headers: v7CorsHeaders },
        );
      }
      // No cached row — record the AlreadyUsed marker with a zero hash so a
      // second call returns 409 instead of re-quoting.
      dstTxHash = ("0x" + "00".repeat(32)) as Hex;
      status = "already-used";
    } else {
      ctx.errorCode = "submit_failed";
      return errorResponse(500, "submit_failed", v7CorsHeaders, e);
    }
  }

  await recordReplay({ srcChainId, srcTxHash, dstChainId, dstTxHash, status });

  if (status === "delivered") {
    triggerScanAndRecord({ chainId: dstChainId, txHash: dstTxHash, opKind: "bridge-cctp-receive", req });
  }

  ctx.chainId = dstChainId;
  ctx.txHash = dstTxHash;

  return NextResponse.json(
    {
      dstTxHash,
      status,
      // Diagnostic fields — not part of the schema contract, but useful for
      // CLI debugging. The schema covers only {dstTxHash, status}; clients
      // SHOULD ignore unknown fields.
      destDomain,
      burn: burnBody
        ? {
            amount: burnBody.amount?.toString?.() ?? String(burnBody.amount),
            mintRecipient: burnBody.mintRecipient as Address,
            burnNonce: burnBody.burnNonce?.toString?.() ?? String(burnBody.burnNonce),
          }
        : undefined,
    },
    { status: 200, headers: v7CorsHeaders },
  );
}

export const POST = withApiLog("/api/v7/bridge-relay", handler);
