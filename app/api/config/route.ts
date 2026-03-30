import { NextResponse } from "next/server";
import { loadConfigFromEnv } from "@/lib/relayer/relayer";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  try {
    const config = loadConfigFromEnv();

    return NextResponse.json({
      entryPoint: config.entryPointAddress,
      chains: config.allowedChains,
      paymasterAddresses: config.paymasterAddresses,
      factoryAddresses: config.factoryAddresses,
      bridgeAddresses: config.bridgeAddresses,
    }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Relayer misconfigured" }, { status: 500, headers: corsHeaders });
  }
}
