/**
 * P-256 passkey authentication — shared by all API routes.
 * Ported from Z0tz/relayer/lib/auth.ts with the V6.5 fix:
 * strips `signature` from both the root AND inside a nested `userOp`.
 */
import { p256 } from "@noble/curves/nist.js";
import { createHash } from "node:crypto";

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function createAuthMessage(body: Record<string, unknown>): Uint8Array {
  const bodyCopy: Record<string, unknown> = { ...body };
  delete bodyCopy.signature;
  if (bodyCopy.userOp && typeof bodyCopy.userOp === "object") {
    const { signature: _s, ...uopRest } = bodyCopy.userOp as Record<string, unknown>;
    bodyCopy.userOp = uopRest;
  }
  const canonical = JSON.stringify(bodyCopy, Object.keys(bodyCopy).sort());
  return sha256(new TextEncoder().encode(canonical));
}

export function verifyRelayerAuth(
  headers: Record<string, string | string[] | undefined>,
  body: Record<string, unknown>,
  requireAuth: boolean = false,
): { authenticated: boolean; legacy?: boolean; error?: string } {
  const pubXHex = (typeof headers["x-z0tz-pubx"] === "string" ? headers["x-z0tz-pubx"] : headers["x-z0tz-pubx"]?.[0]) as string | undefined;
  const pubYHex = (typeof headers["x-z0tz-puby"] === "string" ? headers["x-z0tz-puby"] : headers["x-z0tz-puby"]?.[0]) as string | undefined;
  if (!pubXHex || !pubYHex) {
    if (requireAuth) return { authenticated: false, error: "Missing Z0tz auth headers" };
    return { authenticated: true, legacy: true };
  }
  const sigHex = (typeof headers["x-z0tz-sig"] === "string" ? headers["x-z0tz-sig"] : headers["x-z0tz-sig"]?.[0]) as string | undefined;
  if (!sigHex || sigHex.replace(/^0x/, "").length !== 128) return { authenticated: false, error: "Invalid signature" };

  try {
    const publicKeyX = hexToBytes(pubXHex);
    const publicKeyY = hexToBytes(pubYHex);
    if (publicKeyX.length !== 32 || publicKeyY.length !== 32) return { authenticated: false, error: "Invalid public key" };
    const cleanSig = sigHex.replace(/^0x/, "");
    const r = BigInt("0x" + cleanSig.slice(0, 64));
    const s = BigInt("0x" + cleanSig.slice(64, 128));
    const pubKeyBytes = new Uint8Array(65);
    pubKeyBytes[0] = 0x04;
    pubKeyBytes.set(publicKeyX, 1);
    pubKeyBytes.set(publicKeyY, 33);
    const sigBytes = new Uint8Array(64);
    const rHex = r.toString(16).padStart(64, "0");
    const sHex = s.toString(16).padStart(64, "0");
    for (let i = 0; i < 32; i++) sigBytes[i] = parseInt(rHex.slice(i * 2, i * 2 + 2), 16);
    for (let i = 0; i < 32; i++) sigBytes[32 + i] = parseInt(sHex.slice(i * 2, i * 2 + 2), 16);
    const message = createAuthMessage(body);
    const valid = p256.verify(sigBytes, message, pubKeyBytes, { prehash: false });
    if (!valid) return { authenticated: false, error: "Invalid P-256 signature" };
    return { authenticated: true };
  } catch {
    return { authenticated: false, error: "Verification failed" };
  }
}
