import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { putRecoveryArtifact, getRecoveryArtifact, type EncryptedArtifact } from "@/lib/indexer/turso-v7";
import { geofenceResponse } from "@/lib/relayer/geofence";
import {
  EncryptedArtifactSchema,
  ErrorResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

/**
 * Encrypted recovery-artifact store (Turso v7). The client uploads an ALREADY-
 * ENCRYPTED, passphrase-protected blob; this endpoint never sees plaintext.
 * On recovery the client re-derives its pubkeyHash from the passkey and GETs
 * the blob, then decrypts locally. Convenience cache only — never authoritative.
 */

const OkResponseSchema = z.object({ ok: z.literal(true) }).openapi("OkResponse");
const ArtifactGetResponseSchema = z
  .object({ artifact: EncryptedArtifactSchema })
  .openapi("ArtifactGetResponse");

v7Registry.registerPath({
  method: "post",
  path: "/api/v7/recover/artifact",
  tags: ["user-tier"],
  summary: "Store an encrypted recovery artifact (convenience cache)",
  description:
    "Stores an ALREADY-ENCRYPTED, passphrase-protected recovery blob in the " +
    "Turso v7 cache. The server never sees plaintext; the envelope (ciphertext " +
    "+ iv + salt + tag) is opaque. Unauthenticated — anyone can write to their " +
    "own pubkeyHash; security comes from the AES-GCM envelope, not from auth.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: EncryptedArtifactSchema } },
    },
  },
  responses: {
    200: {
      description: "Stored.",
      content: { "application/json": { schema: OkResponseSchema } },
    },
    400: {
      description: "Malformed body or missing envelope fields.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/recover/artifact",
  tags: ["user-tier"],
  summary: "Fetch the encrypted recovery artifact for a pubkeyHash",
  description:
    "Returns the stored encrypted blob for ?pubkeyHash=&chainId=. The client " +
    "decrypts it locally with the recovery passphrase.",
  request: {
    query: z.object({
      pubkeyHash: z.string().openapi({ description: "0x-prefixed 32-byte hash" }),
      chainId: z.string().optional().openapi({ description: "EVM chain id; defaults to 0" }),
    }),
  },
  responses: {
    200: {
      description: "Found.",
      content: { "application/json": { schema: ArtifactGetResponseSchema } },
    },
    400: {
      description: "Missing pubkeyHash query param.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    404: {
      description: "No artifact stored for this pubkeyHash.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

// Store an encrypted artifact. Rejects anything that looks like plaintext
// (defense-in-depth: the fields must be the AES-GCM envelope, no extras).
export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  try {
    const rawBody = await req.json();
    const parsed = EncryptedArtifactSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const a = parsed.data as EncryptedArtifact;
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
    return NextResponse.json({ ok: true }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "store failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}

// Fetch the encrypted artifact for ?pubkeyHash=&chainId= (decrypt is client-side).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pubkeyHash = url.searchParams.get("pubkeyHash");
    const chainId = Number(url.searchParams.get("chainId") ?? "0");
    if (!pubkeyHash)
      return NextResponse.json({ error: "missing pubkeyHash" }, { status: 400, headers: v7CorsHeaders });
    const artifact = await getRecoveryArtifact(pubkeyHash, chainId);
    if (!artifact)
      return NextResponse.json({ error: "not found" }, { status: 404, headers: v7CorsHeaders });
    return NextResponse.json({ artifact }, { headers: v7CorsHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "fetch failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
