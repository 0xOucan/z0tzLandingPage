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
import { decodeEventLog, keccak256, toBytes, type AbiEvent, type Address } from "viem";
import {
  ENTRYPOINT_USEROP_EVENT,
  ACCOUNT_CREATED_EVENT,
  SWEEPER_PRIVATE_SWEEP,
  LEDGER_REGISTERED,
  LEDGER_CREDITED,
  LEDGER_SPENT,
  LEDGER_ROTATED,
  VAULT_TRANSFERRED_OUT,
  ERC20_TRANSFER,
  CCTP_DEPOSIT_FOR_BURN,
  CCTP_TOKEN_MESSENGER_V2,
  USDC_UNDERLYING,
  resolveChainContracts,
  type ChainId,
  SUPPORTED_CHAINS,
} from "./contracts";
import { getLogsPaginated, isConfigured as etherscanConfigured, type EtherscanLog } from "./etherscan";
import {
  client,
  ensureSchema,
  getLastScanBlock,
  setScanState,
  getFollowupCursor,
  setFollowupCursor,
  getStealthWatchlist,
} from "./turso";

// 1M blocks per scan chunk. Etherscan getLogs returns up to 1000 logs per
// call regardless of block range, so for our narrow Z0tz-contract filters
// (typically 0-100 events per 1M blocks of arb) we get away with one
// call per chunk. Smaller chunks just multiply the rate-limited Etherscan
// calls without improving coverage, which is what was causing 60s
// function-timeout on the first backfill.
const CHUNK_SIZE = 1_000_000;

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
  erc20Transfer: topic0(ERC20_TRANSFER),
  cctpDepositForBurn: topic0(CCTP_DEPOSIT_FOR_BURN),
};

/** Zero-pad a 20-byte address into a 32-byte indexed-topic hex value. */
function padAddressTopic(addr: string): `0x${string}` {
  return ("0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as `0x${string}`;
}

// ─── Source registry ────────────────────────────────────────────────────
// Each entry maps an event-source identifier to (a) the abi (b) how to
// resolve the contract address per chain (c) how to insert rows.

type EventSource = {
  key: string; // unique within (chainId,contract)
  contractFor: (chainId: ChainId) => `0x${string}` | undefined;
  abi: AbiEvent;
  topic0: string;
  insert: (chainId: ChainId, log: EtherscanLog) => Promise<void>;
  /**
   * Optional indexed-topic filter beyond topic0. For EntryPoint we want
   * to filter by paymaster (topic3) so we only see Z0tz-sponsored
   * UserOps. Function receives the chain so it can resolve a per-chain
   * filter value. Return undefined to disable extra filtering.
   */
  extraTopic?: {
    topicIndex: 1 | 2 | 3;
    valueFor: (chainId: ChainId) => `0x${string}` | undefined;
  };
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

// EntryPoint with paymaster filter — UserOperationEvent's topic3 is the
// paymaster address. Filtering by Z0tz's paymaster narrows from "every
// UserOp on chain" (~5K/1M blocks on base) down to "only Z0tz-sponsored
// ops" (~10-100/1M blocks). That's tractable for indexing.
const ENTRYPOINT_USEROP_SOURCE: EventSource = {
  key: "EntryPoint.UserOperationEvent",
  contractFor: (c) => resolveChainContracts(c).entryPoint,
  abi: ENTRYPOINT_USEROP_EVENT,
  topic0: TOPIC0.entrypointUserOp,
  extraTopic: {
    topicIndex: 3,
    valueFor: (c) => {
      const pm = resolveChainContracts(c).paymaster;
      if (!pm) return undefined;
      // Zero-pad address to 32 bytes for topic encoding.
      return ("0x" + pm.toLowerCase().slice(2).padStart(64, "0")) as `0x${string}`;
    },
  },
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
};

const SOURCES: EventSource[] = [
  ENTRYPOINT_USEROP_SOURCE,
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

  // Determine head. Prefer caller-provided override (lets indexChain share
  // one head fetch across all 8 parallel sources — otherwise they each
  // race Etherscan for eth_blockNumber and most get rate-limited back to
  // NaN, which silently zeroes their scan range).
  const head = opts.headOverride ?? (await fetchChainHead(opts.chainId));
  if (head === null || Number.isNaN(head)) {
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
  const t0 = Date.now();
  let cursor = fromBlock;
  let inserted = 0;
  let truncated = false;

  console.info(
    `[indexer] start ${opts.sourceKey} chain=${opts.chainId} from=${fromBlock} head=${head} budgetMs=${opts.maxMs ?? "∞"}`
  );

  while (cursor <= head) {
    if (Date.now() > deadline) {
      truncated = true;
      console.warn(
        `[indexer] DEADLINE ${opts.sourceKey} cursor=${cursor} head=${head} after=${Date.now() - t0}ms inserted=${inserted}`
      );
      break;
    }
    const chunkEnd = Math.min(cursor + CHUNK_SIZE - 1, head);
    const chunkStart = Date.now();
    const extraTopicVal = source.extraTopic?.valueFor(opts.chainId);
    const logs = await getLogsPaginated({
      chainId: opts.chainId,
      address: contract,
      fromBlock: cursor,
      toBlock: chunkEnd,
      topic0: source.topic0,
      // Pass the source's optional indexed-topic filter. For EntryPoint
      // this narrows to UserOps sponsored by our paymaster only.
      ...(extraTopicVal && source.extraTopic
        ? { [`topic${source.extraTopic.topicIndex}`]: extraTopicVal }
        : {}),
      maxPages: 5,
      deadline,
    });
    console.info(
      `[indexer] chunk ${opts.sourceKey} ${cursor}-${chunkEnd} took ${Date.now() - chunkStart}ms (${logs?.length ?? "null"} logs)`
    );
    if (logs === null) {
      // Etherscan failure — break and report progress; next trigger retries.
      truncated = true;
      break;
    }
    // Concurrent inserts — sequential INSERTs over 4000+ logs (EntryPoint
    // on a high-volume chunk) take ~5ms each, ~20s total. Concurrent
    // inserts pipeline the SQL roundtrips and Turso handles concurrent
    // writes well. PRIMARY KEY uniqueness means duplicates collapse.
    const settled = await Promise.allSettled(
      logs.map((log) => source.insert(opts.chainId, log))
    );
    for (const r of settled) {
      if (r.status === "fulfilled") inserted += 1;
      else
        console.warn(
          `[indexer] insert failed for ${opts.sourceKey}: ${r.reason?.message?.slice(0, 120) ?? r.reason}`
        );
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
 * Single head-fetch helper. Goes through fetchV2's rate limiter so
 * parallel callers from indexChain don't fight Etherscan's per-IP cap.
 */
async function fetchChainHead(chainId: number): Promise<number | null> {
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  if (!key) return null;
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=proxy&action=eth_blockNumber&apikey=${key}`;
    // Skip the rate-limited fetchV2 path because head fetches are
    // infrequent (once per indexChain call) and we'd rather get the
    // raw response without retry-on-empty (eth_blockNumber returns
    // status=undefined, not Etherscan's {status,message,result} shape).
    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json();
    if (typeof j?.result === "string" && j.result.startsWith("0x")) {
      const n = parseInt(j.result, 16);
      if (Number.isFinite(n)) return n;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Index all sources for one chain in PARALLEL. Each source has its own
 * scan_state row and an independent SQL table, so concurrent inserts
 * don't conflict.
 *
 * Why parallel: the sequential version starved later sources. If
 * EntryPoint.UserOperationEvent takes 50s of the 50s budget, the other
 * 7 sources never run on that call — and the next trigger call resumes
 * EntryPoint, so other sources stay starved forever.
 *
 * With parallel execution every source gets the same wall-clock budget
 * and advances by however many chunks fit. Low-volume sources finish
 * in seconds; high-volume ones get cut off and resume on the next call.
 * Etherscan's per-IP rate limit is enforced by the in-process rate
 * limiter in etherscan.ts, so parallel callers don't blow the cap —
 * they just take turns through the gate.
 */
export async function indexChain(opts: {
  chainId: ChainId;
  startBlockFallback: number;
  maxMs?: number;
  sourceKeys?: string[]; // optional filter
}): Promise<IndexResult[]> {
  const keys = opts.sourceKeys ?? SOURCES.map((s) => s.key);
  // Single head fetch shared by all 8 sources. Without this every source
  // fetches its own head in parallel — Etherscan rate-limits most of
  // them to NaN and they silently return zero results.
  const sharedHead = await fetchChainHead(opts.chainId);
  // allSettled so one slow/erroring source can't reject the whole batch
  // before others get to report their progress.
  const settled = await Promise.allSettled(
    keys.map((key) =>
      indexSource({
        chainId: opts.chainId,
        sourceKey: key,
        startBlockFallback: opts.startBlockFallback,
        maxMs: opts.maxMs,
        headOverride: sharedHead ?? undefined,
      })
    )
  );
  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          chainId: opts.chainId,
          source: keys[i],
          scannedFrom: 0,
          scannedTo: 0,
          inserted: 0,
          truncated: true,
        }
  );
}

/** Convenience helper for the trigger endpoint. */
export function listSources(): string[] {
  return SOURCES.map((s) => s.key);
}

// ─── Stealth-followup scanner (USDC.Transfer + CCTP.DepositForBurn) ─────
//
// CCTP is a public protocol — TokenMessengerV2 fires 100s of burns/day per
// chain that have nothing to do with Z0tz. Similarly, USDC.Transfer is
// completely chain-wide volume. We don't index either globally.
//
// Instead, after Tier-1 (sweeper/vault/ledger/factory) finds new Z0tz
// addresses (ephemeral stealths created by vault unshields + deployed
// smart accounts), this scanner walks each NEW address through Etherscan
// with topic1 (USDC from) / topic2 (CCTP depositor) set to that one
// address. Per-address scans are tiny (1-2 logs each), so even 100s of
// stealths fit in a single trigger call.

export type FollowupResult = {
  chainId: number;
  scanned: number; // addresses scanned this call
  usdcInserted: number;
  cctpInserted: number;
  truncated: boolean;
};

/**
 * Scan USDC.Transfer + CCTP.DepositForBurn for every stealth in the
 * watchlist that doesn't yet have a saturated followup cursor.
 *
 * Each per-stealth scan is cheap (~2 Etherscan calls, narrow address
 * filter, almost always <10 logs). The loop respects the same time
 * budget as Tier 1 — if we run out, the unstilled stealths get picked
 * up on the next trigger.
 */
export async function indexStealthFollowups(opts: {
  chainId: ChainId;
  maxMs?: number;
}): Promise<FollowupResult> {
  await ensureSchema();
  const t0 = Date.now();
  const deadline = opts.maxMs ? t0 + opts.maxMs : Number.POSITIVE_INFINITY;

  const sharedHead = await fetchChainHead(opts.chainId);
  if (sharedHead === null || Number.isNaN(sharedHead)) {
    return { chainId: opts.chainId, scanned: 0, usdcInserted: 0, cctpInserted: 0, truncated: false };
  }

  const watchlist = await getStealthWatchlist(opts.chainId);
  const usdc = USDC_UNDERLYING[opts.chainId];
  let scanned = 0;
  let usdcInserted = 0;
  let cctpInserted = 0;
  let truncated = false;

  console.info(
    `[followup] start chain=${opts.chainId} watchlist=${watchlist.length} budgetMs=${opts.maxMs ?? "∞"}`
  );

  for (const w of watchlist) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    const result = await scanOneStealth({
      chainId: opts.chainId,
      address: w.address,
      firstSeenBlock: w.firstSeenBlock,
      head: sharedHead,
      usdcAddress: usdc,
      deadline,
    });
    scanned += 1;
    usdcInserted += result.usdcInserted;
    cctpInserted += result.cctpInserted;
  }

  console.info(
    `[followup] done chain=${opts.chainId} scanned=${scanned}/${watchlist.length} usdc+${usdcInserted} cctp+${cctpInserted} truncated=${truncated} (${Date.now() - t0}ms)`
  );

  return { chainId: opts.chainId, scanned, usdcInserted, cctpInserted, truncated };
}

/**
 * Scan one stealth/account for both event types. Skips event types whose
 * cursor is already at head. Inserts directly via INSERT OR IGNORE.
 */
async function scanOneStealth(opts: {
  chainId: ChainId;
  address: string;
  firstSeenBlock: number;
  head: number;
  usdcAddress: Address | undefined;
  deadline: number;
}): Promise<{ usdcInserted: number; cctpInserted: number }> {
  const padded = padAddressTopic(opts.address);
  let usdcInserted = 0;
  let cctpInserted = 0;

  // ─── USDC.Transfer where from = address (cashout counterparty) ────────
  // We only need the "from" side: cashout flows always have the ephemeral
  // stealth as `from`, and the smart account's own outgoing transfers as
  // `from`. The "to" side is captured implicitly by sweep_events
  // (cash-in) and vault_transferred_out (unshield), so re-indexing it
  // would be redundant.
  if (opts.usdcAddress) {
    const cursor =
      (await getFollowupCursor(opts.chainId, opts.address, "usdc_transfer")) ??
      opts.firstSeenBlock;
    if (cursor < opts.head && Date.now() < opts.deadline) {
      const logs = await getLogsPaginated({
        chainId: opts.chainId,
        address: opts.usdcAddress,
        fromBlock: cursor,
        toBlock: opts.head,
        topic0: TOPIC0.erc20Transfer,
        topic1: padded, // from = stealth
        maxPages: 3,
        deadline: opts.deadline,
      });
      if (logs) {
        const settled = await Promise.allSettled(
          logs.map((log) => insertUsdcTransfer(opts.chainId, opts.usdcAddress!, log))
        );
        usdcInserted = settled.filter((r) => r.status === "fulfilled").length;
        await setFollowupCursor(opts.chainId, opts.address, "usdc_transfer", opts.head);
      }
    }
  }

  // ─── CCTP.DepositForBurn where depositor = address ────────────────────
  // depositor is topic2 (indexed param #2: burnToken topic1, depositor topic2,
  // minFinalityThreshold topic3).
  const cctpCursor =
    (await getFollowupCursor(opts.chainId, opts.address, "cctp_burn")) ??
    opts.firstSeenBlock;
  if (cctpCursor < opts.head && Date.now() < opts.deadline) {
    const logs = await getLogsPaginated({
      chainId: opts.chainId,
      address: CCTP_TOKEN_MESSENGER_V2,
      fromBlock: cctpCursor,
      toBlock: opts.head,
      topic0: TOPIC0.cctpDepositForBurn,
      topic2: padded, // depositor = stealth
      maxPages: 3,
      deadline: opts.deadline,
    });
    if (logs) {
      const settled = await Promise.allSettled(
        logs.map((log) => insertCctpBurn(opts.chainId, log))
      );
      cctpInserted = settled.filter((r) => r.status === "fulfilled").length;
      await setFollowupCursor(opts.chainId, opts.address, "cctp_burn", opts.head);
    }
  }

  return { usdcInserted, cctpInserted };
}

async function insertUsdcTransfer(
  chainId: ChainId,
  tokenAddress: string,
  log: EtherscanLog
): Promise<void> {
  const decoded = decodeEventLog({
    abi: [ERC20_TRANSFER],
    data: log.data as `0x${string}`,
    topics: log.topics as any,
  });
  const a = decoded.args as any;
  await client().execute({
    sql: `INSERT OR IGNORE INTO usdc_transfers
          (chain_id, tx_hash, log_index, block_number, block_timestamp,
           token_address, from_address, to_address, value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      chainId,
      log.transactionHash,
      hexToNum(log.logIndex),
      hexToNum(log.blockNumber),
      hexToNum(log.timeStamp),
      tokenAddress.toLowerCase(),
      (a.from as string).toLowerCase(),
      (a.to as string).toLowerCase(),
      (a.value as bigint).toString(),
    ],
  });
}

async function insertCctpBurn(chainId: ChainId, log: EtherscanLog): Promise<void> {
  const decoded = decodeEventLog({
    abi: [CCTP_DEPOSIT_FOR_BURN],
    data: log.data as `0x${string}`,
    topics: log.topics as any,
  });
  const a = decoded.args as any;
  await client().execute({
    sql: `INSERT OR IGNORE INTO cctp_burns
          (chain_id, tx_hash, log_index, block_number, block_timestamp,
           token_messenger, burn_token, amount, depositor, mint_recipient,
           destination_domain)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      chainId,
      log.transactionHash,
      hexToNum(log.logIndex),
      hexToNum(log.blockNumber),
      hexToNum(log.timeStamp),
      CCTP_TOKEN_MESSENGER_V2.toLowerCase(),
      (a.burnToken as string).toLowerCase(),
      (a.amount as bigint).toString(),
      (a.depositor as string).toLowerCase(),
      a.mintRecipient as string,
      Number(a.destinationDomain),
    ],
  });
}

export { SUPPORTED_CHAINS, etherscanConfigured };
