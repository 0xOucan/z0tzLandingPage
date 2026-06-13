import { NextRequest, NextResponse } from "next/server";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitNameClaim, type NameClaimReq } from "@/lib/relayer/v7";
import { v7CorsHeaders } from "@/lib/openapi/registry";

// V7-final patch list item #7: names cross-chain auto-replication.
//
// The deployed nameRegistry binds chainid into the claim digest, so a
// single signature is only valid on one chain. Cross-chain consistency
// (V6.5 first-writer-wins everywhere) needs N signatures from the user
// — this route takes them as a batch and submits each to its chain in
// parallel.
//
// Failure model: best-effort, per-chain status. We do NOT roll back a
// successful chain when another conflicts (NameTaken on chain B after
// chain A succeeded is a real possibility; the contract has no
// rollback primitive). The CLI reports the partial state to the user
// and can either accept it or manually mitigate (claim the missing
// chains later, repoint successful ones, etc.).
//
// Atomicity guarantee we DO give: each chain's claim is independently
// signed by the user's passkey, so a relayer can't redirect or alter
// any single chain's resolution. The relayer is purely a fan-out.

const MAX_CLAIMS = 8; // hard cap so a malformed request can't fan out forever

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: v7CorsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, v7CorsHeaders);
  if (blocked) return blocked;
  if (!isEnabled()) {
    return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: v7CorsHeaders });
  }
  try {
    const body = await req.json();
    if (!body || !Array.isArray(body.claims)) {
      return NextResponse.json(
        { error: "expected { claims: [{ chainId, claim }, ...] }" },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    const claims = body.claims as Array<{ chainId: number; claim: any }>;
    if (claims.length === 0 || claims.length > MAX_CLAIMS) {
      return NextResponse.json(
        { error: `claims.length must be in [1, ${MAX_CLAIMS}]` },
        { status: 400, headers: v7CorsHeaders },
      );
    }
    // Dedupe chainIds — same chain twice is always wrong and would race.
    const seen = new Set<number>();
    for (const c of claims) {
      if (!c || typeof c.chainId !== "number" || !c.claim) {
        return NextResponse.json({ error: "each claim needs { chainId, claim }" }, { status: 400, headers: v7CorsHeaders });
      }
      if (seen.has(c.chainId)) {
        return NextResponse.json({ error: `chainId ${c.chainId} appears more than once` }, { status: 400, headers: v7CorsHeaders });
      }
      seen.add(c.chainId);
    }

    // Submit in parallel — each chain is independent and the relayer
    // doesn't care which lands first.
    const results = await Promise.all(
      claims.map(async ({ chainId, claim }) => {
        try {
          const { txHash } = await submitNameClaim(chainId, claim as unknown as NameClaimReq);
          return { chainId, status: "ok" as const, txHash };
        } catch (e: any) {
          return { chainId, status: "error" as const, error: String(e?.message ?? e) };
        }
      }),
    );

    const okCount = results.filter((r) => r.status === "ok").length;
    const httpStatus = okCount === 0 ? 500 : 200; // any success → 200 with per-chain status
    return NextResponse.json(
      { totalClaims: claims.length, succeeded: okCount, results },
      { status: httpStatus, headers: v7CorsHeaders },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "replicate failed" }, { status: 500, headers: v7CorsHeaders });
  }
}
