/**
 * Cost-tracking glue between relayer endpoints and the indexer DB.
 *
 * After every chain-writing relayer op, the endpoint fires-and-forgets
 * `recordOpCostAsync` with the txHash. The helper:
 *   1. fetches the receipt via the chain's RPC pool (~1-3s)
 *   2. converts gasUsed × effectiveGasPrice → USDC micros via the
 *      cached ETH/USD price oracle
 *   3. INSERTs into relayer_op_costs (idempotent on txHash)
 *
 * **Privacy-preserving by design:** no user identifier is recorded.
 * Storing keccak(ownerX || ownerY) alongside USDC spend would let
 * any DB observer reconstruct a user's full spending profile —
 * exactly what the encrypted ledger is meant to protect. Instead,
 * we recover cost per-op at fee-quote time by reading the rolling
 * median of recent op costs; the protocol still profits, no user
 * is fingerprinted.
 *
 * All errors are swallowed. This is best-effort tracking; if the
 * record fails, the user op already succeeded.
 */
import { createPublicClient, type Hex } from "viem";
import { resolvePool, makeTransport } from "./rpc";
import { recordOpCost, isEnabled as tursoEnabled, type OpCostRow } from "@/lib/indexer/turso";
import { weiToUsdcMicros } from "./eth-price";

export type OpKind =
  | "fund-stealth"
  | "ledger-op"
  | "ledger-sweep"
  | "relay"
  | "bridge"
  | "private-bridge"
  | "strategy-deploy"
  | "strategy-redeem";

/**
 * Background receipt-fetch + cost-record. Returns a promise that
 * resolves once the receipt is in the DB OR after a timeout.
 *
 * Caller pattern: `void recordOpCostAsync(...).catch(() => {});`.
 * Never `await` this from a user-facing endpoint — the receipt fetch
 * adds 1-3s of latency that the user doesn't need to wait for.
 */
export async function recordOpCostAsync(opts: {
  chainId: number;
  txHash: Hex;
  opKind: OpKind;
}): Promise<void> {
  if (!tursoEnabled()) return;

  const { chainId, txHash, opKind } = opts;

  // Build a minimal public client for the chain. Reuse the resolvePool
  // ordering so we get the same reliability as the rest of the relayer.
  const pool = resolvePool(chainId);
  if (pool.length === 0) {
    console.warn(`[cost-tracker] no RPC pool for chain ${chainId}`);
    return;
  }
  const client = createPublicClient({
    transport: makeTransport(pool[0]),
  });

  // Wait for the receipt. Retry a few times — sometimes the receipt
  // isn't immediately available after eth_sendRawTransaction. Bounded
  // because if the tx never lands we shouldn't charge anyone.
  let receipt: any = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) break;
    } catch {
      /* not mined yet — wait and retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!receipt) {
    console.warn(`[cost-tracker] no receipt for ${txHash} after 6 retries`);
    return;
  }

  const gasUsed = Number(receipt.gasUsed ?? 0n);
  const effectiveGasPrice = receipt.effectiveGasPrice ?? receipt.gasPrice ?? 0n;
  if (gasUsed === 0 || effectiveGasPrice === 0n) {
    console.warn(`[cost-tracker] zero gas/price on ${txHash}, skipping`);
    return;
  }
  const ethSpentWei = BigInt(gasUsed) * BigInt(effectiveGasPrice);
  const { ethUsd, usdcMicros } = await weiToUsdcMicros(ethSpentWei);

  const row: OpCostRow = {
    chainId,
    txHash: txHash.toLowerCase(),
    opKind,
    gasUsed,
    effectiveGasPrice: effectiveGasPrice.toString(),
    ethSpent: ethSpentWei.toString(),
    ethUsdAtRecord: ethUsd.toString(),
    usdcCostMicros: usdcMicros,
    status: receipt.status === "success" ? 1 : 0,
  };
  try {
    await recordOpCost(row);
    console.info(
      `[cost-tracker] recorded ${opKind} on chain ${chainId}: ${gasUsed} gas, ${usdcMicros / 1_000_000} USDC`,
    );
  } catch (e: any) {
    console.warn(`[cost-tracker] DB write failed for ${txHash}: ${e?.message?.slice?.(0, 200)}`);
  }
}
