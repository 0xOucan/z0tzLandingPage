import { NextRequest, NextResponse } from "next/server";
import { relayUserOp, loadConfigFromEnv, type UserOperation } from "@/lib/relayer/relayer";

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_OPS_PER_MINUTE = Number(process.env.MAX_OPS_PER_MINUTE ?? 60);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_OPS_PER_MINUTE) return false;
  entry.count++;
  return true;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: corsHeaders });
  }

  try {
    const { userOp, chainId } = (await req.json()) as { userOp: UserOperation; chainId: number };

    if (!userOp || !chainId) {
      return NextResponse.json({ success: false, error: "Missing userOp or chainId" }, { status: 400, headers: corsHeaders });
    }

    const config = loadConfigFromEnv();
    const result = await relayUserOp(userOp, chainId, config);
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers: corsHeaders });
  }
}
