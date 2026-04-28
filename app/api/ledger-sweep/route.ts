import { NextRequest, NextResponse } from "next/server";
import { verifyRelayerAuth } from "@/lib/relayer/auth";
import { isLedgerEnabled, submitSweepToLedger } from "@/lib/relayer/ledger";
import { geofenceResponse } from "@/lib/relayer/geofence";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, corsHeaders);
  if (blocked) return blocked;

  if (!isLedgerEnabled()) {
    return NextResponse.json({ error: "ledger-disabled" }, { status: 503, headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const { chainId, call } = body;
    if (!chainId || !call) {
      return NextResponse.json({ error: "missing chainId or call" }, { status: 400, headers: corsHeaders });
    }
    const hdrs: Record<string, string | undefined> = {
      "x-z0tz-pubx": req.headers.get("x-z0tz-pubx") ?? undefined,
      "x-z0tz-puby": req.headers.get("x-z0tz-puby") ?? undefined,
      "x-z0tz-sig": req.headers.get("x-z0tz-sig") ?? undefined,
    };
    const auth = verifyRelayerAuth(hdrs, body, false);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error ?? "unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const { txHash } = await submitSweepToLedger(chainId, call);
    return NextResponse.json({ txHash }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "submit failed" }, { status: 500, headers: corsHeaders });
  }
}
