import { NextRequest, NextResponse } from "next/server";
import { client, ensureSchema, isEnabled } from "@/lib/indexer/turso";
import { SUPPORTED_CHAINS, type ChainId } from "@/lib/indexer/contracts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * POST /api/history
 *
 * Request body:
 *   {
 *     ownerX?: string,         // hex/decimal of passkey public X (smart account lookup)
 *     ownerY?: string,         // hex/decimal of passkey public Y
 *     ledgerIds?: string[],    // bytes32 hex — passkey-derived ledger IDs
 *     stealths?: string[],     // addresses — passkey-derived cashin/defi stealths
 *     smartAccounts?: string[],// addresses — passkey-derived smart accounts (overrides ownerX/Y lookup)
 *     chainIds?: number[]      // default: all supported
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     smartAccounts: SmartAccountRow[],          // matched from (ownerX, ownerY)
 *     entrypointOps: EntryPointOpRow[],          // userOps where sender ∈ ourSmartAccounts
 *     sweeps: SweepRow[],                         // sweeps where stealth ∈ ourStealths
 *     ledgerEvents: LedgerEventRow[],             // ledger ops where ledgerId ∈ ourLedgerIds
 *     vaultTransfers: VaultTransferRow[]          // transferred-out where to ∈ ourStealths ∪ ourSmartAccounts
 *   }
 *
 * The GUI is responsible for stitching these raw event rows into the final
 * HistoryRecord objects (cashin / cashout / bridge / defi-deposit / etc).
 *
 * Open endpoint — data is public on chain anyway. Production should add a
 * shared-secret header or passkey signature challenge.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json(
      { error: "Indexer DB not configured" },
      { status: 500, headers: corsHeaders }
    );
  }
  await ensureSchema();

  let body: {
    ownerX?: string;
    ownerY?: string;
    ledgerIds?: string[];
    stealths?: string[];
    smartAccounts?: string[];
    chainIds?: number[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  const chainIds = (body.chainIds ?? SUPPORTED_CHAINS).filter((c) =>
    SUPPORTED_CHAINS.includes(c as ChainId)
  );
  if (chainIds.length === 0) {
    return NextResponse.json(
      { error: "No supported chainIds in request" },
      { status: 400, headers: corsHeaders }
    );
  }

  const ledgerIds = (body.ledgerIds ?? []).map((id) => id.toLowerCase());
  const stealths = (body.stealths ?? []).map((a) => a.toLowerCase());
  let smartAccounts = (body.smartAccounts ?? []).map((a) => a.toLowerCase());

  // ─── 1. (ownerX, ownerY) → smart account lookup ─────────────────────
  // If caller provided ownerX + ownerY, fetch all matching smart accounts
  // across requested chains. These are merged into the smartAccounts set.
  let smartAccountRows: any[] = [];
  if (body.ownerX && body.ownerY) {
    const ownerXNorm = normalizeBig(body.ownerX);
    const ownerYNorm = normalizeBig(body.ownerY);
    const placeholders = chainIds.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT chain_id, account_address, owner_x, owner_y, block_number, block_timestamp, tx_hash
            FROM smart_accounts
            WHERE owner_x = ? AND owner_y = ?
              AND chain_id IN (${placeholders})`,
      args: [ownerXNorm, ownerYNorm, ...chainIds],
    });
    smartAccountRows = res.rows.map(rowToObj);
    for (const r of smartAccountRows) {
      const addr = (r.account_address as string).toLowerCase();
      if (!smartAccounts.includes(addr)) smartAccounts.push(addr);
    }
  }

  // ─── 2. EntryPoint UserOps where sender ∈ ourSmartAccounts ─────────
  let entrypointOps: any[] = [];
  if (smartAccounts.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const saPh = smartAccounts.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM entrypoint_userops
            WHERE chain_id IN (${chainPh}) AND sender IN (${saPh})
            ORDER BY block_number DESC`,
      args: [...chainIds, ...smartAccounts],
    });
    entrypointOps = res.rows.map(rowToObj);
  }

  // ─── 3. Sweeps where stealth ∈ ourStealths ──────────────────────────
  let sweeps: any[] = [];
  if (stealths.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const stPh = stealths.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM sweep_events
            WHERE chain_id IN (${chainPh}) AND stealth_address IN (${stPh})
            ORDER BY block_number DESC`,
      args: [...chainIds, ...stealths],
    });
    sweeps = res.rows.map(rowToObj);
  }

  // ─── 4. Ledger events for our ledgerIds (matches either old OR new id)
  let ledgerEvents: any[] = [];
  if (ledgerIds.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const idPh = ledgerIds.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM ledger_events
            WHERE chain_id IN (${chainPh})
              AND (ledger_id IN (${idPh}) OR new_ledger_id IN (${idPh}))
            ORDER BY block_number DESC`,
      args: [...chainIds, ...ledgerIds, ...ledgerIds],
    });
    ledgerEvents = res.rows.map(rowToObj);
  }

  // ─── 5. Vault.TransferredOut where to ∈ stealths ∪ smartAccounts ────
  let vaultTransfers: any[] = [];
  const recipients = Array.from(new Set([...stealths, ...smartAccounts]));
  if (recipients.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const rPh = recipients.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM vault_transferred_out
            WHERE chain_id IN (${chainPh}) AND to_address IN (${rPh})
            ORDER BY block_number DESC`,
      args: [...chainIds, ...recipients],
    });
    vaultTransfers = res.rows.map(rowToObj);
  }

  return NextResponse.json(
    {
      ok: true,
      smartAccounts: smartAccountRows,
      entrypointOps,
      sweeps,
      ledgerEvents,
      vaultTransfers,
    },
    { headers: corsHeaders }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a numeric input (hex or decimal string, or 0x-prefixed) to the
 * decimal string format we store in smart_accounts. We always store uint256
 * as decimal strings to keep the DB representation canonical.
 */
function normalizeBig(input: string): string {
  const s = input.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return BigInt(s).toString();
  }
  return BigInt(s).toString();
}

/** Convert a libsql Row to a plain JSON-able object. */
function rowToObj(row: any): Record<string, any> {
  const o: Record<string, any> = {};
  for (const k of Object.keys(row)) o[k] = row[k];
  return o;
}
