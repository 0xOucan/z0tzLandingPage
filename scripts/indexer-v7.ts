/**
 * V7-FINAL on-chain event indexer — tick driver.
 *
 * ## What
 * One tick = one pass across every enabled V7 chain. For each chain we:
 *   1. Resolve the deployment from `DEPLOYMENT_V7_<chainId>`.
 *   2. Read the per-(chain, contract, event) cursor from `scan_state_v7`.
 *   3. Fetch new logs via the shared Etherscan/RPC fetcher
 *      (`getLogsPaginated`, with a configurable page window).
 *   4. Decode + INSERT OR IGNORE into the typed event tables:
 *        - `credit_events_v7`         (Z0tzLedgerV7.CreditedFromVault)
 *        - `ledger_events_v7`         (Z0tzLedgerV7.Spent + MultisendRowSkipped*)
 *        - `sweeper_events_v7`        (Z0tzPrivateSweeperV7.PrivateSweep w/ feeSettled)
 *        - `airdrop_claims_v7`        (AirdropClaim.Claimed)
 *        - `name_records_v7`          (Z0tzNameRegistry.NameClaimed / SubdomainClaimed)
 *        - `recovery_events_v7`       (RecoveryHub.* Method/Recovery events)
 *        - `tezcatli_events_v7`       (TezcatliVaultV7.Deposited/Withdrawn/Strategy*)
 *        - `audit_alerts_v7`          (post-audit structured alerts)
 *        - `stealth_inbound_v7`       (ERC-20 Transfer TO each watched stealth)
 *   5. Advance `scan_state_v7.last_block_scanned` per source.
 *
 * The heavy lifting lives in `lib/indexer/indexer-v7.ts` (decoder registry +
 * per-source insert handlers). This file is the orchestrator: pick chains,
 * budget time, run per-chain in parallel, summarize.
 *
 * ## Required env
 *   - TURSO_V7_DATABASE_URL + TURSO_V7_AUTH_TOKEN   (Turso target)
 *   - RPC_URL_<chainId>                              (per chain, viem transport)
 *   - DEPLOYMENT_V7_<chainId>                        (JSON deployment blob)
 *
 * ## Optional env
 *   - INDEXER_V7_CHAIN_IDS                           comma list; default 421614,84532,11155111
 *   - BACKFILL_FROM_BLOCK_<chainId>                  one-shot historical floor (used only when scan_state is empty)
 *   - DEPLOY_BLOCK_V7_<chainId>                      fallback floor (defaults to 0); honored only on first run
 *   - INDEXER_V7_MAX_MS                              soft time budget per chain (ms); default 50000
 *
 * ## How to run
 *   pnpm tsx scripts/indexer-v7.ts
 *
 * ## Back-fill
 *   BACKFILL_FROM_BLOCK_84532=12345678 pnpm tsx scripts/indexer-v7.ts
 *   Each chain only consults BACKFILL_FROM_BLOCK_<id> when its scan_state is
 *   empty for that source. Subsequent runs resume from the cursor.
 *
 * ## Scheduling
 *   - Vercel Cron is the simplest fit (see vercel.json). Vercel's minimum
 *     interval on Hobby is 1/min — acceptable for our latency target since
 *     every `submitX` already mirrors its own tx synchronously (see
 *     `mirrorTxLogsToV7` in lib/relayer/v7.ts). The cron exists only to
 *     catch (a) historical backfill, (b) events on contracts we don't
 *     directly submit (e.g. third-party Tezcatli deposits), and
 *     (c) stealth-inbound transfers that no relayer tx ever produced.
 *   - External cron / VPS works too: just `scripts/indexer-tick.sh` from
 *     a systemd timer or `* * * * *` crontab.
 *
 * ## Idempotency
 *   Every typed table uses `(chain_id, tx_hash, log_index)` as its PK and
 *   the indexer writes via `INSERT OR IGNORE`. Re-scanning the same block
 *   range is a no-op. A bad log in one source can't halt the indexer:
 *   each source's `handle` is wrapped in the per-log try/catch inside
 *   `lib/indexer/indexer-v7.ts :: indexV7Chain`.
 *
 * ## Privacy invariant
 *   This indexer only touches PUBLIC on-chain data: addresses, plaintext
 *   amounts at the privacy boundary (sweeper/credit), event topics. It
 *   never persists ciphertext handles, FHE-encrypted balances, or
 *   passkey-derived secrets. The recovery_artifacts table is opaque-only
 *   and written by the relayer, not this indexer.
 *
 * ## Example tick output
 *   $ pnpm tsx scripts/indexer-v7.ts
 *   [indexer-v7] tick start chains=421614,84532,11155111 budgetMs=50000
 *   [indexer-v7] 421614 head=12_345_678 elapsed=8421ms ok
 *   [indexer-v7] 84532  head=18_990_012 elapsed=6112ms ok
 *   [indexer-v7] 11155111 head=6_771_004 elapsed=4880ms ok
 *   [indexer-v7] tick done in 8.5s
 */
import { indexV7Chain } from "../lib/indexer/indexer-v7";
import * as db from "../lib/indexer/turso-v7";
import { v7Deployment, type V7Deployment } from "../lib/relayer/v7";

const DEFAULT_CHAIN_IDS = [421614, 84532, 11155111];

function envChainIds(): number[] {
  const raw = process.env.INDEXER_V7_CHAIN_IDS?.trim();
  if (!raw) return DEFAULT_CHAIN_IDS;
  return raw.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export interface TickChainResult {
  chainId: number;
  ok: boolean;
  elapsedMs: number;
  error?: string;
}

export interface TickResult {
  chains: TickChainResult[];
  startedAt: number;
  finishedAt: number;
}

/**
 * Run one tick across all enabled chains in parallel. Per-chain isolation
 * via `allSettled` — one chain's RPC stall can't block the others.
 */
export async function runTick(opts?: { chainIds?: number[]; maxMs?: number }): Promise<TickResult> {
  const chainIds = opts?.chainIds ?? envChainIds();
  const maxMs = opts?.maxMs ?? Number(process.env.INDEXER_V7_MAX_MS ?? 50_000);
  const startedAt = Date.now();
  console.log(`[indexer-v7] tick start chains=${chainIds.join(",")} budgetMs=${maxMs}`);
  await db.ensureSchema();

  const results = await Promise.allSettled(
    chainIds.map(async (chainId): Promise<TickChainResult> => {
      const t0 = Date.now();
      try {
        let d: V7Deployment;
        try {
          d = v7Deployment(chainId);
        } catch (e: any) {
          // Missing deployment env is non-fatal — skip the chain gracefully.
          console.warn(`[indexer-v7] ${chainId} skip: ${e?.message ?? e}`);
          return { chainId, ok: false, elapsedMs: Date.now() - t0, error: "no deployment env" };
        }
        const startBlock = Number(process.env[`BACKFILL_FROM_BLOCK_${chainId}`] ?? process.env[`DEPLOY_BLOCK_V7_${chainId}`] ?? 0);
        await indexV7Chain(chainId, d, { startBlock, maxMs });
        const elapsedMs = Date.now() - t0;
        console.log(`[indexer-v7] ${chainId} ok elapsed=${elapsedMs}ms`);
        return { chainId, ok: true, elapsedMs };
      } catch (e: any) {
        const elapsedMs = Date.now() - t0;
        const msg = e?.message ?? String(e);
        console.error(`[indexer-v7] ${chainId} FAIL elapsed=${elapsedMs}ms err=${msg}`);
        return { chainId, ok: false, elapsedMs, error: msg };
      }
    }),
  );

  const flat: TickChainResult[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { chainId: chainIds[i], ok: false, elapsedMs: 0, error: String((r as PromiseRejectedResult).reason) },
  );

  const finishedAt = Date.now();
  console.log(`[indexer-v7] tick done in ${((finishedAt - startedAt) / 1000).toFixed(1)}s`);
  return { chains: flat, startedAt, finishedAt };
}

// CLI entry — only runs when invoked directly via tsx / node, never on import.
const isMain = (() => {
  try {
    // ESM-friendly main detection.
    const u = new URL(import.meta.url).pathname;
    return process.argv[1] && (process.argv[1] === u || process.argv[1].endsWith("/indexer-v7.ts"));
  } catch {
    return false;
  }
})();

if (isMain) {
  runTick()
    .then((r) => {
      const failed = r.chains.filter((c) => !c.ok);
      if (failed.length > 0) {
        console.error(`[indexer-v7] ${failed.length}/${r.chains.length} chains failed`);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error("[indexer-v7] fatal", e);
      process.exit(1);
    });
}
