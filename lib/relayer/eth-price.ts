/**
 * ETH/USD price for converting relayer gas costs to user-charged USDC.
 *
 * CoinGecko free tier (no API key) — generous enough for one fetch per
 * 5 minutes. We cache per-process; multiple Vercel function instances
 * each fetch independently, which is fine.
 *
 * Fallback rate from env (ETH_USD_FALLBACK) when the API is down. Last
 * resort is a hard-coded $2000 — better to charge slightly wrong than
 * to crash a user-facing op.
 */
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 4000;

let cached: { value: number; ts: number } | null = null;
let inFlight: Promise<number> | null = null;

function fallbackPrice(): number {
  const fromEnv = Number(process.env.ETH_USD_FALLBACK);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 2000;
}

async function fetchPrice(): Promise<number> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(COINGECKO_URL, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) return fallbackPrice();
    const j = (await res.json()) as { ethereum?: { usd?: number } };
    const v = j?.ethereum?.usd;
    if (typeof v === "number" && v > 0) return v;
    return fallbackPrice();
  } catch {
    return fallbackPrice();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Return current ETH/USD. Cached for 5 minutes. Concurrent callers
 * share a single in-flight fetch — no thundering herd on cache miss.
 */
export async function getEthUsdPrice(): Promise<number> {
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const v = await fetchPrice();
      cached = { value: v, ts: Date.now() };
      return v;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Convert wei to USDC microunits (6-decimal fixed point). Pass the
 * exact wei cost from the receipt; we'll convert at the current
 * cached ETH/USD price.
 */
export async function weiToUsdcMicros(weiSpent: bigint): Promise<{
  ethUsd: number;
  usdcMicros: number;
}> {
  const ethUsd = await getEthUsdPrice();
  // weiSpent / 1e18 = ETH; * ethUsd = USD; * 1e6 = USDC micros
  // Stay in bigint to avoid float drift on big numbers.
  // micros = weiSpent * floor(ethUsd * 1e6) / 1e18
  const priceMicros = BigInt(Math.round(ethUsd * 1_000_000));
  const usdcMicros = (weiSpent * priceMicros) / 10n ** 18n;
  return { ethUsd, usdcMicros: Number(usdcMicros) };
}
