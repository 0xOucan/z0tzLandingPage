import { NextRequest, NextResponse } from "next/server";
import { putRecoveryArtifact, getRecoveryArtifact, type EncryptedArtifact } from "@/lib/indexer/turso-v7";
import { geofenceResponse } from "@/lib/relayer/geofence";

/**
 * Encrypted recovery-artifact store (Turso v7). The client uploads an ALREADY-
 * ENCRYPTED, passphrase-protected blob; this endpoint never sees plaintext.
 * On recovery the client re-derives its pubkeyHash from the passkey and GETs
 * the blob, then decrypts locally. Convenience cache only — never authoritative.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// Store an encrypted artifact. Rejects anything that looks like plaintext
// (defense-in-depth: the fields must be the AES-GCM envelope, no extras).
export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, corsHeaders);
  if (blocked) return blocked;
  try {
    const a = (await req.json()) as EncryptedArtifact;
    if (!a?.pubkeyHash || !a.ciphertext || !a.iv || !a.salt || !a.tag) {
      return NextResponse.json({ error: "missing encrypted-envelope fields (pubkeyHash, ciphertext, iv, salt, tag)" }, { status: 400, headers: corsHeaders });
    }
    await putRecoveryArtifact({
      pubkeyHash: a.pubkeyHash, chainId: a.chainId ?? 0, account: a.account, version: a.version,
      ciphertext: a.ciphertext, iv: a.iv, salt: a.salt, tag: a.tag, kdf: a.kdf,
    });
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "store failed" }, { status: 500, headers: corsHeaders });
  }
}

// Fetch the encrypted artifact for ?pubkeyHash=&chainId= (decrypt is client-side).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pubkeyHash = url.searchParams.get("pubkeyHash");
    const chainId = Number(url.searchParams.get("chainId") ?? "0");
    if (!pubkeyHash) return NextResponse.json({ error: "missing pubkeyHash" }, { status: 400, headers: corsHeaders });
    const artifact = await getRecoveryArtifact(pubkeyHash, chainId);
    if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404, headers: corsHeaders });
    return NextResponse.json({ artifact }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "fetch failed" }, { status: 500, headers: corsHeaders });
  }
}
