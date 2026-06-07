import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitOrgRepointSubdomain, type OrgRepointSubdomainReq } from "@/lib/relayer/v7";
import { requireOrgAuth } from "@/lib/relayer/org-auth";
import {
  OrgRepointSubdomainReqSchema,
  OrgScopedErrorSchema,
  TxHashResponseSchema,
} from "@/lib/openapi/schemas-v7";
import { v7CorsHeaders, v7Registry } from "@/lib/openapi/registry";

// ── OpenAPI registration ────────────────────────────────────────────────
v7Registry.registerPath({
  method: "post",
  path: "/api/v7/org/subdomain/repoint",
  tags: ["org-tier"],
  summary: "Repoint an existing subdomain leaf to a new user pubkey + account",
  description:
    "Org admin signs a `repointSubdomain` digest off-chain; the relayer " +
    "submits the tx and pays gas. The subdomain-leaf scope check is on-chain " +
    "via `parent.adminPubkey`; the API key still proves the caller is the " +
    "right org. The contract additionally validates the admin's P-256 " +
    "signature against the parent root's stored adminPubkeyHash.",
  security: [{ orgApiKey: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: OrgRepointSubdomainReqSchema } },
    },
  },
  responses: {
    200: {
      description: "Submitted; returns the tx hash on the destination chain.",
      content: { "application/json": { schema: TxHashResponseSchema } },
    },
    400: {
      description: "Body failed zod validation.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
    401: {
      description: "Missing / malformed / revoked / wrong-secret API key.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
    503: {
      description: "Relayer disabled or auth backend unavailable.",
      content: { "application/json": { schema: OrgScopedErrorSchema } },
    },
  },
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  if (!isEnabled())
    return NextResponse.json(
      { error: "relayer-disabled", code: "relayer_disabled" },
      { status: 503, headers: v7CorsHeaders },
    );

  const authResult = await requireOrgAuth(req, v7CorsHeaders);
  if (authResult instanceof NextResponse) return authResult;
  const { finalize } = authResult;

  try {
    const rawBody = await req.json();
    const parsed = OrgRepointSubdomainReqSchema.safeParse(rawBody);
    if (!parsed.success) {
      const err = {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        code: "validation_failed" as const,
      };
      await finalize(400);
      return NextResponse.json(err, { status: 400, headers: v7CorsHeaders });
    }
    const { chainId, claim } = parsed.data;

    // SCOPE NOTE: the leaf's parent must equal the API key's
    // subdomainRootHash, but the request only carries leafNameHash —
    // we don't know the parent without an RPC call. We accept and rely
    // on the on-chain check (`parent.pubkeyHash == adminPubkeyHash`).
    // The API key still proves the caller is the right org.

    const { txHash } = await submitOrgRepointSubdomain(
      chainId,
      claim as unknown as OrgRepointSubdomainReq,
    );

    await finalize(200);
    return NextResponse.json({ txHash }, { headers: v7CorsHeaders });
  } catch (e: any) {
    await finalize(500);
    return NextResponse.json(
      { error: e.message ?? "submit failed", code: "submit_failed" },
      { status: 500, headers: v7CorsHeaders },
    );
  }
}
