/**
 * Relayer RPC pools. publicnode.com returned `-32701 no available nodes found`
 * on base-sepolia during live deploys on 2026-04-18, so defaults lead with the
 * most reliable public endpoints (tenderly, drpc, official L2 RPCs) and use
 * viem's fallback transport to rotate through the pool on any RPC error.
 *
 * Per-chain overrides still work via the existing RPC_URL_{chainId} env var —
 * an override slots in as the primary and the remaining pool entries act as
 * fallbacks behind it.
 */
import { http, fallback } from "viem";

export const RPC_POOLS: Record<number, string[]> = {
  // Base Sepolia. Lead with the official Coinbase node (single-backend,
  // consistent nonce reads across consecutive writes — relevant for the
  // sweep + spend pipeline). Tenderly is reliable but caps
  // eth_sendRawTransaction size on CCTP-sized payloads, so it sits behind
  // drpc / sentio.
  84532: [
    "https://sepolia.base.org",                       // official Coinbase, single backend
    "https://base-sepolia.drpc.org",
    "https://base-sepolia.gateway.tenderly.co",
    "https://rpc.sentio.xyz/base-sepolia",
    "https://base-sepolia-public.nodies.app",
    "https://base-sepolia-rpc.publicnode.com",
  ],
  // Ethereum Sepolia. Lead with ethpandaops (single backend, low latency).
  // Subquery demoted to last — it returns `null` instead of `[]` for empty
  // eth_getLogs multi-topic filters, crashing viem.
  11155111: [
    "https://rpc.sepolia.ethpandaops.io",             // ethpandaops, single backend
    "https://sepolia.gateway.tenderly.co",
    "https://sepolia.drpc.org",
    "https://rpc.sentio.xyz/sepolia",
    "https://1rpc.io/sepolia",
    "https://eth-sepolia.api.onfinality.io/public",
    "https://ethereum-sepolia-public.nodies.app",
    "https://ethereum-sepolia-rpc.publicnode.com",
  ],
  // Arbitrum Sepolia. Lead with the official Offchain Labs RPC (single
  // backend) — drpc and tenderly behind for redundancy, public-node load-
  // balancer last.
  421614: [
    "https://sepolia-rollup.arbitrum.io/rpc",         // official Offchain Labs, single backend
    "https://arbitrum-sepolia.drpc.org",
    "https://arbitrum-sepolia.gateway.tenderly.co",
    "https://api.zan.top/arb-sepolia",
    "https://arbitrum-sepolia-rpc.publicnode.com",
  ],
};

/**
 * Return the ordered pool of RPC URLs for a chain.
 *
 * Env override RPC_URL_{chainId} behavior:
 *   - If the env URL is NOT already in the default pool (a custom URL like
 *     an Alchemy/Infora key), it becomes the primary and the default pool
 *     follows as fallbacks.
 *   - If the env URL IS already in the default pool (e.g. the legacy
 *     publicnode default that Vercel deployments were provisioned with),
 *     the pool's curated ordering is respected — the known-flaky entries
 *     stay demoted to their curated position instead of being promoted
 *     back to primary.
 *
 * This lets operators override with a real paid RPC but prevents stale
 * env vars pointing at the default providers from overriding the
 * curated priority.
 */
export function resolvePool(chainId: number): string[] {
  const envVal = process.env[`RPC_URL_${chainId}`]?.trim();
  const base = RPC_POOLS[chainId] ?? [];
  if (!envVal || envVal.length === 0) return base;
  if (base.includes(envVal)) return base; // curated ordering wins
  return [envVal, ...base.filter(u => u !== envVal)];
}

/**
 * Primary RPC URL for a chain — used wherever the relayer needs a single URL
 * string (logging, legacy API).
 */
export function primaryRpc(chainId: number): string {
  return resolvePool(chainId)[0] ?? "";
}

/**
 * Drop-in replacement for `http(url)` that wraps the URL's chain pool in a
 * viem fallback transport. Transparent to callers — the return type matches
 * `http()`'s. Unknown URLs (test RPCs) fall through to a plain `http(url)`.
 */
export function makeTransport(url: string) {
  if (!url) return http(url);
  for (const chainId of Object.keys(RPC_POOLS).map(Number)) {
    const pool = resolvePool(chainId);
    if (pool.includes(url)) {
      const ordered = [url, ...pool.filter(u => u !== url)];
      // Force the fallback to rotate on any error. viem's default treats
      // RPC "user errors" (e.g. Tenderly's "Request exceeds defined limit")
      // as non-retriable and throws immediately; our pool entries are
      // functionally equivalent so the next one deserves a shot.
      return fallback(ordered.map(u => http(u)), { shouldThrow: () => false });
    }
  }
  return http(url);
}
