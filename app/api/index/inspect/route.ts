import { NextRequest, NextResponse } from "next/server";
import { client, ensureSchema, isEnabled as tursoEnabled } from "@/lib/indexer/turso";

/**
 * GET /api/index/inspect?table=usdc_transfers&chainId=421614&address=0xabc&limit=50
 *
 * Read-only diagnostic. Returns raw rows from an indexer table filtered
 * by chain + optional address (matches any column that's typically
 * stored as an address). Intended for debugging the GUI's
 * history-reconstruction against the indexer DB.
 *
 * No auth — same posture as the rest of the indexer endpoints, which
 * only return data that's already public on chain.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED_TABLES = new Set([
  "smart_accounts",
  "entrypoint_userops",
  "sweep_events",
  "ledger_events",
  "vault_transferred_out",
  "usdc_transfers",
  "cctp_burns",
]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  if (!tursoEnabled()) {
    return NextResponse.json({ error: "Turso not configured" }, { status: 500, headers: corsHeaders });
  }
  await ensureSchema();
  const sp = req.nextUrl.searchParams;
  const table = sp.get("table") ?? "";
  const chainId = Number(sp.get("chainId") ?? "0");
  const address = (sp.get("address") ?? "").toLowerCase();
  const limit = Math.min(200, Number(sp.get("limit") ?? "50"));
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json(
      { error: `unknown table; allowed=${[...ALLOWED_TABLES].join(",")}` },
      { status: 400, headers: corsHeaders }
    );
  }
  // Column to filter on per table. If `address` is given, we restrict by
  // the table's primary address-like column. For tables with multiple
  // address columns (usdc_transfers from/to, cctp_burns depositor/mint_recipient)
  // we OR them together.
  let where = "1=1";
  const args: any[] = [];
  if (chainId > 0) {
    where += " AND chain_id = ?";
    args.push(chainId);
  }
  if (address) {
    switch (table) {
      case "smart_accounts":
        where += " AND account_address = ?";
        args.push(address);
        break;
      case "entrypoint_userops":
        where += " AND (sender = ? OR paymaster = ?)";
        args.push(address, address);
        break;
      case "sweep_events":
        where += " AND (stealth_address = ? OR wrapped_token_or_vault = ?)";
        args.push(address, address);
        break;
      case "ledger_events":
        where += " AND (ledger_id = ? OR new_ledger_id = ? OR viewer = ?)";
        args.push(address, address, address);
        break;
      case "vault_transferred_out":
        where += " AND to_address = ?";
        args.push(address);
        break;
      case "usdc_transfers":
        where += " AND (from_address = ? OR to_address = ?)";
        args.push(address, address);
        break;
      case "cctp_burns":
        // mint_recipient is bytes32 (low 20 bytes = address); the SQL
        // substr trick mirrors what getStealthWatchlist uses.
        where += " AND (depositor = ? OR lower(substr(mint_recipient, -40)) = ?)";
        args.push(address, address.replace(/^0x/, ""));
        break;
    }
  }
  const res = await client().execute({
    sql: `SELECT * FROM ${table} WHERE ${where} ORDER BY block_number DESC LIMIT ?`,
    args: [...args, limit],
  });
  return NextResponse.json(
    {
      ok: true,
      table,
      chainId,
      address: address || null,
      count: res.rows.length,
      rows: res.rows.map((r: any) => {
        const o: Record<string, any> = {};
        for (const k of Object.keys(r)) o[k] = r[k];
        return o;
      }),
    },
    { headers: corsHeaders }
  );
}
