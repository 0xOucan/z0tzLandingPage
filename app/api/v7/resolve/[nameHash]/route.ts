/**
 * GET /api/v7/resolve/:nameHash — V7-FINAL patch #11.
 *
 * The on-chain Z0tzNameRegistry.resolve(nameHash) returns the opaque
 * sentinel address(0x1) for every non-LEDGER_ROLE caller, so an off-chain
 * client (CLI `send --to-name`, GUI) cannot reach the real account through
 * the contract. The relayer is the namespace authority (V7-FINAL #7) and
 * already sees every NameClaim / Repointed / Revoked event it submits — we
 * cache the resolution in the `name_resolutions` Turso table at submit
 * time + a one-shot historical backfill script, then expose it here.
 *
 * Auth model (soft anti-enumeration):
 *   - Header `X-Z0tz-Resolve-Auth: pubX=<hex64>;pubY=<hex64>;ts=<unix>;sig=<hex128>`
 *   - sig = P-256 signature over sha256("z0tz-resolve|<nameHashLower>|<ts>")
 *     using the caller's passkey. The signed message binds the requested
 *     nameHash + a recent timestamp (±5 min) so the header is not
 *     replayable across requests.
 *   - We do NOT bind the auth pubkey to the resolved account — any z0tz
 *     passkey is sufficient. The gate's only job is to keep randos from
 *     bulk-scraping the namespace; it is not authorization to resolve a
 *     specific name.
 *   - Rate-limited 60/min per (pubX,pubY).
 */
import { NextRequest, NextResponse } from "next/server";
import { p256 } from "@noble/curves/nist.js";
import { createHash } from "node:crypto";
import { lookupNameResolution } from "@/lib/relayer/name-cache";
import { ErrorResponseSchema, ResolveResSchema } from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { consumeToken } from "@/lib/relayer/rate-limit";
import { withApiLog } from "@/lib/relayer/request-log";
import { errorResponse } from "@/lib/relayer/api-helpers";

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/resolve/{nameHash}",
  tags: ["user-tier"],
  summary: "Resolve a name hash to its smart-account (relayer cache).",
  description:
    "Returns the cached (nameHash -> resolvedAccount) the relayer observed " +
    "when it submitted the underlying NameClaim*/Repointed*/Revoked* tx. " +
    "Requires the X-Z0tz-Resolve-Auth header: any z0tz passkey signature " +
    "over `sha256('z0tz-resolve|<nameHash>|<ts>')` is accepted. The on-chain " +
    "registry returns the address(0x1) sentinel to all non-LEDGER_ROLE " +
    "callers — this endpoint is the off-chain resolution path.",
  security: [{ resolveAuth: [] }],
  request: {
    params: ResolveResSchema.pick({ nameHash: true }),
  },
  responses: {
    200: {
      description: "Resolution found.",
      content: { "application/json": { schema: ResolveResSchema } },
    },
    400: {
      description: "Malformed nameHash.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    401: {
      description: "Missing or invalid X-Z0tz-Resolve-Auth header.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No cached resolution for this nameHash.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    429: {
      description: "Rate limit exceeded for this caller.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

const NAME_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const SIG_HEX_RE = /^[0-9a-fA-F]{128}$/;
const PUB_HEX_RE = /^[0-9a-fA-F]{64}$/;
const AUTH_DOMAIN = "z0tz-resolve";
const TS_SKEW_SECONDS = 300;

interface ParsedAuth { pubX: string; pubY: string; ts: number; sig: string; }

function parseAuthHeader(raw: string | null): ParsedAuth | null {
  if (!raw) return null;
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  if (!out.pubx || !out.puby || !out.ts || !out.sig) return null;
  const pubX = out.pubx.replace(/^0x/, "");
  const pubY = out.puby.replace(/^0x/, "");
  const sig = out.sig.replace(/^0x/, "");
  const ts = Number(out.ts);
  if (!PUB_HEX_RE.test(pubX) || !PUB_HEX_RE.test(pubY)) return null;
  if (!SIG_HEX_RE.test(sig)) return null;
  if (!Number.isFinite(ts) || !Number.isInteger(ts) || ts <= 0) return null;
  return { pubX, pubY, ts, sig };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function verifyResolveAuth(auth: ParsedAuth, nameHashLower: string): boolean {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - auth.ts) > TS_SKEW_SECONDS) return false;
    const message = `${AUTH_DOMAIN}|${nameHashLower}|${auth.ts}`;
    const digest = new Uint8Array(createHash("sha256").update(message).digest());
    const pubBytes = new Uint8Array(65);
    pubBytes[0] = 0x04;
    pubBytes.set(hexToBytes(auth.pubX), 1);
    pubBytes.set(hexToBytes(auth.pubY), 33);
    const sigBytes = hexToBytes(auth.sig);
    return p256.verify(sigBytes, digest, pubBytes, { prehash: false });
  } catch {
    return false;
  }
}

export const GET = withApiLog(
  "/api/v7/resolve",
  async (req: NextRequest, ctx) => {
    // Extract nameHash from the URL — Next.js dynamic param handling for
    // App Router GETs varies by version, but the pathname is always reliable.
    const segments = new URL(req.url).pathname.split("/").filter(Boolean);
    const nameHashRaw = segments[segments.length - 1] ?? "";

    if (!NAME_HASH_RE.test(nameHashRaw)) {
      ctx.errorCode = "invalid_name_hash";
      return errorResponse(400, "invalid_name_hash", v7CorsHeaders);
    }
    const nameHashLower = nameHashRaw.toLowerCase();

    const auth = parseAuthHeader(req.headers.get("x-z0tz-resolve-auth"));
    if (!auth) {
      ctx.errorCode = "auth_missing";
      return errorResponse(401, "auth_missing", v7CorsHeaders);
    }
    if (!verifyResolveAuth(auth, nameHashLower)) {
      ctx.errorCode = "auth_invalid";
      return errorResponse(401, "auth_invalid", v7CorsHeaders);
    }

    const rateKey = `resolve:${auth.pubX}:${auth.pubY}`;
    const allowed = await consumeToken(rateKey, "sandbox");
    if (!allowed) {
      ctx.errorCode = "rate_limited";
      return errorResponse(429, "rate_limited", v7CorsHeaders);
    }

    const row = await lookupNameResolution(nameHashLower as `0x${string}`);
    if (!row) {
      ctx.errorCode = "not_found";
      return errorResponse(404, "not_found", v7CorsHeaders);
    }
    ctx.chainId = row.chainId;
    return NextResponse.json(
      {
        nameHash: row.nameHash,
        resolvedAccount: row.resolvedAccount,
        chainId: row.chainId,
        active: row.active,
        claimedAt: row.claimedAt,
      },
      { headers: v7CorsHeaders },
    );
  },
);
