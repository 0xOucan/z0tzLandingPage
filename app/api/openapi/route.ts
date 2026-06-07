import { NextResponse } from "next/server";
import { generateV7Spec } from "@/lib/openapi/registry";

// Side-effect imports: each route module registers itself with v7Registry
// when imported. Listing them here is what makes them appear in the spec.
import "@/lib/openapi/schemas-v7";
import "@/app/api/v7/spend/route";

/**
 * Generated OpenAPI 3.1 specification of the /api/v7/* surface.
 *
 * cli-v7 / external SDK generators / Swagger UI all consume this.
 * V6.5 routes are intentionally NOT included — they remain frozen
 * with their existing un-spec'd shape.
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
