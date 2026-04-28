import { NextRequest, NextResponse } from "next/server";
import { relayBridge, loadConfigFromEnv, type BridgeRequest } from "@/lib/relayer/relayer";
import { geofenceResponse } from "@/lib/relayer/geofence";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, corsHeaders);
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as BridgeRequest;
    const { lockId, sender, amount, srcChainId, destChainId, destRecipient } = body;

    if (!lockId || !sender || !amount || !srcChainId || !destChainId || !destRecipient) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: lockId, sender, amount, srcChainId, destChainId, destRecipient" },
        { status: 400, headers: corsHeaders }
      );
    }

    const config = loadConfigFromEnv();
    const result = await relayBridge(body, config);
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
