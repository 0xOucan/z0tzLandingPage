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
  try {
    return await handle(req);
  } catch (err: any) {
    // Surface the error to clients instead of swallowing it as a generic
    // 500. The GUI's indexer-client logs the status code only — without
    // the body we can't tell input-validation failures from real bugs.
    console.error("[/api/history] error:", err);
    return NextResponse.json(
      {
        error: "Internal error",
        detail: String(err?.message ?? err).slice(0, 500),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handle(req: NextRequest) {
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
    if (ownerXNorm !== null && ownerYNorm !== null) {
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

  // ─── 6. USDC.Transfer touching our address set (followup-scanner data) ─
  // We pull where from ∈ our addrs (outgoing — cashout counterparty,
  // smart-account spends) OR to ∈ our addrs (incoming — top-ups, mints).
  // The followup scanner only indexes "from" today, but the schema
  // accommodates both so future ingestion expansion works without
  // touching this query.
  let usdcTransfers: any[] = [];
  const allAddrs = Array.from(new Set([...stealths, ...smartAccounts]));
  if (allAddrs.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const aPh = allAddrs.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM usdc_transfers
            WHERE chain_id IN (${chainPh})
              AND (from_address IN (${aPh}) OR to_address IN (${aPh}))
            ORDER BY block_number DESC`,
      args: [...chainIds, ...allAddrs, ...allAddrs],
    });
    usdcTransfers = res.rows.map(rowToObj);
  }

  // ─── 7. CCTP burns where depositor ∈ our address set ────────────────
  // Returns mint_recipient too so the GUI can stitch dst-chain mint by
  // looking up the recipient in another chain's usdc_transfers.
  let cctpBurns: any[] = [];
  if (allAddrs.length > 0) {
    const chainPh = chainIds.map(() => "?").join(",");
    const aPh = allAddrs.map(() => "?").join(",");
    const res = await client().execute({
      sql: `SELECT * FROM cctp_burns
            WHERE chain_id IN (${chainPh}) AND depositor IN (${aPh})
            ORDER BY block_number DESC`,
      args: [...chainIds, ...allAddrs],
    });
    cctpBurns = res.rows.map(rowToObj);
  }

  // ─── 8. Second-pass usdc_transfers for bridge mint_recipients ──────
  // Every CCTP burn in step 7 names a dst-chain mint_recipient that
  // received the bridged USDC. That recipient address isn't typically in
  // the passkey-derived set (it's chosen at bridge time, encoded only on
  // chain). To surface the dst-side receipt + any follow-on transfer,
  // we extract recipients from cctpBurns, then run a second query on
  // usdc_transfers across ALL chains touching those addresses. Returned
  // alongside the primary usdcTransfers so the GUI can stitch by tx hash.
  let dstSideTransfers: any[] = [];
  if (cctpBurns.length > 0) {
    const recipients = Array.from(
      new Set(
        cctpBurns
          .map((b) => {
            // mint_recipient is stored as 32-byte hex from the event;
            // address lives in the low 20 bytes.
            const r = (b.mint_recipient as string) ?? "";
            return r.length >= 42 ? "0x" + r.slice(-40).toLowerCase() : null;
          })
          .filter((r): r is string => !!r)
      )
    );
    if (recipients.length > 0) {
      const chainPh = chainIds.map(() => "?").join(",");
      const rPh = recipients.map(() => "?").join(",");
      const res = await client().execute({
        sql: `SELECT * FROM usdc_transfers
              WHERE chain_id IN (${chainPh})
                AND (from_address IN (${rPh}) OR to_address IN (${rPh}))
              ORDER BY block_number DESC`,
        args: [...chainIds, ...recipients, ...recipients],
      });
      dstSideTransfers = res.rows.map(rowToObj);
    }
  }

  // Merge dst-side rows into the primary usdcTransfers array, dedup by
  // (chain_id, tx_hash, log_index). The classifier on the GUI side
  // doesn't care whether a row came from the passkey-set query or the
  // bridge-recipient query — it just wants all the data.
  const seen = new Set(
    usdcTransfers.map((t) => `${t.chain_id}:${t.tx_hash}:${t.log_index}`)
  );
  for (const t of dstSideTransfers) {
    const k = `${t.chain_id}:${t.tx_hash}:${t.log_index}`;
    if (!seen.has(k)) {
      usdcTransfers.push(t);
      seen.add(k);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      smartAccounts: smartAccountRows,
      entrypointOps,
      sweeps,
      ledgerEvents,
      vaultTransfers,
      usdcTransfers,
      cctpBurns,
    },
    { headers: corsHeaders }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a numeric input (hex or decimal string, or 0x-prefixed) to the
 * decimal string format we store in smart_accounts. We always store uint256
 * as decimal strings to keep the DB representation canonical.
 *
 * Accepts: string (hex or decimal). Anything else (Uint8Array serialized
 * to an object-with-numeric-keys, number, undefined, etc) returns null
 * instead of crashing — caller decides how to treat null (treat as
 * missing input, not as an error).
 */
function normalizeBig(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  try {
    return BigInt(s).toString();
  } catch {
    return null;
  }
}

/** Convert a libsql Row to a plain JSON-able object. */
function rowToObj(row: any): Record<string, any> {
  const o: Record<string, any> = {};
  for (const k of Object.keys(row)) o[k] = row[k];
  return o;
}
