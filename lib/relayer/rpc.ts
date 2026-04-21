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
  // Base Sepolia. Tenderly's public gateway caps eth_sendRawTransaction
  // size and returns "Request exceeds defined limit" for CCTP-sized txs,
  // so it's deliberately moved below drpc and the official base.org URL.
  84532: [
    "https://base-sepolia.drpc.org",
    "https://sepolia.base.org",
    "https://base-sepolia-public.nodies.app",
    "https://base-sepolia.gateway.tenderly.co",
    "https://base-sepolia-rpc.publicnode.com",
  ],
  // Ethereum Sepolia
  11155111: [
    "https://ethereum-sepolia.rpc.subquery.network/public",
    "https://eth-sepolia.api.onfinality.io/public",
    "https://sepolia.gateway.tenderly.co",
    "https://ethereum-sepolia-public.nodies.app",
    "https://ethereum-sepolia-rpc.publicnode.com",
  ],
  // Arbitrum Sepolia
  421614: [
    "https://arbitrum-sepolia.drpc.org",
    "https://arbitrum-sepolia.gateway.tenderly.co",
    "https://sepolia-rollup.arbitrum.io/rpc",
    "https://arbitrum-sepolia-rpc.publicnode.com",
  ],
};

/**
 * Return the ordered pool of RPC URLs for a chain. If RPC_URL_{chainId} is
 * set, it becomes the primary and the default pool entries (minus any
 * duplicate) follow as fallbacks.
 */
export function resolvePool(chainId: number): string[] {
  const envVal = process.env[`RPC_URL_${chainId}`]?.trim();
  const base = RPC_POOLS[chainId] ?? [];
  if (envVal && envVal.length > 0) return [envVal, ...base.filter(u => u !== envVal)];
  return base;
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
