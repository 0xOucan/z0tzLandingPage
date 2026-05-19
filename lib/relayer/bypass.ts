/**
 * Rate-limit bypass token.
 *
 * Set `RELAYER_BYPASS_TOKEN=<random-string>` on the relayer AND on any
 * client that wants to skip per-IP rate limits — the client sends
 * `X-Z0tz-Bypass: <token>` header and the rate-limit checks short-circuit.
 *
 * Designed for trusted, controlled clients only (the internal volume bot,
 * load-test fixtures, paid-tier customers). Production user traffic
 * never carries this header and remains rate-limited as usual.
 *
 * Behavior when the env var is unset: bypass is disabled — no header
 * combination opens the gate. Safe by default.
 */
import type { NextRequest } from "next/server";

export function isBypassRequest(req: NextRequest): boolean {
  const token = process.env.RELAYER_BYPASS_TOKEN?.trim();
  if (!token) return false;
  const presented = req.headers.get("x-z0tz-bypass")?.trim();
  if (!presented) return false;
  // Constant-time compare to avoid leaking the token via timing. Both
  // sides are ASCII; this is fine for the threat model (defending the
  // bot's token, not nation-state-grade attacks).
  if (presented.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ presented.charCodeAt(i);
  }
  return diff === 0;
}
