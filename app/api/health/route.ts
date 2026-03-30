import { NextResponse } from "next/server";
import { loadConfigFromEnv } from "@/lib/relayer/relayer";
import { privateKeyToAccount } from "viem/accounts";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  try {
    const config = loadConfigFromEnv();
    const account = privateKeyToAccount(config.relayerPrivateKey);

    return NextResponse.json({
      status: "ok",
      relayer: account.address,
      entryPoint: config.entryPointAddress,
      chains: config.allowedChains,
    }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: corsHeaders });
  }
}
