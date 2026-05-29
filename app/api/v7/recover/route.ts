import { NextRequest, NextResponse } from "next/server";
import { verifyRelayerAuth } from "@/lib/relayer/auth";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { isEnabled, submitRecoverInitiate, submitRecoverExecute } from "@/lib/relayer/v7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// Permissionless recovery: the proof is the authorization (the relayer just
// pays gas). `action` selects initiate or execute.
export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, corsHeaders);
  if (blocked) return blocked;
  if (!isEnabled()) return NextResponse.json({ error: "relayer-disabled" }, { status: 503, headers: corsHeaders });
  try {
    const body = await req.json();
    const { chainId, action } = body as { chainId: number; action: "initiate" | "execute" };
    if (!chainId || !action) return NextResponse.json({ error: "missing chainId or action" }, { status: 400, headers: corsHeaders });
    if (action === "initiate") {
      const { account, methodIndex, newOwnerX, newOwnerY, proof } = body;
      const { txHash } = await submitRecoverInitiate(chainId, { account, methodIndex, newOwnerX, newOwnerY, proof });
      return NextResponse.json({ txHash }, { headers: corsHeaders });
    }
    if (action === "execute") {
      const { txHash } = await submitRecoverExecute(chainId, { recoveryId: body.recoveryId });
      return NextResponse.json({ txHash }, { headers: corsHeaders });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400, headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "submit failed" }, { status: 500, headers: corsHeaders });
  }
}
