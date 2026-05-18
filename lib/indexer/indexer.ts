/**
 * Indexer core — fetches events for one chain × one event-source and
 * inserts decoded rows into Turso.
 *
 * Design notes:
 *
 * - Per-event-source scan_state. Each (chain, contract, event_type) tuple
 *   has its own cursor so a stuck Sweeper scan doesn't block Ledger.
 *
 * - Time-budgeted: each `indexSource` call has a soft `maxMs` deadline.
 *   If it runs out, we set scan_state to the last-fully-processed block
 *   and return. Next trigger picks up. This is critical because Vercel
 *   functions have hard timeouts (10s / 60s / 5min depending on plan).
 *
 * - Etherscan-primary. RPC fallback can be added later — for now,
 *   ETHERSCAN_API_KEY is required.
 *
 * - Idempotent. INSERT OR IGNORE means re-running the indexer over a
 *   range that's already been processed is a no-op. We could even
 *   re-scan recent blocks every run for self-healing (we don't, but
 *   could).
 */
import { decodeEventLog, keccak256, toBytes, type AbiEvent } from "viem";
import {
  ENTRYPOINT_USEROP_EVENT,
  ACCOUNT_CREATED_EVENT,
  SWEEPER_PRIVATE_SWEEP,
  LEDGER_REGISTERED,
  LEDGER_CREDITED,
  LEDGER_SPENT,
  LEDGER_ROTATED,
  VAULT_TRANSFERRED_OUT,
  resolveChainContracts,
  type ChainId,
  SUPPORTED_CHAINS,
} from "./contracts";
import { getLogsPaginated, isConfigured as etherscanConfigured, type EtherscanLog } from "./etherscan";
import { client, ensureSchema, getLastScanBlock, setScanState } from "./turso";

// 200K blocks per scan chunk. With Etherscan's 1000-log cap that gives us
// pagination room for high-volume contracts like USDC; for our 5 sources
// it's typically 1-2 pages per chunk.
const CHUNK_SIZE = 200_000;

// ─── Topic0 hashes ─────────────────────────────────────────────────────
// Pre-computed so we don't recompute on every call.
function topic0(ev: AbiEvent): string {
  const sig = `${ev.name}(${ev.inputs.map((i) => i.type).join(",")})`;
  return keccak256(toBytes(sig));
}

export const TOPIC0 = {
  entrypointUserOp: topic0(ENTRYPOINT_USEROP_EVENT),
  accountCreated: topic0(ACCOUNT_CREATED_EVENT),
  sweep: topic0(SWEEPER_PRIVATE_SWEEP),
  ledgerRegistered: topic0(LEDGER_REGISTERED),
  ledgerCredited: topic0(LEDGER_CREDITED),
  ledgerSpent: topic0(LEDGER_SPENT),
  ledgerRotated: topic0(LEDGER_ROTATED),
  vaultTransferredOut: topic0(VAULT_TRANSFERRED_OUT),
};

// ─── Source registry ────────────────────────────────────────────────────
// Each entry maps an event-source identifier to (a) the abi (b) how to
// resolve the contract address per chain (c) how to insert rows.

type EventSource = {
  key: string; // unique within (chainId,contract)
  contractFor: (chainId: ChainId) => `0x${string}` | undefined;
  abi: AbiEvent;
  topic0: string;
  insert: (chainId: ChainId, log: EtherscanLog) => Promise<void>;
};

function hexToBig(hex: string): bigint {
  return BigInt(hex);
}
function hexToNum(hex: string): number {
  return Number(BigInt(hex));
}

/** Strip leading-zero padding from a 32-byte indexed-address topic. */
function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

const SOURCES: EventSource[] = [
  {
    key: "EntryPoint.UserOperationEvent",
    contractFor: (c) => resolveChainContracts(c).entryPoint,
    abi: ENTRYPOINT_USEROP_EVENT,
    topic0: TOPIC0.entrypointUserOp,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [ENTRYPOINT_USEROP_EVENT],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO entrypoint_userops
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               user_op_hash, sender, paymaster, nonce, success,
               actual_gas_cost, actual_gas_used)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          a.userOpHash,
          (a.sender as string).toLowerCase(),
          (a.paymaster as string)?.toLowerCase() ?? null,
          a.nonce.toString(),
          a.success ? 1 : 0,
          a.actualGasCost.toString(),
          a.actualGasUsed.toString(),
        ],
      });
    },
  },
  {
    key: "AccountFactory.AccountCreated",
    contractFor: (c) => resolveChainContracts(c).accountFactory,
    abi: ACCOUNT_CREATED_EVENT,
    topic0: TOPIC0.accountCreated,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [ACCOUNT_CREATED_EVENT],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO smart_accounts
              (chain_id, account_address, owner_x, owner_y, block_number, block_timestamp, tx_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          chainId,
          (a.account as string).toLowerCase(),
          a.ownerX.toString(),
          a.ownerY.toString(),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          log.transactionHash,
        ],
      });
    },
  },
  {
    key: "Sweeper.PrivateSweep",
    contractFor: (c) => resolveChainContracts(c).sweeper,
    abi: SWEEPER_PRIVATE_SWEEP,
    topic0: TOPIC0.sweep,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [SWEEPER_PRIVATE_SWEEP],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO sweep_events
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               stealth_address, wrapped_token_or_vault, shielded_amount, fee)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          (a.stealthAddress as string).toLowerCase(),
          (a.wrappedTokenOrVault as string).toLowerCase(),
          a.shieldedAmount.toString(),
          a.fee.toString(),
        ],
      });
    },
  },
  // Ledger events: 4 separate sources, but all target the same table with
  // event_name discriminator. Each has its own scan_state row keyed by
  // (chain, ledger_address, "Ledger.Registered" / "Ledger.Spent" / ...).
  {
    key: "Ledger.Registered",
    contractFor: (c) => resolveChainContracts(c).ledger,
    abi: LEDGER_REGISTERED,
    topic0: TOPIC0.ledgerRegistered,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [LEDGER_REGISTERED],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO ledger_events
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               event_name, ledger_id, pubkey_hash, viewer)
              VALUES (?, ?, ?, ?, ?, 'Registered', ?, ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          a.ledgerId,
          a.pubkeyHash,
          (a.viewer as string).toLowerCase(),
        ],
      });
    },
  },
  {
    key: "Ledger.CreditedFromVault",
    contractFor: (c) => resolveChainContracts(c).ledger,
    abi: LEDGER_CREDITED,
    topic0: TOPIC0.ledgerCredited,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [LEDGER_CREDITED],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO ledger_events
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               event_name, ledger_id, net_amount)
              VALUES (?, ?, ?, ?, ?, 'CreditedFromVault', ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          a.ledgerId,
          a.netAmount.toString(),
        ],
      });
    },
  },
  {
    key: "Ledger.Spent",
    contractFor: (c) => resolveChainContracts(c).ledger,
    abi: LEDGER_SPENT,
    topic0: TOPIC0.ledgerSpent,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [LEDGER_SPENT],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO ledger_events
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               event_name, ledger_id, new_ledger_id, action)
              VALUES (?, ?, ?, ?, ?, 'Spent', ?, ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          a.oldId,
          a.newId,
          Number(a.action),
        ],
      });
    },
  },
  {
    key: "Ledger.Rotated",
    contractFor: (c) => resolveChainContracts(c).ledger,
    abi: LEDGER_ROTATED,
    topic0: TOPIC0.ledgerRotated,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [LEDGER_ROTATED],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO ledger_events
              (chain_id, tx_hash, log_index, block_number, block_timestamp,
               event_name, ledger_id, new_ledger_id)
              VALUES (?, ?, ?, ?, ?, 'Rotated', ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          a.oldId,
          a.newId,
        ],
      });
    },
  },
  {
    key: "Vault.TransferredOut",
    contractFor: (c) => resolveChainContracts(c).vault,
    abi: VAULT_TRANSFERRED_OUT,
    topic0: TOPIC0.vaultTransferredOut,
    insert: async (chainId, log) => {
      const decoded = decodeEventLog({
        abi: [VAULT_TRANSFERRED_OUT],
        data: log.data as `0x${string}`,
        topics: log.topics as any,
      });
      const a = decoded.args as any;
      await client().execute({
        sql: `INSERT OR IGNORE INTO vault_transferred_out
              (chain_id, tx_hash, log_index, block_number, block_timestamp, to_address, enc_amount)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          chainId,
          log.transactionHash,
          hexToNum(log.logIndex),
          hexToNum(log.blockNumber),
          hexToNum(log.timeStamp),
          (a.to as string).toLowerCase(),
          a.encAmount,
        ],
      });
    },
  },
];

// ─── Public API ─────────────────────────────────────────────────────────

export type IndexResult = {
  chainId: number;
  source: string;
  scannedFrom: number;
  scannedTo: number;
  inserted: number;
  truncated: boolean; // true if we hit time budget before finishing
};

/**
 * Index one event source on one chain. Walks scan_state forward in
 * CHUNK_SIZE block steps, decoding + inserting each batch. Respects
 * `maxMs` time budget — returns truncated=true if cut off.
 *
 * `headOverride` lets callers pin the upper bound (e.g., to avoid
 * indexing blocks newer than `Date.now() - reorg_margin`). If not
 * provided, the indexer fetches the chain head via Etherscan first.
 */
export async function indexSource(opts: {
  chainId: ChainId;
  sourceKey: string;
  startBlockFallback: number; // used if no scan_state row yet (first run)
  maxMs?: number;
  headOverride?: number;
}): Promise<IndexResult> {
  await ensureSchema();
  const source = SOURCES.find((s) => s.key === opts.sourceKey);
  if (!source) throw new Error(`unknown source: ${opts.sourceKey}`);
  const contract = source.contractFor(opts.chainId);
  if (!contract) {
    return {
      chainId: opts.chainId,
      source: opts.sourceKey,
      scannedFrom: 0,
      scannedTo: 0,
      inserted: 0,
      truncated: false,
    };
  }
  const lastBlock = await getLastScanBlock(opts.chainId, contract, opts.sourceKey);
  const fromBlock = lastBlock !== null ? lastBlock + 1 : opts.startBlockFallback;

  // Determine head. Use override or fetch via Etherscan (lightweight).
  const head =
    opts.headOverride ??
    (await (async () => {
      // Cheap eth_blockNumber via Etherscan proxy.
      const key = process.env.ETHERSCAN_API_KEY?.trim();
      if (!key) return null;
      try {
        const url = `https://api.etherscan.io/v2/api?chainid=${opts.chainId}&module=proxy&action=eth_blockNumber&apikey=${key}`;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        return j.result ? parseInt(j.result, 16) : null;
      } catch {
        return null;
      }
    })());
  if (head === null) {
    return {
      chainId: opts.chainId,
      source: opts.sourceKey,
      scannedFrom: fromBlock,
      scannedTo: fromBlock,
      inserted: 0,
      truncated: false,
    };
  }
  if (fromBlock > head) {
    return {
      chainId: opts.chainId,
      source: opts.sourceKey,
      scannedFrom: fromBlock,
      scannedTo: head,
      inserted: 0,
      truncated: false,
    };
  }

  const deadline = opts.maxMs ? Date.now() + opts.maxMs : Number.POSITIVE_INFINITY;
  let cursor = fromBlock;
  let inserted = 0;
  let truncated = false;

  while (cursor <= head) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    const chunkEnd = Math.min(cursor + CHUNK_SIZE - 1, head);
    const logs = await getLogsPaginated({
      chainId: opts.chainId,
      address: contract,
      fromBlock: cursor,
      toBlock: chunkEnd,
      topic0: source.topic0,
    });
    if (logs === null) {
      // Etherscan failure — break and report progress; next trigger retries.
      truncated = true;
      break;
    }
    for (const log of logs) {
      try {
        await source.insert(opts.chainId, log);
        inserted += 1;
      } catch (e: any) {
        // Single-row insert failure shouldn't kill the whole batch.
        console.warn(
          `[indexer] insert failed for ${opts.sourceKey} log ${log.transactionHash}: ${e.message?.slice(0, 120)}`
        );
      }
    }
    await setScanState(opts.chainId, contract, opts.sourceKey, chunkEnd);
    cursor = chunkEnd + 1;
  }

  return {
    chainId: opts.chainId,
    source: opts.sourceKey,
    scannedFrom: fromBlock,
    scannedTo: Math.min(cursor - 1, head),
    inserted,
    truncated,
  };
}

/**
 * Index all sources for one chain in series. Sources iterate sequentially
 * so a stuck source can't starve the others — each one reads its own
 * scan_state and advances independently.
 */
export async function indexChain(opts: {
  chainId: ChainId;
  startBlockFallback: number;
  maxMs?: number;
  sourceKeys?: string[]; // optional filter
}): Promise<IndexResult[]> {
  const keys = opts.sourceKeys ?? SOURCES.map((s) => s.key);
  const out: IndexResult[] = [];
  const deadline = opts.maxMs ? Date.now() + opts.maxMs : Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const remaining = Math.max(1000, deadline - Date.now());
    out.push(
      await indexSource({
        chainId: opts.chainId,
        sourceKey: key,
        startBlockFallback: opts.startBlockFallback,
        maxMs: remaining,
      })
    );
    if (Date.now() > deadline) break;
  }
  return out;
}

/** Convenience helper for the trigger endpoint. */
export function listSources(): string[] {
  return SOURCES.map((s) => s.key);
}

export { SUPPORTED_CHAINS, etherscanConfigured };
