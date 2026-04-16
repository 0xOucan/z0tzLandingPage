import { NextRequest, NextResponse } from "next/server";
import { verifyRelayerAuth } from "@/lib/relayer/auth";
import { isLedgerEnabled, submitSpend, type SerializedSpendOp } from "@/lib/relayer/ledger";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  if (!isLedgerEnabled()) {
    return NextResponse.json({ error: "ledger-disabled", hint: "USE_LEDGER=0 — use V6 paths" }, { status: 503, headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const { chainId, op } = body as { chainId: number; op: SerializedSpendOp };
    if (!chainId || !op) {
      return NextResponse.json({ error: "missing chainId or op" }, { status: 400, headers: corsHeaders });
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
    const { txHash } = await submitSpend(chainId, op);
    return NextResponse.json({ txHash }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "submit failed" }, { status: 500, headers: corsHeaders });
  }
}
