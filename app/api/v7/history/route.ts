/**
 * GET /api/v7/history?account=0x..[&chainId=]
 *
 * Reconstructs a unified, chronological activity timeline for an account by
 * reading the SAME typed V7 event tables the after()-mirror + scan indexer
 * write (DB-as-source-of-truth). The account is derived from the user's
 * passkey pub X/Y, so the GUI/APK rebuild history keyed by the passkey —
 * matching exactly what we persist. RPC/etherscan are cross-checks, not the
 * source. Mirrors V6.5's /api/history shape.
 */
import { NextRequest, NextResponse } from "next/server";
import { client } from "@/lib/indexer/turso-v7";
import { v7CorsHeaders } from "@/lib/openapi/registry";
import { withApiLog } from "@/lib/relayer/request-log";

const LEDGER_ACTION = ["internal", "cashout", "xchain-internal", "xchain-cashout"];

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: v7CorsHeaders }); }

export const GET = withApiLog("/api/v7/history", async (req: NextRequest, ctx) => {
  const url = new URL(req.url);
  const account = (url.searchParams.get("account") ?? "").toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) {
    ctx.errorCode = "validation_failed";
    return NextResponse.json({ error: "account must be a 0x-20-byte address" }, { status: 400, headers: v7CorsHeaders });
  }
  const chainFilter = url.searchParams.get("chainId");
  const cid = chainFilter ? Number(chainFilter) : null;
  const c = client();
  const where = (col: string) => cid ? { sql: `WHERE ${col} = ? AND chain_id = ?`, args: [account, cid] } : { sql: `WHERE ${col} = ?`, args: [account] };

  const q = async (table: string, col: string, map: (r: any) => any) => {
    const w = where(col);
    try { const r = await c.execute({ sql: `SELECT * FROM ${table} ${w.sql} ORDER BY ts DESC LIMIT 200`, args: w.args }); return r.rows.map(map); }
    catch { return []; }
  };

  const [credits, sweeps, spends, tez, airdrops] = await Promise.all([
    q("credit_events_v7", "account", (r) => ({ kind: "cash-in", chainId: r.chain_id, token: r.token, amount: r.net_amount, txHash: r.tx_hash, block: r.block, ts: r.ts })),
    q("sweeper_events_v7", "account", (r) => ({ kind: "sweep", chainId: r.chain_id, token: r.token, amount: r.amount, fee: r.fee, txHash: r.tx_hash, block: r.block, ts: r.ts })),
    q("ledger_events_v7", "account", (r) => ({ kind: "spend", action: LEDGER_ACTION[r.action] ?? r.action, chainId: r.chain_id, token: r.token, destChain: r.dest_chain, txHash: r.tx_hash, block: r.block, ts: r.ts })),
    q("tezcatli_events_v7", "account", (r) => ({ kind: `tezcatli-${r.kind}`, chainId: r.chain_id, token: r.token, shares: r.shares, assets: r.assets, txHash: r.tx_hash, block: r.block, ts: r.ts })),
    q("airdrop_claims_v7", "account", (r) => ({ kind: "airdrop", chainId: r.chain_id, amount: r.amount, txHash: r.tx_hash, block: r.block, ts: r.ts })),
  ]);

  const timeline = [...credits, ...sweeps, ...spends, ...tez, ...airdrops]
    .filter((x) => x.ts != null)
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .slice(0, 300);

  return NextResponse.json({ account, chainId: cid, count: timeline.length, timeline }, { headers: v7CorsHeaders });
});
