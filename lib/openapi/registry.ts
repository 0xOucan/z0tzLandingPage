/**
 * Central OpenAPI registry for the V7 API surface.
 *
 * Why this exists:
 *   - Single source of truth: every /api/v7/* route registers its zod
 *     request + response schemas here. The schemas are used both at
 *     runtime (req body validation) and for spec generation, so docs
 *     can't drift from behavior.
 *   - Decouples the CLI from the landing repo: cli-v7 codegens types
 *     against /api/openapi.json — adding a new route on the landing
 *     side just requires the CLI to re-run `pnpm gen:client`.
 *
 * SCOPE: V7 ONLY. V6.5 routes (top-level /api/{bridge,ledger-op,...})
 * are deliberately NOT registered here. V6.5 stays frozen with its
 * existing un-spec'd shape; the OpenAPI surface describes the
 * supported, evolving V7 API only.
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

/// The one registry every V7 route imports + registers against.
export const v7Registry = new OpenAPIRegistry();

/// HMAC API-key security scheme used by /api/v7/org/* admin endpoints.
/// User-tier routes (cashin, spend, names, recover, stealth) authenticate
/// per-call via the existing P-256 passkey headers — represented as a
/// separate scheme below so consumers can pick the right one per route.
v7Registry.registerComponent("securitySchemes", "orgApiKey", {
  type: "apiKey",
  in: "header",
  name: "X-Z0tz-Org-Auth",
  description:
    "M-7 HMAC-over-body org auth. Header shape: " +
    "`X-Z0tz-Org-Auth: keyId=<8-hex>;ts=<unix-ms>;sig=<64-hex>` where " +
    "`sig = HMAC_SHA256(plaintext_key, `${ts}|${METHOD}|${path}|${sha256Hex(body)}`)`. " +
    "The plaintext key is the value issued ONCE at org provisioning. `ts` " +
    "must be within ±5 minutes of server clock (replay window). Binding " +
    "the body into the signature stops the swap-the-body-in-flight attack " +
    "the previous static-key scheme allowed. Required on /api/v7/org/*.",
});

v7Registry.registerComponent("securitySchemes", "passkey", {
  type: "apiKey",
  in: "header",
  name: "X-Z0tz-Sig",
  description:
    "P-256 passkey signature over the request body. The pubkey is passed " +
    "via X-Z0tz-PubX + X-Z0tz-PubY headers. Used by user-tier routes " +
    "(/api/v7/{cashin,spend,names,recover,stealth/*}).",
});

v7Registry.registerComponent("securitySchemes", "resolveAuth", {
  type: "apiKey",
  in: "header",
  name: "X-Z0tz-Resolve-Auth",
  description:
    "Any z0tz passkey P-256 signature over `sha256('z0tz-resolve|<nameHash>|<ts>')`. " +
    "Required on GET /api/v7/resolve/{nameHash}.",
});

/// Build the OpenAPI 3.1 document from the accumulated registrations.
/// Called by the /api/openapi route on each request — the document is
/// purely a function of the registry, so it's cheap to regenerate and
/// guaranteed to track whatever zod schemas are imported at call time.
export function generateV7Spec() {
  const generator = new OpenApiGeneratorV31(v7Registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Z0tz V7 API",
      version: "0.7.0",
      description:
        "Z0tz V7 relayer + B2B SaaS API. Two tiers:\n\n" +
        "- **User tier** (`/api/v7/{cashin,spend,names,recover,stealth/*}`):" +
        " gasless relayer endpoints authenticated per-call by the user's " +
        "P-256 passkey signature over the request body.\n" +
        "- **Org tier** (`/api/v7/org/*`): institutional admin surface " +
        "(subdomain claim/repoint/revoke, policy editor, users + events " +
        "indexer queries, org-initiated recovery) authenticated by an " +
        "HMAC API key issued during provisioning.\n\n" +
        "V6.5 routes (top-level `/api/{bridge,ledger-op,...}`) are " +
        "intentionally NOT documented here — V6.5 is frozen.",
      contact: {
        name: "Z0tz",
        url: "https://z0tz.app",
      },
    },
    servers: [
      { url: "https://landing.z0tz.app", description: "Production" },
      { url: "http://localhost:3000", description: "Local dev" },
    ],
  });
}

/// Helper: shared CORS headers every v7 route already uses. Exposed here
/// so the route bodies can be even thinner once they're all migrated.
export const v7CorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig, X-Z0tz-Org-Key, X-Z0tz-Org-Auth",
} as const;
