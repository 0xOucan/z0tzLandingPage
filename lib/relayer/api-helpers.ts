/**
 * Shared helpers for /api/v7/* route hardening (api-fuzz 2026-06-12 batch).
 *
 * - parseJson(req): wraps req.json() and returns a discriminated result so
 *   callers never let SyntaxError bubble into a 500.
 * - sanitizeError(e, code): never reflects raw upstream messages back to
 *   the caller. Strips known fingerprinting strings (viem version,
 *   internal env-var names) and returns the documented {error, code} shape.
 * - errorResponse: helper to render the sanitized envelope as NextResponse.
 */
import { NextRequest, NextResponse } from "next/server";

export type ParseJsonResult =
  | { ok: true; value: any }
  | { ok: false; response: NextResponse };

export async function parseJson(req: NextRequest, headers: Record<string, string>): Promise<ParseJsonResult> {
  try {
    const value = await req.json();
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid-json", code: "validation_failed" },
        { status: 400, headers },
      ),
    };
  }
}

/** Fingerprint strings we never want to reflect in a public error body. */
const SANITIZE_PATTERNS: RegExp[] = [
  /\bviem@[0-9][^\s)]*/gi,
  /\bDEPLOYMENT_V7_[A-Z0-9_]+/gi,
  /\bRELAYER_PRIVATE_KEY\b/gi,
  /\bTURSO_[A-Z0-9_]+/gi,
  /\bZ0TZ_ADMIN_KEY\b/gi,
  /\bRPC_URL_[A-Z0-9_]+/gi,
  /Version:\s*\S+/gi,
];

/** Pick the right short code for the response, default "internal". */
export function sanitizeError(e: any, code = "internal"): { error: string; code: string } {
  // Log full server-side; never returned to caller.
  try {
    // eslint-disable-next-line no-console
    console.error("[api]", code, e?.stack ?? e);
  } catch {}
  let msg = "internal";
  // Allow a small allowlist of curated short messages to flow through if
  // the caller explicitly sets them (e.g. "rate_limited"). Anything else
  // gets stripped to a generic token.
  if (typeof code === "string" && /^[a-z0-9_-]{1,32}$/.test(code) && code !== "internal") {
    msg = code;
  }
  // If somehow upstream slipped a string, run the strip just for paranoia.
  for (const re of SANITIZE_PATTERNS) {
    msg = msg.replace(re, "");
  }
  return { error: msg, code };
}

export function errorResponse(
  status: number,
  code: string,
  headers: Record<string, string>,
  e?: any,
): NextResponse {
  const body = sanitizeError(e, code);
  return NextResponse.json(body, { status, headers });
}
