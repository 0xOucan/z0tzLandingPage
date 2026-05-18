import { NextRequest, NextResponse } from "next/server";
import { client, ensureSchema, isEnabled as tursoEnabled } from "@/lib/indexer/turso";
import { SUPPORTED_CHAINS } from "@/lib/indexer/contracts";

/**
 * GET /api/index/status
 *
 * Returns per-chain row counts for every indexer table + scan_state cursors,
 * so we can verify the DB is healthy without touching Turso directly.
 *
 * Open endpoint — same posture as /api/history. Production should gate this
 * with a shared-secret header.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const maxDuration = 30;

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(_req: NextRequest) {
  if (!tursoEnabled()) {
    return NextResponse.json(
      { error: "Turso not configured" },
      { status: 500, headers: corsHeaders }
    );
  }
  await ensureSchema();
  const c = client();

  // Every event table we care about. Aggregated per chain so we can see at a
  // glance whether each chain is being indexed.
  const tables = [
    "smart_accounts",
    "entrypoint_userops",
    "sweep_events",
    "ledger_events",
    "vault_transferred_out",
    "usdc_transfers",
    "cctp_burns",
  ];

  const counts: Record<string, Record<number, number>> = {};
  for (const t of tables) {
    counts[t] = {};
    const res = await c.execute({
      sql: `SELECT chain_id, COUNT(*) AS n FROM ${t} GROUP BY chain_id`,
    });
    for (const row of res.rows) {
      counts[t][Number(row.chain_id)] = Number(row.n);
    }
  }

  // Scan-state snapshot per chain × event-type so we can see where each
  // source is parked. Useful for spotting cursors that never advanced
  // (typical "truncated:true on every trigger" symptom of a wrong contract
  // address or a permanently-failing Etherscan call).
  const scanState = await c.execute({
    sql: `SELECT chain_id, contract_address, event_type, last_block_scanned, last_scanned_at
          FROM scan_state ORDER BY chain_id, event_type`,
  });
  const followupState = await c.execute({
    sql: `SELECT chain_id, event_type, COUNT(*) AS watched_count, MAX(last_scanned_at) AS most_recent_scan
          FROM stealth_followup_state GROUP BY chain_id, event_type`,
  });

  return NextResponse.json(
    {
      ok: true,
      supportedChains: SUPPORTED_CHAINS,
      counts,
      scanState: scanState.rows.map((r: any) => ({
        chain_id: Number(r.chain_id),
        contract_address: String(r.contract_address),
        event_type: String(r.event_type),
        last_block_scanned: Number(r.last_block_scanned),
        last_scanned_at: Number(r.last_scanned_at),
      })),
      followupState: followupState.rows.map((r: any) => ({
        chain_id: Number(r.chain_id),
        event_type: String(r.event_type),
        watched_count: Number(r.watched_count),
        most_recent_scan: Number(r.most_recent_scan),
      })),
    },
    { headers: corsHeaders }
  );
}
