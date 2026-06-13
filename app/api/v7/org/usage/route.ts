/**
 * /api/v7/org/usage — read-only usage roll-up for the calling org.
 *
 * The billing meter is `org_audit_log` (every authenticated call writes
 * one row via `finalize(statusCode)` inside requireOrgAuth). This
 * endpoint just queries it and returns a counted summary for the
 * window the caller asks for.
 *
 * Default window = 30 days. Accepts ?windowMs= override (max 90 days
 * to keep the query bounded). Org-key gated — an org can only see
 * THEIR OWN usage; super-admin dashboard reads the table directly.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import { getOrgUsage } from "@/lib/indexer/turso-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";
import { ErrorResponseSchema } from "@/lib/openapi/schemas-v7";
import { errorResponse } from "@/lib/relayer/api-helpers";
import { withApiLog } from "@/lib/relayer/request-log";

const OrgUsageResponseSchema = z
  .object({
    keyId: z.string(),
    orgName: z.string(),
    tier: z.string(),
    sinceMs: z.number().int(),
    ok: z.number().int().openapi({ description: "Billable 2xx calls in window" }),
    badRequest: z.number().int().openapi({ description: "4xx not billed" }),
    serverError: z.number().int().openapi({ description: "5xx not billed" }),
    total: z.number().int(),
  })
  .openapi("OrgUsageResponse");

v7Registry.registerPath({
  method: "get",
  path: "/api/v7/org/usage",
  tags: ["org-tier"],
  summary: "Roll up the calling org's API usage",
  description:
    "Counts org_audit_log rows for the calling key over the requested " +
    "window (default 30 days, max 90). The 2xx 'ok' count is what's " +
    "billed; 4xx and 5xx are surfaced for diagnostic purposes but not " +
    "metered against the tier quota.",
  security: [{ orgApiKey: [] }],
  request: {
    query: z.object({
      windowMs: z.string().optional().openapi({
        description: "Window length in milliseconds. Defaults to 30 days; max 90 days.",
      }),
    }),
  },
  responses: {
    200: { description: "Usage summary.", content: { "application/json": { schema: OrgUsageResponseSchema } } },
    401: { description: "Missing or invalid org key.", content: { "application/json": { schema: ErrorResponseSchema } } },
    503: { description: "Backend unavailable.", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

const DEFAULT_WINDOW_MS = 30 * 24 * 3600 * 1000;
const MAX_WINDOW_MS = 90 * 24 * 3600 * 1000;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: v7CorsHeaders });
}

export const GET = withApiLog("/api/v7/org/usage", async (req: NextRequest, ctx) => {
  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) { ctx.errorCode = "unauthorized"; return authResult; }
  const { auth, finalize } = authResult;
  ctx.orgId = auth.keyId;
  try {
    const url = new URL(req.url);
    const rawWindow = url.searchParams.get("windowMs");
    let windowMs = rawWindow ? Number(rawWindow) : DEFAULT_WINDOW_MS;
    if (!Number.isFinite(windowMs) || windowMs <= 0) windowMs = DEFAULT_WINDOW_MS;
    if (windowMs > MAX_WINDOW_MS) windowMs = MAX_WINDOW_MS;
    const sinceMs = Date.now() - windowMs;
    const usage = await getOrgUsage(auth.keyId, sinceMs);
    await finalize(200);
    return NextResponse.json(
      {
        keyId: auth.keyId,
        orgName: auth.orgName,
        tier: auth.tier,
        ...usage,
      },
      { headers: v7CorsHeaders },
    );
  } catch (e: any) {
    ctx.errorCode = "usage_failed";
    await finalize(500);
    return errorResponse(500, "usage_failed", v7CorsHeaders, e);
  }
});
