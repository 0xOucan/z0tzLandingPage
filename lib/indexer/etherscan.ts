/**
 * Etherscan V2 unified API client for the indexer.
 *
 * One API key authenticates against every Etherscan-family chain. We use
 * the `logs.getLogs` endpoint to pull event ranges fast — Etherscan does
 * the chunking server-side, so the indexer doesn't have to halve and
 * retry like the RPC path does.
 *
 * Each call returns up to 1000 logs. For larger ranges we paginate by
 * advancing fromBlock to (lastLog.blockNumber + 1) until results are empty.
 */

import { resolvePool } from "@/lib/relayer/rpc";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
// Etherscan V2 free tier = 5 req/sec. 120ms ≈ 8 req/sec which exceeds
// the cap on paper, but rate-limit responses are retried with backoff
// so we naturally settle near the ceiling without burning the function
// budget on artificial waits.
const MIN_GAP_MS = 120;

let lastCallTs = 0;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTs;
  if (elapsed < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - elapsed));
  }
  lastCallTs = Date.now();
}

export function isConfigured(): boolean {
  return !!process.env.ETHERSCAN_API_KEY?.trim();
}

export type EtherscanLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string; // hex
  timeStamp: string; // hex
  transactionHash: string;
  logIndex: string; // hex
};

/**
 * Hard timeout per Etherscan call. Without this, a stuck Etherscan TCP
 * connection can hang the whole Vercel function until maxDuration kicks
 * in — and we lose ALL progress for that trigger call. 8s is enough for
 * a healthy response while keeping the function-budget math predictable.
 */
const FETCH_TIMEOUT_MS = 8000;

async function fetchV2(url: string, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const base = 500 * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 300;
      await new Promise((r) => setTimeout(r, base + jitter));
    }
    await waitForSlot();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
      if (!res.ok) {
        if (attempt === maxRetries) return null;
        continue;
      }
      const data = await res.json();
      const resultStr = typeof data.result === "string" ? data.result : "";
      const rateLimited = data.status === "0" && /rate limit/i.test(resultStr);
      if (rateLimited && attempt < maxRetries) continue;
      return data;
    } catch {
      if (attempt === maxRetries) return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

/**
 * Fetch event logs for a contract+topic filter in a block range. Etherscan
 * caps response at 1000 logs — caller should re-invoke with advanced
 * fromBlock if the response is full.
 */
export async function getLogs(params: {
  chainId: number;
  address: string;
  fromBlock: number;
  toBlock: number;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
}): Promise<EtherscanLog[] | null> {
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  // F-7 fix: when no Etherscan key is set (local dev, self-hosted), go
  // straight to the RPC fallback instead of returning null. Returning null
  // here causes getLogsPaginated → indexV7Chain to silently advance
  // scan_state to head WITHOUT actually scanning any blocks — the indexer
  // appears to run successfully but never persists any rows.
  if (!key) return getLogsViaRpc(params);
  const qs = new URLSearchParams({
    chainid: String(params.chainId),
    module: "logs",
    action: "getLogs",
    address: params.address,
    fromBlock: String(params.fromBlock),
    toBlock: String(params.toBlock),
    apikey: key,
    page: "1",
    offset: "1000",
  });
  if (params.topic0) qs.set("topic0", params.topic0);
  if (params.topic1) qs.set("topic1", params.topic1);
  if (params.topic2) qs.set("topic2", params.topic2);
  if (params.topic3) qs.set("topic3", params.topic3);
  // Etherscan V2 quirk: without explicit AND operators, multiple topic
  // params are ignored beyond topic0 — the response is filtered by topic0
  // alone, returning EVERY event of that signature chain-wide. We saw this
  // burn: a Z0tz paymaster filter on EntryPoint silently fell through and
  // pulled 4855 unrelated UserOps in 14 days of base-sepolia.
  // Setting topic0_X_opr=and for every supplied additional topic forces
  // the intended AND-join. Order matters per Etherscan docs (lower index
  // first).
  if (params.topic0 && params.topic1) qs.set("topic0_1_opr", "and");
  if (params.topic0 && params.topic2) qs.set("topic0_2_opr", "and");
  if (params.topic0 && params.topic3) qs.set("topic0_3_opr", "and");
  if (params.topic1 && params.topic2) qs.set("topic1_2_opr", "and");
  if (params.topic1 && params.topic3) qs.set("topic1_3_opr", "and");
  if (params.topic2 && params.topic3) qs.set("topic2_3_opr", "and");
  const data = await fetchV2(`${ETHERSCAN_V2_BASE}?${qs.toString()}`);
  // Etherscan happy paths first.
  //   status=1, message=OK, result=[logs]   → normal success
  //   status=0, message=No records found, result=[] → empty result
  //   status=0, message=NOTOK, result="<error>" → error
  if (data) {
    if (data.status === "1" && Array.isArray(data.result)) return data.result;
    if (data.status === "0" && Array.isArray(data.result)) return [];
  }
  // Etherscan failed (rate-limited / 5xx / parse error). Try the chain's
  // RPC pool as a fallback. RPC eth_getLogs covers the same query but
  // returns logs in JSON-RPC shape — we adapt them to EtherscanLog so the
  // caller doesn't care about the data source.
  return getLogsViaRpc(params);
}

/**
 * RPC fallback for getLogs. Uses the indexer's chain pool (resolvePool)
 * with manual rotation — calls each URL in order until one responds with
 * a valid log array. Times out per URL on FETCH_TIMEOUT_MS.
 *
 * Adapts the response shape to EtherscanLog so the caller's decoder
 * works on either source. Block timestamps aren't part of eth_getLogs,
 * so we batch-fetch them with eth_getBlockByNumber(false) and stitch.
 */
async function getLogsViaRpc(params: {
  chainId: number;
  address: string;
  fromBlock: number;
  toBlock: number;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
}): Promise<EtherscanLog[] | null> {
  const pool = resolvePool(params.chainId);
  if (pool.length === 0) return null;
  // viem's positional topics: [topic0, topic1, topic2, topic3]. RPCs expect
  // null entries where a topic is unset. We emit only as many slots as the
  // highest set topic; eth_getLogs treats absent trailing topics as "any".
  const topics: (string | null)[] = [];
  const set = [params.topic0, params.topic1, params.topic2, params.topic3];
  let lastSet = -1;
  for (let i = 0; i < 4; i++) if (set[i]) lastSet = i;
  for (let i = 0; i <= lastSet; i++) topics.push(set[i] ?? null);

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        address: params.address,
        fromBlock: "0x" + params.fromBlock.toString(16),
        toBlock: "0x" + params.toBlock.toString(16),
        ...(topics.length > 0 ? { topics } : {}),
      },
    ],
  };

  for (const url of pool) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: ctl.signal,
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (!Array.isArray(j?.result)) continue;
      const raw = j.result as Array<{
        address: string;
        topics: string[];
        data: string;
        blockNumber: string;
        transactionHash: string;
        logIndex: string;
      }>;
      // Get block timestamps. Etherscan includes them; RPCs don't. We need
      // them for the indexer rows, so batch-fetch per unique block.
      const uniqueBlocks = Array.from(new Set(raw.map((l) => l.blockNumber)));
      const tsByBlock = new Map<string, string>();
      if (uniqueBlocks.length > 0) {
        // Use json-rpc batch (most public RPCs support batched requests)
        // to fetch all blocks in one round-trip. If a node rejects the
        // batch shape we fall through to per-block. Either way, every log
        // gets a non-undefined timeStamp because we map missing values to
        // "0x0".
        try {
          const batchRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              uniqueBlocks.map((bn, i) => ({
                jsonrpc: "2.0",
                id: i + 1,
                method: "eth_getBlockByNumber",
                params: [bn, false],
              }))
            ),
            cache: "no-store",
            signal: ctl.signal,
          });
          if (batchRes.ok) {
            const arr = await batchRes.json();
            if (Array.isArray(arr)) {
              for (let i = 0; i < arr.length; i++) {
                const blk = arr[i]?.result;
                if (blk?.timestamp) tsByBlock.set(uniqueBlocks[i], blk.timestamp);
              }
            }
          }
        } catch {
          /* leave map empty — logs get "0x0" timestamps below */
        }
      }
      return raw.map<EtherscanLog>((l) => ({
        address: l.address,
        topics: l.topics,
        data: l.data,
        blockNumber: l.blockNumber,
        timeStamp: tsByBlock.get(l.blockNumber) ?? "0x0",
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
      }));
    } catch {
      continue;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

/**
 * Result of a paginated scan. `lastScannedBlock` is the highest block that
 * was FULLY scanned for this filter — the caller MUST persist scan_state to
 * this value, not to the chain head. `truncated` is true when the scan
 * stopped early (deadline / page cap) before reaching `toBlock`, meaning
 * blocks above `lastScannedBlock` are NOT yet covered and must be resumed.
 * `logs` is null only on a hard fetch failure (caller should not advance).
 */
export type PaginatedLogs = {
  logs: EtherscanLog[] | null;
  lastScannedBlock: number;
  truncated: boolean;
};

/**
 * Paginated getLogs that follows the 1000-log cap. Walks fromBlock forward
 * each iteration until the response is non-full, indicating we've caught
 * up to toBlock for this filter.
 *
 * CRITICAL (cursor correctness): on early exit (deadline or page cap) this
 * returns `truncated:true` with `lastScannedBlock` set to the last block we
 * KNOW is fully covered — never `toBlock`. The caller advances scan_state to
 * `lastScannedBlock` so the next tick resumes from the unscanned remainder
 * instead of silently skipping it.
 */
export async function getLogsPaginatedScan(params: {
  chainId: number;
  address: string;
  fromBlock: number;
  toBlock: number;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
  maxPages?: number; // safety cap, default 50 = 50K logs per call
  deadline?: number; // optional Date.now()-based hard exit
}): Promise<PaginatedLogs> {
  const maxPages = params.maxPages ?? 50;
  const all: EtherscanLog[] = [];
  let cursor = params.fromBlock;
  // The highest block fully covered so far. Until we make any progress this
  // is one below fromBlock (nothing scanned yet).
  let lastScannedBlock = params.fromBlock - 1;
  for (let i = 0; i < maxPages; i++) {
    // Bail early if the function-budget deadline is past. We've fully scanned
    // up to `lastScannedBlock`; everything above is still pending. Report
    // truncated so the caller advances scan_state only to lastScannedBlock.
    if (params.deadline !== undefined && Date.now() > params.deadline) {
      return { logs: all, lastScannedBlock, truncated: true };
    }
    const page = await getLogs({ ...params, fromBlock: cursor });
    if (page === null) {
      // Hard fetch failure: caller must NOT advance the cursor at all.
      return { logs: null, lastScannedBlock, truncated: true };
    }
    if (page.length === 0) {
      // No more logs in [cursor, toBlock]: the whole requested range is done.
      lastScannedBlock = params.toBlock;
      break;
    }
    all.push(...page);
    if (page.length < 1000) {
      // Got everything for this range — fully scanned through toBlock.
      lastScannedBlock = params.toBlock;
      break;
    }
    // Page was full (1000 logs). We've fully covered everything strictly
    // BELOW the last block in this page (that block may have more logs we
    // haven't fetched yet), so only blocks < lastBlock are guaranteed done.
    // We de-dup at insert time via PRIMARY KEY (chain, tx, logIndex), so the
    // re-fetch of lastBlock on the next page is free.
    const lastBlock = parseInt(page[page.length - 1].blockNumber, 16);
    lastScannedBlock = Math.max(lastScannedBlock, lastBlock - 1);
    cursor = lastBlock;
    if (i === maxPages - 1) {
      // Hit the page cap without draining the range — truncated.
      return { logs: all, lastScannedBlock, truncated: true };
    }
  }
  return { logs: all, lastScannedBlock, truncated: false };
}

/**
 * Backward-compatible array-returning paginated scan. Used by the frozen
 * V6.5 indexer (`indexer.ts`), which manages its own chunk-level cursor and
 * only needs the logs (a null return signals fetch failure). New V7 code
 * should call `getLogsPaginatedScan` and honor `truncated` / `lastScannedBlock`.
 */
export async function getLogsPaginated(params: {
  chainId: number;
  address: string;
  fromBlock: number;
  toBlock: number;
  topic0?: string;
  topic1?: string;
  topic2?: string;
  topic3?: string;
  maxPages?: number;
  deadline?: number;
}): Promise<EtherscanLog[] | null> {
  const r = await getLogsPaginatedScan(params);
  return r.logs;
}
