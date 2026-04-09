import { NextRequest, NextResponse } from "next/server";
import { relayPrivateBridge, loadConfigFromEnv, type PrivateBridgeRequest } from "@/lib/relayer/relayer";

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
    const body = (await req.json()) as PrivateBridgeRequest;
    const { lockId, amount, srcChainId, destChainId, recipient, encryptedAmount } = body;

    if (!lockId || !amount || !srcChainId || !destChainId || !recipient || !encryptedAmount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!encryptedAmount.ctHash || !encryptedAmount.signature) {
      return NextResponse.json(
        { success: false, error: "Invalid encryptedAmount — needs ctHash and signature" },
        { status: 400, headers: corsHeaders },
      );
    }

    const config = loadConfigFromEnv();
    const result = await relayPrivateBridge(body, config);
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
