import { NextRequest, NextResponse } from "next/server";

/**
 * IP-based geofencing for the relayer endpoints deployed on Vercel.
 *
 * Default OFF — enable via `GEOFENCE_ENABLED=true`. Block list is
 * configurable via `GEOFENCE_BLOCKED_COUNTRIES` (comma-separated
 * ISO-3166 alpha-2 codes). Defaults to OFAC sanctioned set.
 *
 * Localhost / private-network IPs always pass through so local dev
 * isn't broken. Unknown IPs (GeoIP miss) also pass — fail-open is
 * the appropriate default for an enrichment lookup whose absence is
 * not a security signal.
 *
 * The companion enforcement layer is the on-chain compliance gate
 * (Z0tzComplianceGate) which refuses sanctioned addresses. Geofencing
 * is the additional API-layer guardrail; it is not a replacement.
 */
const DEFAULT_BLOCKED = "CU,IR,KP,SY";

/**
 * Lazy geoip-lite loader. The package reads its IP DB from disk when
 * the module is first imported, which breaks Next.js's
 * static-page-collection step during `next build` (the data path
 * doesn't exist in that context). Loading it lazily on the first
 * request defers the FS read until runtime, where the resolution
 * succeeds.
 */
type GeoLookup = (ip: string) => { country: string } | null;
let cachedLookup: GeoLookup | null | undefined;

function getLookup(): GeoLookup | null {
  if (cachedLookup !== undefined) return cachedLookup;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("geoip-lite");
    const fn: GeoLookup | undefined =
      typeof mod.lookup === "function"
        ? mod.lookup
        : typeof mod.default?.lookup === "function"
          ? mod.default.lookup
          : undefined;
    cachedLookup = fn ?? null;
  } catch {
    cachedLookup = null;
  }
  return cachedLookup;
}

export type GeofenceVerdict =
  | { allowed: true; reason?: undefined; country?: string | null }
  | { allowed: false; reason: "geofence"; country: string };

export interface GeofenceConfig {
  enabled: boolean;
  blocked: ReadonlySet<string>;
}

export function loadGeofenceConfig(): GeofenceConfig {
  const enabled = (process.env.GEOFENCE_ENABLED ?? "false").toLowerCase() === "true";
  const list = (process.env.GEOFENCE_BLOCKED_COUNTRIES ?? DEFAULT_BLOCKED)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return { enabled, blocked: new Set(list) };
}

export function isLocalAddress(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  // IPv6-mapped IPv4 loopback
  if (ip.startsWith("::ffff:127.")) return true;
  // RFC 1918 private ranges
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  // Link-local
  if (ip.startsWith("169.254.")) return true;
  if (ip.toLowerCase().startsWith("fe80:")) return true;
  // IPv6 ULA
  if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) return true;
  return false;
}

/**
 * Decide whether an IP is allowed by the geofence policy. Pure function
 * over (ip, config) — easy to unit test.
 */
export function checkGeofence(ip: string, config?: GeofenceConfig): GeofenceVerdict {
  const cfg = config ?? loadGeofenceConfig();
  if (!cfg.enabled) return { allowed: true };
  if (!ip || isLocalAddress(ip)) return { allowed: true };

  // Strip IPv6-mapped IPv4 prefix so geoip-lite's IPv4 DB matches.
  const cleaned = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  const lookup = getLookup();
  if (!lookup) return { allowed: true };

  const result = lookup(cleaned);
  if (!result || !result.country) return { allowed: true };
  const country = result.country.toUpperCase();
  if (cfg.blocked.has(country)) {
    return { allowed: false, reason: "geofence", country };
  }
  return { allowed: true, country };
}

/**
 * Extract the client IP from a Next.js Request's headers, accounting
 * for typical proxy chains (Vercel sets x-forwarded-for and
 * x-real-ip). Returns the leftmost public-looking address from XFF,
 * or falls back through the chain.
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const candidates = xff.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    // Prefer the leftmost non-private address; fall back to leftmost.
    for (const c of candidates) {
      if (!isLocalAddress(c)) return c;
    }
    if (candidates.length > 0) return candidates[0];
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
}

/**
 * Convenience wrapper a Next.js API route can call as the first thing
 * in its POST handler. Returns a 403 NextResponse if the request is
 * geofenced; returns null otherwise.
 *
 * Usage:
 *
 *   const blocked = geofenceResponse(req, corsHeaders);
 *   if (blocked) return blocked;
 */
export function geofenceResponse(
  req: NextRequest,
  corsHeaders: Record<string, string> = {},
): NextResponse | null {
  const ip = extractClientIp(req.headers);
  const verdict = checkGeofence(ip);
  if (verdict.allowed) return null;
  // Country-only logging — never the full IP, by design.
  console.warn(`[geofence] blocked country=${verdict.country}`);
  return NextResponse.json(
    {
      success: false,
      error: "geofence_blocked",
      country: verdict.country,
      message: "Service is not available in your region.",
    },
    {
      status: 403,
      headers: {
        ...corsHeaders,
        "X-Geofence-Country": verdict.country,
      },
    },
  );
}
