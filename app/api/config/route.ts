import { NextResponse } from "next/server";
import { loadConfigFromEnv } from "@/lib/relayer/relayer";
import { isLedgerEnabled } from "@/lib/relayer/ledger";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  try {
    const config = loadConfigFromEnv();
    const chains = config.allowedChains;

    // V6.5 ledger addresses (if USE_LEDGER=1)
    const ledgerAddresses: Record<number, Record<string, string>> = {};
    if (isLedgerEnabled()) {
      for (const c of chains) {
        ledgerAddresses[c] = {
          ledger: process.env[`LEDGER_ADDRESS_${c}`] ?? "",
          vault: process.env[`VAULT_ADDRESS_${c}`] ?? "",
          sweeperV65: process.env[`SWEEPER_V65_ADDRESS_${c}`] ?? "",
        };
      }
    }

    return NextResponse.json({
      entryPoint: config.entryPointAddress,
      chains,
      useLedger: isLedgerEnabled(),
      paymasterAddresses: config.paymasterAddresses,
      factoryAddresses: config.factoryAddresses,
      bridgeAddresses: config.bridgeAddresses,
      ledgerAddresses,
    }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Relayer misconfigured" }, { status: 500, headers: corsHeaders });
  }
}
