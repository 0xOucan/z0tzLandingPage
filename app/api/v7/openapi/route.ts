import { NextResponse } from "next/server";
import { generateV7Spec } from "@/lib/openapi/registry";

// Side-effect imports: each route module registers itself with v7Registry
// when imported. Listing them here is what makes them appear in the spec.
// This MUST mirror app/api/openapi/route.ts — if you add a v7 route, add it
// to both lists. (Or refactor both to share a single registration module.)
import "@/lib/openapi/schemas-v7";
import "@/app/api/v7/spend/route";
import "@/app/api/v7/airdrop/route";
import "@/app/api/v7/cashin/route";
import "@/app/api/v7/names/route";
import "@/app/api/v7/recover/route";
import "@/app/api/v7/recover/artifact/route";
import "@/app/api/v7/stealth/watch/route";
import "@/app/api/v7/stealth/inbound/route";
import "@/app/api/v7/org/subdomain/route";
import "@/app/api/v7/org/subdomain/repoint/route";
import "@/app/api/v7/org/subdomain/revoke/route";
import "@/app/api/v7/org/policy/route";
import "@/app/api/v7/org/recover/route";
import "@/app/api/v7/scan/route";
import "@/app/api/v7/paymaster/cosign/route";
import "@/app/api/v7/org/usage/route";

/**
 * Bug 1 fix (2026-06-14 smoke): /api/v7/openapi was 404. The original
 * spec lived at /api/openapi (no v7 prefix) — but cli-v7 and SDK
 * generators expected the v7-prefixed path to mirror the rest of the
 * v7 surface. Serve the same generated 3.1 document under both paths.
 *
 * The cache control is identical: 5-minute s-maxage. Spec changes are
 * tied to deploys, not runtime state, so a long edge cache is safe.
 */
export const dynamic = "force-static";

export async function GET() {
  const spec = generateV7Spec();
  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
