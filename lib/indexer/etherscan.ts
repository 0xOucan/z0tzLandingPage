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
  if (!key) return null;
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
  const data = await fetchV2(`${ETHERSCAN_V2_BASE}?${qs.toString()}`);
  if (!data) return null;
  // Etherscan returns:
  //   status=1, message=OK, result=[logs]   → normal success
  //   status=0, message=No records found, result=[] → empty result
  //   status=0, message=NOTOK, result="<error>" → error
  if (data.status === "1" && Array.isArray(data.result)) return data.result;
  if (data.status === "0" && Array.isArray(data.result)) return [];
  return null;
}

/**
 * Paginated getLogs that follows the 1000-log cap. Walks fromBlock forward
 * each iteration until the response is non-full, indicating we've caught
 * up to toBlock for this filter.
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
  maxPages?: number; // safety cap, default 50 = 50K logs per call
  deadline?: number; // optional Date.now()-based hard exit
}): Promise<EtherscanLog[] | null> {
  const maxPages = params.maxPages ?? 50;
  const all: EtherscanLog[] = [];
  let cursor = params.fromBlock;
  for (let i = 0; i < maxPages; i++) {
    // Bail early if the function-budget deadline is past. Returning what
    // we have so far + null cursor advance lets the caller persist
    // partial scan_state and resume on the next trigger.
    if (params.deadline !== undefined && Date.now() > params.deadline) {
      return all;
    }
    const page = await getLogs({ ...params, fromBlock: cursor });
    if (page === null) return null;
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < 1000) break; // we got everything for this range
    // Advance past the last block we got. Note: this may re-fetch logs
    // from the last block if it has multiple logs. We de-dup at insert
    // time via PRIMARY KEY (chain, tx, logIndex), so duplicates are
    // free.
    const lastBlockHex = page[page.length - 1].blockNumber;
    const lastBlock = parseInt(lastBlockHex, 16);
    cursor = lastBlock;
  }
  return all;
}
