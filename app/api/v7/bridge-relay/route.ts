import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient, createWalletClient, decodeEventLog, keccak256, encodeAbiParameters,
  parseAbiItem, type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { makeTransport } from "@/lib/relayer/rpc";
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { v7Deployment } from "@/lib/relayer/v7";

// V7 cross-chain delivery (steps 2 + 3 of the relayer-attested flow).
//
// TODO(V7-FINAL #1/#2 — human review): the source-side
// `Z0tzInternalBridge.dispatchPlaintextOut` / `dispatchPlaintext` / `Intent`
// pathway was removed in V7-final. The src side is now:
//   1) ledger.spend with srcStealth → vault unshields encrypted balance to srcStealth
//   2) the stealth itself (off-chain CLI/relayer fund-stealth gas) calls
//      zusdcMessenger.depositForBurn directly
// That means src txs emit ONLY `MessageSent` (cctp-clone), NOT the routing
// `InternalMessageSent` this endpoint also expects. The dest side still needs
// to deliver an InternalMessage to credit the destination ledger / cashout —
// but its source MUST be reworked to come from the relayer's own
// reconstructed routing payload, not from a src-emitted InternalMessageSent.
// Until that rewrite lands this route will return the "did not emit
// InternalMessageSent" error for every V7-final src tx. Pre-redeploy, leave
// as-is (typechecks); post-redeploy, gut + rebuild around the cctp-clone
// MessageSent + a relayer-constructed routing message.
//
// Assumes step 1 (Z0tzInternalBridge.dispatchPlaintextOut on src — pulls
// zUSDC liquidity from the relayer's own balance, burns via the cctp-clone
// messenger, emits the routing InternalMessageSent) has already run.
// The caller passes the src dispatch tx hash; this endpoint:
//
//   2. Decodes the cctp-clone MessageSent log → signs the
//      ZUSDCMessageTransmitterReceive digest with RELAYER_PRIVATE_KEY (the
//      same key the messenger has set as attestationSigner on every chain)
//      → calls destTransmitter.receiveMessage(message, attestation). Mints
//      zUSDC at the dest bridge address (CREATE2-identical across chains).
//
//   3. Decodes the routing InternalMessageSent log → signs the
//      Z0tzInternalBridgeReceive digest → calls destBridge.receiveInternal.
//      That contract distributes the minted zUSDC according to the
//      InternalMessage's action: for CrossChainCashout it transfers to the
//      destAddress; for CrossChainInternal it credits the destination
//      account's encrypted ledger balance via creditFromVault. Either way
//      the user / recipient sees the result without further action.
//
// Replay safety: the dest contracts both track usedNonces[sourceDomain].
// Idempotent — a second call with the same src tx returns the existing
// dest txs without re-signing.

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
  31337: hardhat,
};

// Domain → chainId. Mirrors V7 deployment's chainIdToDomain mapping.
// arb-sepolia, base-sepolia, eth-sepolia (CCTP V2 domain numbers).
const DOMAIN_TO_CHAIN_ID: Record<number, number> = {
  3: 421614,   // arb-sepolia
  6: 84532,    // base-sepolia
  0: 11155111, // eth-sepolia
};

const MessageSentEvent = parseAbiItem("event MessageSent(bytes message)");
const InternalMessageSentEvent = parseAbiItem("event InternalMessageSent(uint64 indexed messageNonce, bytes encoded)");

const transmitterAbi = [
  { name: "receiveMessage", type: "function", stateMutability: "nonpayable",
    inputs: [{ type: "bytes", name: "message" }, { type: "bytes", name: "attestation" }],
    outputs: [{ type: "bool" }] },
  { name: "localDomain", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint32" }] },
] as const;

const internalBridgeAbi = [
  { name: "receiveInternal", type: "function", stateMutability: "nonpayable",
    inputs: [{ type: "bytes", name: "message" }, { type: "bytes", name: "attestation" }],
    outputs: [] },
] as const;

// Decode the abi.encode-d Message (struct) the cctp-clone emits. Field
// order MUST match ZUSDCMessageTransmitter.sol's struct exactly.
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

const internalMessageTypes = [
  { name: "version", type: "uint8" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "nonce", type: "uint64" },
  { name: "burnNonce", type: "uint64" },
  { name: "action", type: "uint8" },
  { name: "token", type: "address" },
  { name: "destAccount", type: "address" },
  { name: "destAddress", type: "address" },
  { name: "viewer", type: "address" },
  { name: "amount", type: "uint256" },
] as const;

function attestationDigest(tag: string, destChainId: bigint, destContract: Address, message: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes" }],
      [
        keccak256(new TextEncoder().encode(tag)).slice(0, 66) as Hex, // bytes32 from string-cast: keep as raw bytes32 literal mapping below
        destChainId,
        destContract,
        message,
      ],
    ),
  );
}

// The contracts use Solidity's `bytes32("...")` literal which LEFT-aligns
// + right-pads. encodeBytes32String matches that exactly.
function tagBytes32(s: string): Hex {
  const enc = new TextEncoder().encode(s);
  if (enc.length > 32) throw new Error(`tag ${s} > 32 bytes`);
  const padded = new Uint8Array(32);
  padded.set(enc, 0);
  return ("0x" + Buffer.from(padded).toString("hex")) as Hex;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;

  try {
    const { srcChainId, srcTxHash } = await req.json();
    if (!srcChainId || !srcTxHash) {
      return NextResponse.json(
        { error: "Missing srcChainId or srcTxHash" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
      return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
    }
    const srcChain = CHAINS[srcChainId];
    const srcRpc = process.env[`RPC_URL_${srcChainId}`];
    if (!srcChain || !srcRpc) {
      return NextResponse.json({ error: `src chain ${srcChainId} not supported` }, { status: 400, headers: v7CorsHeaders });
    }

    const account = privateKeyToAccount(relayerKey as Hex);
    const srcPub = createPublicClient({ chain: srcChain, transport: makeTransport(srcRpc) });
    const receipt = await srcPub.getTransactionReceipt({ hash: srcTxHash as Hex });
    if (!receipt) {
      return NextResponse.json({ error: "src tx not found" }, { status: 404, headers: v7CorsHeaders });
    }

    // 1. Find MessageSent + InternalMessageSent in the src logs.
    let cctpMessage: Hex | null = null;
    let internalMessage: Hex | null = null;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: [MessageSentEvent], data: log.data, topics: log.topics });
        cctpMessage = ev.args.message as Hex;
      } catch {}
      try {
        const ev = decodeEventLog({ abi: [InternalMessageSentEvent], data: log.data, topics: log.topics });
        internalMessage = ev.args.encoded as Hex;
      } catch {}
    }
    if (!cctpMessage || !internalMessage) {
      return NextResponse.json(
        { error: `src tx ${srcTxHash} did not emit MessageSent + InternalMessageSent; was dispatchPlaintextOut actually called?` },
        { status: 400, headers: v7CorsHeaders },
      );
    }

    // 2. Decode dest domain from EITHER message (they must agree).
    const [cctpDecoded] = (await import("viem")).decodeAbiParameters(
      [{ type: "tuple", components: cctpMessageTypes as any }],
      cctpMessage,
    ) as any;
    const [intDecoded] = (await import("viem")).decodeAbiParameters(
      [{ type: "tuple", components: internalMessageTypes as any }],
      internalMessage,
    ) as any;
    if (cctpDecoded.destinationDomain !== intDecoded.destinationDomain) {
      return NextResponse.json(
        { error: `dest-domain mismatch: cctp=${cctpDecoded.destinationDomain} internal=${intDecoded.destinationDomain}` },
        { status: 500, headers: v7CorsHeaders },
      );
    }
    const destDomain = Number(cctpDecoded.destinationDomain);
    const destChainId = DOMAIN_TO_CHAIN_ID[destDomain];
    if (!destChainId) {
      return NextResponse.json({ error: `unknown dest domain ${destDomain}` }, { status: 400, headers: v7CorsHeaders });
    }
    const destChain = CHAINS[destChainId];
    const destRpc = process.env[`RPC_URL_${destChainId}`];
    if (!destChain || !destRpc) {
      return NextResponse.json({ error: `dest chain ${destChainId} not configured` }, { status: 500, headers: v7CorsHeaders });
    }
    const destDeploy = v7Deployment(destChainId);
    const destTransmitter = destDeploy.zusdcTransmitter as Address;
    const destBridge = destDeploy.internalBridge as Address;
    if (!destTransmitter || !destBridge) {
      return NextResponse.json({ error: "dest deployment missing zusdcTransmitter / internalBridge" }, { status: 500, headers: v7CorsHeaders });
    }

    // 3. Sign + submit receiveMessage on dest transmitter.
    const destPub = createPublicClient({ chain: destChain, transport: makeTransport(destRpc) });
    const destWallet = createWalletClient({ account, chain: destChain, transport: makeTransport(destRpc) });

    const cctpInner = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes" }],
        [tagBytes32("ZUSDCMessageTransmitterReceive"), BigInt(destChainId), destTransmitter, cctpMessage],
      ),
    );
    const cctpAttestation = await account.signMessage({ message: { raw: cctpInner } });

    let cctpTxHash: Hex | "already-used";
    try {
      cctpTxHash = await destWallet.writeContract({
        address: destTransmitter, abi: transmitterAbi, functionName: "receiveMessage",
        args: [cctpMessage, cctpAttestation],
        chain: destChain, account,
      });
      await destPub.waitForTransactionReceipt({ hash: cctpTxHash });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("AlreadyUsed") || msg.includes("0x9ad0fe48")) {
        cctpTxHash = "already-used";
      } else {
        return NextResponse.json({ error: `cctp receiveMessage failed: ${msg}` }, { status: 500, headers: v7CorsHeaders });
      }
    }

    // 4. Sign + submit receiveInternal on dest internal bridge.
    const intInner = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes" }],
        [tagBytes32("Z0tzInternalBridgeReceive"), BigInt(destChainId), destBridge, internalMessage],
      ),
    );
    const intAttestation = await account.signMessage({ message: { raw: intInner } });

    let internalTxHash: Hex | "already-used";
    try {
      internalTxHash = await destWallet.writeContract({
        address: destBridge, abi: internalBridgeAbi, functionName: "receiveInternal",
        args: [internalMessage, intAttestation],
        chain: destChain, account,
      });
      await destPub.waitForTransactionReceipt({ hash: internalTxHash });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("AlreadyUsed")) {
        internalTxHash = "already-used";
      } else {
        return NextResponse.json({ error: `receiveInternal failed: ${msg}` }, { status: 500, headers: v7CorsHeaders });
      }
    }

    if (typeof cctpTxHash !== "string" || cctpTxHash.startsWith("0x")) {
      triggerScanAndRecord({ chainId: destChainId, txHash: cctpTxHash as Hex, opKind: "bridge-cctp-receive", req });
    }
    if (typeof internalTxHash !== "string" || internalTxHash.startsWith("0x")) {
      triggerScanAndRecord({ chainId: destChainId, txHash: internalTxHash as Hex, opKind: "bridge-internal-receive", req });
    }

    return NextResponse.json(
      {
        srcChainId, destChainId, destDomain,
        cctp: { destTransmitter, txHash: cctpTxHash },
        internal: { destBridge, txHash: internalTxHash, action: Number(intDecoded.action), amount: intDecoded.amount.toString() },
      },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bridge-relay failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
