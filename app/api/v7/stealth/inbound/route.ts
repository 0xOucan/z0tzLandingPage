import { NextRequest, NextResponse } from "next/server";
import { getInboundForPubkey } from "@/lib/indexer/turso-v7";

/**
 * List inbound funds across all chains for a user's watched stealth addresses.
 * The GUI re-derives its pubkeyHash from the passkey and reads this to show
 * "you received X on chain Y" + a one-tap sweep. Public data only.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const pubkeyHash = new URL(req.url).searchParams.get("pubkeyHash");
    if (!pubkeyHash) return NextResponse.json({ error: "missing pubkeyHash" }, { status: 400, headers: corsHeaders });
    const inbound = await getInboundForPubkey(pubkeyHash);
    return NextResponse.json({ inbound }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "fetch failed" }, { status: 500, headers: corsHeaders });
  }
}
