import { NextRequest, NextResponse } from "next/server";
import { watchStealth } from "@/lib/indexer/turso-v7";

/**
 * Register a deterministic stealth address for inbound scanning. The client
 * derives the address from its passkey and sends the PUBLIC address + its
 * pubkeyHash + index — no key material. The indexer then scans every chain
 * for ERC-20 transfers to it.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { pubkeyHash, address, index } = await req.json();
    if (!pubkeyHash || !address) return NextResponse.json({ error: "missing pubkeyHash or address" }, { status: 400, headers: corsHeaders });
    await watchStealth(pubkeyHash, address, Number(index ?? 0));
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "watch failed" }, { status: 500, headers: corsHeaders });
  }
}
