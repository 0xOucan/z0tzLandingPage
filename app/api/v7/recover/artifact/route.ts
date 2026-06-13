import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, encodePacked } from "viem";
import { putRecoveryArtifact, getRecoveryArtifact, type EncryptedArtifact } from "@/lib/indexer/turso-v7";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { readAccountOwner } from "@/lib/relayer/v7";
import {
  EncryptedArtifactSchema,
  ErrorResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { parseJson, errorResponse } from "@/lib/relayer/api-helpers";
import { consumeToken } from "@/lib/relayer/rate-limit";
import { withApiLog, sha256Hex } from "@/lib/relayer/request-log";

/**
 * Encrypted recovery-artifact store. The cipher envelope is opaque to us;
 * privacy comes from AES-GCM passphrase-encryption client-side.
 *
 * H-4 fixes (this batch):
 *   - POST requires X-Z0tz-Recovery-Auth (P-256 sig over account|blobHash|ts).
 *   - The sig is verified against pubX/pubY supplied alongside it; we then
 *     require keccak256(abi.encodePacked(pubX,pubY)) === pubkeyHash. This
 *     proves the writer holds the passkey rooted at this pubkeyHash.
 *   - STRONGER GATE (H-4 followup): when (account, chainId) are supplied we
 *     additionally read the Z0tzAccount's on-chain ownerX/ownerY via viem
 *     and require they match the auth (pubX, pubY). 30-second in-memory LRU
 *     caches the read to avoid RPC hammering. On RPC failure we fall back to
 *     the keccak gate (degraded mode) and tag the request log with
 *     `errorCode = "owner_gate_degraded"` so dashboard alerting can fire.
 *   - Size cap on ciphertext (32KB) + small-string cap on iv/salt/tag.
 *   - ts must be within ±10 minutes of server clock (replay window).
 *   - Per-account write rate-limit: 5/hour.
 *   - GET validates pubkeyHash against Bytes32 regex before DB lookup.
 */

const Bytes32Re = /^0x[a-fA-F0-9]{64}$/;

const StrictArtifactSchema = EncryptedArtifactSchema.extend({
  ciphertext: z.string().min(8).max(32 * 1024),
  iv: z.string().min(8).max(256),
  salt: z.string().min(8).max(256),
  tag: z.string().min(8).max(256),
});

const OkResponseSchema = z.object({ ok: z.literal(true) }).openapi("OkResponse");
const ArtifactGetResponseSchema = z
  .object({ artifact: StrictArtifactSchema })
  .openapi("ArtifactGetResponse");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/recover/artifact",
  tags: ["user-tier"],
  summary: "Store an encrypted recovery artifact (passkey-gated cache)",
  description:
    "Stores an ALREADY-ENCRYPTED, passphrase-protected recovery blob. The " +
    "POST is gated by an X-Z0tz-Recovery-Auth header containing a P-256 " +
    "signature over account|sha256(ciphertext)|ts, verified against the " +
    "supplied (pubX, pubY) which must hash to the body's pubkeyHash.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: StrictArtifactSchema } },
    },
  },
  responses: {
    200: { description: "Stored.", content: { "application/json": { schema: OkResponseSchema } } },
    400: { description: "Validation failed.", content: { "application/json": { schema: ErrorResponseSchema } } },
    401: { description: "Auth header missing or invalid.", content: { "application/json": { schema: ErrorResponseSchema } } },
    413: { description: "Payload too large.", content: { "application/json": { schema: ErrorResponseSchema } } },
    429: { description: "Rate limit exceeded.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/recover/artifact",
  tags: ["user-tier"],
  summary: "Fetch the encrypted recovery artifact for a pubkeyHash",
  request: {
    query: z.object({
      pubkeyHash: z.string().regex(Bytes32Re),
      chainId: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Found.", content: { "application/json": { schema: ArtifactGetResponseSchema } } },
    400: { description: "Malformed pubkeyHash.", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Not found.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

// In-memory per-account write counter (5/hour). Keyed by pubkeyHash.
const WRITE_WINDOW_MS = 60 * 60 * 1000;
const WRITE_CAP = 5;
const WRITE_LOG = new Map<string, number[]>(); // pubkeyHash → recent ms timestamps

function checkPerAccountWriteLimit(pubkeyHash: string, now: number): boolean {
  const list = (WRITE_LOG.get(pubkeyHash) ?? []).filter((t) => now - t < WRITE_WINDOW_MS);
  if (list.length >= WRITE_CAP) {
    WRITE_LOG.set(pubkeyHash, list);
    return false;
  }
  list.push(now);
  WRITE_LOG.set(pubkeyHash, list);
  return true;
}

// ── H-4 followup: on-chain ownerX/ownerY check w/ 30s cache ────────────
type OwnerCacheEntry = { ownerX: bigint; ownerY: bigint; expiresAt: number };
const OWNER_CACHE_TTL_MS = 30_000;
const OWNER_CACHE = new Map<string, OwnerCacheEntry>(); // `${chainId}:${account.toLowerCase()}` -> entry

async function getOwnerCached(chainId: number, account: string): Promise<{ ownerX: bigint; ownerY: bigint }> {
  const key = `${chainId}:${account.toLowerCase()}`;
  const now = Date.now();
  const hit = OWNER_CACHE.get(key);
  if (hit && hit.expiresAt > now) return { ownerX: hit.ownerX, ownerY: hit.ownerY };
  const { ownerX, ownerY } = await readAccountOwner(chainId, account as `0x${string}`);
  OWNER_CACHE.set(key, { ownerX, ownerY, expiresAt: now + OWNER_CACHE_TTL_MS });
  // Trim aggressively so the Map can't grow unbounded under abuse.
  if (OWNER_CACHE.size > 1024) {
    for (const [k, v] of OWNER_CACHE) if (v.expiresAt <= now) OWNER_CACHE.delete(k);
  }
  return { ownerX, ownerY };
}

/**
 * Stronger gate result:
 *   - "match"     -> on-chain owner == auth pubkey. Gate passed.
 *   - "mismatch"  -> on-chain owner != auth pubkey. Reject the request.
 *   - "degraded"  -> RPC failed / chainId-unknown / account missing.
 *                    Caller should fall back to the keccak hash check.
 */
async function checkOnChainOwner(
  chainId: number | undefined,
  account: string | undefined,
  authPubX: bigint,
  authPubY: bigint,
): Promise<"match" | "mismatch" | "degraded"> {
  if (!chainId || !account) return "degraded";
  try {
    const { ownerX, ownerY } = await getOwnerCached(chainId, account);
    if (ownerX === 0n && ownerY === 0n) return "degraded"; // uninitialized / wrong addr
    return ownerX === authPubX && ownerY === authPubY ? "match" : "mismatch";
  } catch {
    return "degraded";
  }
}

type RecoveryAuth = { pubX: string; pubY: string; ts: number; sigHex: string };

function parseAuthHeader(h: string | null): RecoveryAuth | null {
  if (!h) return null;
  // Format: "pubX=<dec>;pubY=<dec>;ts=<ms>;sig=<hex64bytes>"
  const parts = Object.fromEntries(
    h.split(";").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  if (!parts.pubX || !parts.pubY || !parts.ts || !parts.sig) return null;
  const ts = Number(parts.ts);
  if (!Number.isFinite(ts)) return null;
  return { pubX: parts.pubX, pubY: parts.pubY, ts, sigHex: parts.sig };
}

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (s.length % 2) throw new Error("odd hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyRecoveryAuth(
  auth: RecoveryAuth,
  pubkeyHash: string,
  account: string | undefined,
  blobHash: string,
): Promise<boolean> {
  try {
    // Bind (pubX,pubY) ↔ pubkeyHash so the signer is provably the owner.
    const computed = keccak256(
      encodePacked(["uint256", "uint256"], [BigInt(auth.pubX), BigInt(auth.pubY)]),
    ).toLowerCase();
    if (computed !== pubkeyHash.toLowerCase()) return false;

    const message = `${(account ?? "").toLowerCase()}|${blobHash}|${auth.ts}`;
    const { p256 } = await import("@noble/curves/nist.js");
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const msgHash = sha256(new TextEncoder().encode(message));

    const pubBytes = new Uint8Array(65);
    pubBytes[0] = 0x04;
    const x = BigInt(auth.pubX);
    const y = BigInt(auth.pubY);
    const FF = BigInt(0xff);
    for (let i = 31; i >= 0; i--) {
      pubBytes[1 + i] = Number((x >> BigInt((31 - i) * 8)) & FF);
      pubBytes[33 + i] = Number((y >> BigInt((31 - i) * 8)) & FF);
    }
    const sig = hexToBytes(auth.sigHex);
    if (sig.length !== 64) return false;
    return p256.verify(sig, msgHash, pubBytes);
  } catch {
    return false;
  }
}

export const POST = withApiLog("/api/v7/recover/artifact", async (req: NextRequest, ctx) => {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) { ctx.errorCode = "geofenced"; return blocked; }

  const json = await parseJson(req, v7CorsHeaders);
  if (!json.ok) { ctx.errorCode = "invalid_json"; return json.response; }

  const parsed = StrictArtifactSchema.safeParse(json.value);
  if (!parsed.success) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json(
      {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed",
      },
      { status: 400, headers: v7CorsHeaders },
    );
  }
  const a = parsed.data as EncryptedArtifact;

  const authHeader = parseAuthHeader(req.headers.get("x-z0tz-recovery-auth"));
  if (!authHeader) {
    ctx.errorCode = "unauthorized";
    return errorResponse(401, "unauthorized", v7CorsHeaders);
  }
  const now = Date.now();
  if (Math.abs(now - authHeader.ts) > 10 * 60 * 1000) {
    ctx.errorCode = "auth_stale";
    return errorResponse(401, "auth_stale", v7CorsHeaders);
  }

  const blobHash = await sha256Hex(a.ciphertext);
  const ok = await verifyRecoveryAuth(authHeader, a.pubkeyHash, a.account, blobHash);
  if (!ok) {
    ctx.errorCode = "bad_signature";
    return errorResponse(401, "bad_signature", v7CorsHeaders);
  }

  // H-4 stronger gate: cross-check the auth pubkey against the on-chain
  // ownerX/ownerY of the smart account named in the body. The keccak hash
  // check above already proves possession of the pubkey rooted at this
  // pubkeyHash; this additionally proves the pubkey is still the current
  // owner (e.g. catches stale ciphertexts replayed after rotation).
  // Degrades gracefully (errorCode = "owner_gate_degraded") on RPC failure
  // so a transient RPC outage doesn't lock users out of recovery writes.
  const onChain = await checkOnChainOwner(a.chainId, a.account, BigInt(authHeader.pubX), BigInt(authHeader.pubY));
  if (onChain === "mismatch") {
    ctx.errorCode = "owner_mismatch";
    return errorResponse(401, "owner_mismatch", v7CorsHeaders);
  }
  if (onChain === "degraded") {
    // Surface to the dashboard via the request log. The keccak gate is
    // still enforced above, so this is degraded-but-not-broken.
    ctx.errorCode = "owner_gate_degraded";
  }

  if (!checkPerAccountWriteLimit(a.pubkeyHash.toLowerCase(), now)) {
    ctx.errorCode = "rate_limited";
    return errorResponse(429, "rate_limited", v7CorsHeaders);
  }

  try {
    await putRecoveryArtifact({
      pubkeyHash: a.pubkeyHash,
      chainId: a.chainId ?? 0,
      account: a.account,
      version: a.version,
      ciphertext: a.ciphertext,
      iv: a.iv,
      salt: a.salt,
      tag: a.tag,
      kdf: a.kdf,
    });
    ctx.chainId = a.chainId ?? null;
    return NextResponse.json({ ok: true }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "store_failed";
    return errorResponse(500, "store_failed", v7CorsHeaders, e);
  }
});

export const GET = withApiLog("/api/v7/recover/artifact", async (req: NextRequest, ctx) => {
  try {
    const url = new URL(req.url);
    const pubkeyHash = url.searchParams.get("pubkeyHash") ?? "";
    if (!Bytes32Re.test(pubkeyHash)) {
      ctx.errorCode = "validation_failed";
      return NextResponse.json(
        { error: "invalid pubkeyHash", code: "validation_failed" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const chainId = Number(url.searchParams.get("chainId") ?? "0");
    ctx.chainId = chainId;

    // Rate-limit GETs lightly to prevent existence enumeration.
    const allowed = await consumeToken(`gethash:${pubkeyHash}`);
    if (!allowed) {
      ctx.errorCode = "rate_limited";
      return errorResponse(429, "rate_limited", v7CorsHeaders);
    }

    const artifact = await getRecoveryArtifact(pubkeyHash, chainId);
    if (!artifact) {
      ctx.errorCode = "not_found";
      return NextResponse.json({ error: "not_found", code: "not_found" }, { status: 404, headers: v7CorsHeaders });
    }
    return NextResponse.json({ artifact }, { headers: v7CorsHeaders });
  } catch (e: any) {
    ctx.errorCode = "fetch_failed";
    return errorResponse(500, "fetch_failed", v7CorsHeaders, e);
  }
});
