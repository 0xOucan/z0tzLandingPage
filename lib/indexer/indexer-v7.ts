/**
 * V7 indexer — scans the V7 contracts' events into the Turso v7 tables for
 * fast history reconstruction + recovery discovery. Reuses the v6.5
 * log-fetch infra (getLogsPaginated, with RPC fallback). Indexes ONLY public
 * on-chain data (commitments, routing, amounts that are already public);
 * never any secret.
 */
import { createPublicClient, decodeEventLog, parseAbiItem, toEventSelector, pad, type AbiEvent, type Address } from "viem";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { getLogsPaginated, type EtherscanLog } from "./etherscan";
import { makeTransport } from "../relayer/rpc";
import * as db from "./turso-v7";
import type { V7Deployment } from "../relayer/v7";

const EV = {
  credited: parseAbiItem("event CreditedFromVault(address indexed account, address indexed token, uint64 netAmount)") as AbiEvent,
  spent: parseAbiItem("event Spent(address indexed account, address indexed token, uint8 action, address dest, uint32 destChainId)") as AbiEvent,
  methodEnabled: parseAbiItem("event MethodEnabled(address indexed account, uint8 indexed kind, uint256 methodIndex)") as AbiEvent,
  methodDisabled: parseAbiItem("event MethodDisabled(address indexed account, uint8 indexed kind, uint256 methodIndex)") as AbiEvent,
  recoveryInitiated: parseAbiItem("event RecoveryInitiated(uint256 indexed recoveryId, address indexed account, uint8 indexed kind, uint256 newOwnerX, uint256 newOwnerY, uint64 executeAfter)") as AbiEvent,
  recoveryExecuted: parseAbiItem("event RecoveryExecuted(uint256 indexed recoveryId, address indexed account, uint64 newEpoch)") as AbiEvent,
  nameClaimed: parseAbiItem("event NameClaimed(bytes32 indexed nameHash, bytes32 indexed pubkeyHash, address indexed resolvedAccount, bool isSubdomainRoot)") as AbiEvent,
  subdomainClaimed: parseAbiItem("event SubdomainClaimed(bytes32 indexed parentNameHash, bytes32 indexed leafNameHash, bytes32 indexed pubkeyHash, address resolvedAccount)") as AbiEvent,
  claimed: parseAbiItem("event Claimed(bytes32 indexed pubkeyHash, address indexed account, uint256 amount)") as AbiEvent,
  feeRecorded: parseAbiItem("event FeeRecorded(address indexed account, bytes32 indexed opKind, address indexed token, uint64 baseAmount, uint64 protocolFee, uint64 gasReimbursed, uint64 timestamp)") as AbiEvent,
  transfer: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)") as AbiEvent,
  // ── Tezcatli vault (defi/tezcatli) ──────────────────────────────────────
  // Exact signatures from TezcatliVaultV7.sol — the prompt's preliminary
  // shapes were slightly off; these are what's actually emitted on-chain.
  tezDeposited: parseAbiItem("event Deposited(address indexed sender, address indexed beneficiary, address indexed token, uint256 assets, uint256 sharesMinted, uint8 lockOption, uint64 withdrawUnlockAt)") as AbiEvent,
  tezWithdrawn: parseAbiItem("event Withdrawn(address indexed owner, address indexed recipient, address indexed token, uint256 shares, uint256 grossAssets, uint256 feeAssets, uint256 netAssets, uint16 feeBps)") as AbiEvent,
  tezStrategyDeployed: parseAbiItem("event StrategyDeployed(address indexed token, address indexed adapter, uint256 assets, uint256 sharesOut)") as AbiEvent,
  tezStrategyRedeemed: parseAbiItem("event StrategyRedeemed(address indexed token, address indexed adapter, uint256 sharesIn, uint256 assetsOut)") as AbiEvent,
  tezYieldFeeRouted: parseAbiItem("event YieldFeeRouted(address indexed token, uint256 feeAmount, bool treasuryOk)") as AbiEvent,
  tezStrategyValuationStale: parseAbiItem("event StrategyValuationStale(address indexed token, address indexed adapter)") as AbiEvent,
  // ── Audit-fix events (post-audit V7 contracts) ───────────────────────
  // Ledger: multisend rows that the contract skipped (e.g. budget-cap hit,
  // mismatched destination). Surfaced for ops / user-facing failure UX.
  ledgerMultisendSkipped: parseAbiItem("event MultisendRowSkipped(uint256 indexed rowIndex, string reason)") as AbiEvent,
  // Sweeper V7: PrivateSweep gained a trailing `bool feeSettled` so ops can
  // distinguish "fee paid synchronously" from "fee deferred" sweeps. Plus a
  // dedicated FeeTransferFailed alert event when the fee leg reverts.
  sweeperPrivateSweep: parseAbiItem("event PrivateSweep(address indexed stealthAddress, address indexed token, address indexed account, uint256 amount, uint256 fee, bool feeSettled)") as AbiEvent,
  sweeperFeeTransferFailed: parseAbiItem("event FeeTransferFailed(address indexed token, uint256 amount, string reason)") as AbiEvent,
  // Internal bridge: expiry + opaque-mint + unknown-source alerts. burnNonce
  // matches the new uint64 binding in InternalMessage / BurnMessage.
  bridgeIntentExpired: parseAbiItem("event IntentExpired(bytes32 indexed intentId)") as AbiEvent,
  bridgePendingMintRecorded: parseAbiItem("event PendingMintRecorded(uint64 indexed burnNonce, uint256 amount)") as AbiEvent,
  bridgeUnknownRemote: parseAbiItem("event UnknownRemoteBridge(uint32 indexed sourceDomain, uint64 nonce)") as AbiEvent,
  // Yield strategy + timed vault: capped-mint signals (requested vs minted).
  yieldCapped: parseAbiItem("event YieldCapped(address indexed account, uint64 requested, uint64 minted)") as AbiEvent,
  timedMintCapHit: parseAbiItem("event MintCapHit(uint256 indexed positionId, uint64 requested, uint64 minted)") as AbiEvent,
} as const;

interface LogMeta { block: number; ts: number; txHash: string; logIndex: number; }

interface Source {
  key: string;
  address: Address;
  event: AbiEvent;
  handle: (args: any, m: LogMeta, chainId: number) => Promise<void>;
}

function chainFor(chainId: number) {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    case 31337: return hardhat;
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

async function headBlock(chainId: number): Promise<number> {
  // Use the shared RPC pool with viem `fallback` transport — same path the
  // relayer uses. If the env-pinned URL goes down, viem auto-rotates to the
  // curated pool fallbacks instead of failing the whole scan.
  const rpc = process.env[`RPC_URL_${chainId}`] ?? "";
  const pub = createPublicClient({ chain: chainFor(chainId), transport: makeTransport(rpc) });
  return Number(await pub.getBlockNumber());
}

function sources(d: V7Deployment): Source[] {
  const c = db.client();
  const arr: Source[] = [
    { key: "ledger.Credited", address: d.ledger, event: EV.credited, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO credit_events_v7 (chain_id, account, token, net_amount, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.account).toLowerCase(), String(a.token).toLowerCase(), String(a.netAmount), m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "ledger.Spent", address: d.ledger, event: EV.spent, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO ledger_events_v7 (chain_id, account, token, action, dest, dest_chain, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.account).toLowerCase(), String(a.token).toLowerCase(), Number(a.action), String(a.dest).toLowerCase(), Number(a.destChainId), m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "hub.MethodEnabled", address: d.recoveryHub, event: EV.methodEnabled, handle: async (a, m, chainId) => recEvent(c, chainId, a.account, "MethodEnabled", m, { kind: Number(a.kind), methodIndex: Number(a.methodIndex) }) },
    { key: "hub.MethodDisabled", address: d.recoveryHub, event: EV.methodDisabled, handle: async (a, m, chainId) => recEvent(c, chainId, a.account, "MethodDisabled", m, { kind: Number(a.kind), methodIndex: Number(a.methodIndex) }) },
    { key: "hub.RecoveryInitiated", address: d.recoveryHub, event: EV.recoveryInitiated, handle: async (a, m, chainId) => recEvent(c, chainId, a.account, "RecoveryInitiated", m, { kind: Number(a.kind), recoveryId: String(a.recoveryId) }) },
    { key: "hub.RecoveryExecuted", address: d.recoveryHub, event: EV.recoveryExecuted, handle: async (a, m, chainId) => recEvent(c, chainId, a.account, "RecoveryExecuted", m, { recoveryId: String(a.recoveryId) }) },
    { key: "names.NameClaimed", address: d.nameRegistry, event: EV.nameClaimed, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR REPLACE INTO name_records_v7 (chain_id, name_hash, pubkey_hash, resolved_account, parent_name_hash, is_subdomain_root, block, tx_hash, ts) VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [chainId, a.nameHash, a.pubkeyHash, String(a.resolvedAccount).toLowerCase(), null, a.isSubdomainRoot ? 1 : 0, m.block, m.txHash, m.ts] }); } },
    { key: "names.SubdomainClaimed", address: d.nameRegistry, event: EV.subdomainClaimed, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR REPLACE INTO name_records_v7 (chain_id, name_hash, pubkey_hash, resolved_account, parent_name_hash, is_subdomain_root, block, tx_hash, ts) VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [chainId, a.leafNameHash, a.pubkeyHash, String(a.resolvedAccount).toLowerCase(), a.parentNameHash, 0, m.block, m.txHash, m.ts] }); } },
    { key: "airdrop.Claimed", address: d.airdropClaim, event: EV.claimed, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO airdrop_claims_v7 (chain_id, pubkey_hash, account, amount, block, tx_hash, ts) VALUES (?,?,?,?,?,?,?)`,
        args: [chainId, a.pubkeyHash, String(a.account).toLowerCase(), String(a.amount), m.block, m.txHash, m.ts] }); } },
    // Fee accounting (FeeRecorded) — emitted by the ledger when ops settle
    // protocol fee + gas reimbursement. opKind is a bytes32 tag (e.g.
    // keccak256("CASHOUT")). The break-even dashboard reads from here.
    { key: "ledger.FeeRecorded", address: d.ledger, event: EV.feeRecorded, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO fee_events_v7 (chain_id, account, op_kind, base_amount, protocol_fee, gas_reimbursed, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.account).toLowerCase(), String(a.opKind), String(a.baseAmount), String(a.protocolFee), String(a.gasReimbursed), m.block, m.txHash, m.logIndex, m.ts] }); } },
    // ── Tezcatli yield vault — only registered when the chain has it. ──
    // `account` = beneficiary (deposit) / owner (withdraw); strategy events
    // are vault-wide so we store account = vault address as a sentinel.
    { key: "tezcatli.Deposited", address: d.tezcatliVault as Address, event: EV.tezDeposited, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO tezcatli_events_v7 (chain_id, account, token, kind, shares, assets, fee, fee_bps, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.beneficiary).toLowerCase(), String(a.token).toLowerCase(), "deposit", String(a.sharesMinted), String(a.assets), "0", 0, m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "tezcatli.Withdrawn", address: d.tezcatliVault as Address, event: EV.tezWithdrawn, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO tezcatli_events_v7 (chain_id, account, token, kind, shares, assets, fee, fee_bps, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.owner).toLowerCase(), String(a.token).toLowerCase(), "withdraw", String(a.shares), String(a.netAssets), String(a.feeAssets), Number(a.feeBps), m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "tezcatli.StrategyDeployed", address: d.tezcatliVault as Address, event: EV.tezStrategyDeployed, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO tezcatli_events_v7 (chain_id, account, token, kind, shares, assets, fee, fee_bps, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.adapter).toLowerCase(), String(a.token).toLowerCase(), "strategy_deploy", String(a.sharesOut), String(a.assets), "0", 0, m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "tezcatli.StrategyRedeemed", address: d.tezcatliVault as Address, event: EV.tezStrategyRedeemed, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO tezcatli_events_v7 (chain_id, account, token, kind, shares, assets, fee, fee_bps, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.adapter).toLowerCase(), String(a.token).toLowerCase(), "strategy_redeem", String(a.sharesIn), String(a.assetsOut), "0", 0, m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "tezcatli.YieldFeeRouted", address: d.tezcatliVault as Address, event: EV.tezYieldFeeRouted, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO tezcatli_events_v7 (chain_id, account, token, kind, shares, assets, fee, fee_bps, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, "0x0000000000000000000000000000000000000000", String(a.token).toLowerCase(), "fee", "0", "0", String(a.feeAmount), 0, m.block, m.txHash, m.logIndex, m.ts] }); } },
    // ── Audit-fix sources (post-audit V7 contracts) ─────────────────────
    // All of these flow into one append-only `audit_alerts_v7` table keyed
    // by (chain, tx_hash, log_index) — they're rare/structured ops signals,
    // not high-volume user data, so one shared events table beats a fan-out
    // of micro-tables for the dashboards that read them.
    { key: "ledger.MultisendRowSkipped", address: d.ledger, event: EV.ledgerMultisendSkipped, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "ledger.MultisendRowSkipped", d.ledger, { rowIndex: String(a.rowIndex), reason: String(a.reason) }, m) },
    // Sweeper V7 PrivateSweep — note the new `feeSettled` bool (appended
    // field). We surface it as a column so dashboards can split sweeps by
    // whether the fee leg completed synchronously.
    { key: "sweeper.PrivateSweep", address: d.sweeper, event: EV.sweeperPrivateSweep, handle: async (a, m, chainId) => {
      await c.execute({ sql: `INSERT OR IGNORE INTO sweeper_events_v7 (chain_id, stealth_address, token, account, amount, fee, fee_settled, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [chainId, String(a.stealthAddress).toLowerCase(), String(a.token).toLowerCase(), String(a.account).toLowerCase(), String(a.amount), String(a.fee), a.feeSettled ? 1 : 0, m.block, m.txHash, m.logIndex, m.ts] }); } },
    { key: "sweeper.FeeTransferFailed", address: d.sweeper, event: EV.sweeperFeeTransferFailed, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "sweeper.FeeTransferFailed", d.sweeper, { token: String(a.token).toLowerCase(), amount: String(a.amount), reason: String(a.reason) }, m) },
    // Internal bridge — only registered when the deployment carries one.
    { key: "bridge.IntentExpired", address: d.internalBridge as Address, event: EV.bridgeIntentExpired, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "bridge.IntentExpired", d.internalBridge as Address, { intentId: String(a.intentId) }, m) },
    { key: "bridge.PendingMintRecorded", address: d.internalBridge as Address, event: EV.bridgePendingMintRecorded, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "bridge.PendingMintRecorded", d.internalBridge as Address, { burnNonce: String(a.burnNonce), amount: String(a.amount) }, m) },
    { key: "bridge.UnknownRemoteBridge", address: d.internalBridge as Address, event: EV.bridgeUnknownRemote, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "bridge.UnknownRemoteBridge", d.internalBridge as Address, { sourceDomain: Number(a.sourceDomain), nonce: String(a.nonce) }, m) },
    // Yield strategy cap-hit (cap applied at mint time).
    { key: "yield.YieldCapped", address: d.mockYieldStrategy as Address, event: EV.yieldCapped, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "yield.YieldCapped", d.mockYieldStrategy as Address, { account: String(a.account).toLowerCase(), requested: String(a.requested), minted: String(a.minted) }, m) },
    // Timed vault mint-cap hit.
    { key: "timedVault.MintCapHit", address: d.timedVault as Address, event: EV.timedMintCapHit, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "timedVault.MintCapHit", d.timedVault as Address, { positionId: String(a.positionId), requested: String(a.requested), minted: String(a.minted) }, m) },
    // Tezcatli strategy-valuation-stale alert (treated as an audit alert,
    // not a tezcatli_events_v7 row, because it carries no shares/assets).
    { key: "tezcatli.StrategyValuationStale", address: d.tezcatliVault as Address, event: EV.tezStrategyValuationStale, handle: async (a, m, chainId) =>
      auditAlert(c, chainId, "tezcatli.StrategyValuationStale", d.tezcatliVault as Address, { token: String(a.token).toLowerCase(), adapter: String(a.adapter).toLowerCase() }, m) },
  ];
  return arr.filter((s) => Boolean(s.address));
}

/** Append a structured ops/alert row for one of the audit-fix events. The
 *  `payload` is a small JSON object — schemas vary per event, but dashboards
 *  only read a handful of fields per `kind`, so a JSON column is cheaper than
 *  one table per event. Idempotent on (chain, tx_hash, log_index). */
async function auditAlert(
  c: any,
  chainId: number,
  kind: string,
  contract: Address,
  payload: Record<string, unknown>,
  m: LogMeta,
) {
  await c.execute({
    sql: `INSERT OR IGNORE INTO audit_alerts_v7 (chain_id, kind, contract_address, payload, block, tx_hash, log_index, ts) VALUES (?,?,?,?,?,?,?,?)`,
    args: [chainId, kind, String(contract).toLowerCase(), JSON.stringify(payload), m.block, m.txHash, m.logIndex, m.ts],
  });
}

async function recEvent(c: any, chainId: number, account: string, type: string, m: LogMeta, extra: { kind?: number; methodIndex?: number; recoveryId?: string }) {
  await c.execute({
    sql: `INSERT OR IGNORE INTO recovery_events_v7 (chain_id, account, kind, method_index, event_type, commitment, recovery_id, block, tx_hash, ts) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [chainId, String(account).toLowerCase(), extra.kind ?? null, extra.methodIndex ?? null, type, null, extra.recoveryId ?? null, m.block, m.txHash, m.ts],
  });
}

const meta = (l: EtherscanLog): LogMeta => ({
  block: parseInt(l.blockNumber, 16),
  ts: l.timeStamp ? parseInt(l.timeStamp, 16) : 0,
  txHash: l.transactionHash,
  logIndex: parseInt(l.logIndex, 16),
});

/** Scan all V7 sources on a chain into the v7 DB. Idempotent (INSERT OR IGNORE
 *  + per-source scan_state cursor). `maxMs` bounds a serverless invocation. */
export async function indexV7Chain(chainId: number, d: V7Deployment, opts?: { startBlock?: number; maxMs?: number }): Promise<void> {
  await db.ensureSchema();
  const head = await headBlock(chainId);
  const deadline = opts?.maxMs ? Date.now() + opts.maxMs : undefined;
  const startFallback = opts?.startBlock ?? Number(process.env[`DEPLOY_BLOCK_V7_${chainId}`] ?? 0);

  for (const src of sources(d)) {
    if (deadline && Date.now() > deadline) break;
    const last = await db.getLastScanBlock(chainId, src.address, src.key);
    const from = last > 0 ? last + 1 : startFallback;
    if (from > head) continue;
    const logs = await getLogsPaginated({ chainId, address: src.address, fromBlock: from, toBlock: head, topic0: toEventSelector(src.event), deadline });
    for (const l of logs ?? []) {
      try {
        const { args } = decodeEventLog({ abi: [src.event], data: l.data as `0x${string}`, topics: l.topics as any });
        await src.handle(args, meta(l), chainId);
      } catch { /* skip undecodable / mismatched logs */ }
    }
    await db.setScanState(chainId, src.address, src.key, head);
  }
  await indexStealthInbound(chainId, d, { startBlock: startFallback, deadline });
}

/** Deterministic-stealth inbound scan: for every watched stealth, find ERC-20
 *  Transfers TO it on the registered tokens (zUSDC + USDC) and record them so
 *  the GUI/relayer can surface "you received X" without polling. Same address
 *  on every chain, so this runs per-chain across the watchlist. */
export async function indexStealthInbound(chainId: number, d: V7Deployment, opts?: { startBlock?: number; deadline?: number }): Promise<void> {
  await db.ensureSchema();
  const watchlist = await db.getWatchlist();
  if (watchlist.length === 0) return;
  const head = await headBlock(chainId);
  const topic0 = toEventSelector(EV.transfer);
  const tokens = [d.zusdc, d.usdc].filter(Boolean) as Address[];
  const startFallback = opts?.startBlock ?? Number(process.env[`DEPLOY_BLOCK_V7_${chainId}`] ?? 0);

  for (const token of tokens) {
    for (const w of watchlist) {
      if (opts?.deadline && Date.now() > opts.deadline) return;
      const key = `inbound:${w.stealthAddress}`;
      const last = await db.getLastScanBlock(chainId, token, key);
      const from = last > 0 ? last + 1 : startFallback;
      if (from > head) continue;
      const logs = await getLogsPaginated({ chainId, address: token, fromBlock: from, toBlock: head, topic0, topic2: pad(w.stealthAddress as Address, { size: 32 }), deadline: opts?.deadline });
      for (const l of logs ?? []) {
        try {
          const { args } = decodeEventLog({ abi: [EV.transfer], data: l.data as `0x${string}`, topics: l.topics as any });
          const m = meta(l);
          await db.recordInbound({ chainId, stealthAddress: w.stealthAddress, token, from: String((args as any).from), amount: String((args as any).value), block: m.block, txHash: m.txHash, logIndex: m.logIndex, ts: m.ts });
        } catch { /* skip */ }
      }
      await db.setScanState(chainId, token, key, head);
    }
  }
}

// ── Realtime tx-log mirror (single tx fast-path) ─────────────────────────
//
// Every successful submit-X in lib/relayer/v7.ts produces a tx hash. Rather
// than wait for the next cron tick, we fetch that exact tx's receipt + walk
// its logs through the same source registry that the cron uses. Same
// INSERT OR IGNORE inserts ⇒ later cron sweep is a no-op for the same row.
//
// Wire shape matches scheduleNameCacheBackfill in lib/relayer/v7.ts: caller
// fires-and-forgets, errors are swallowed, the relayer response is never
// blocked. scan_state cursor is NOT advanced here — that's the cron's job.
export async function mirrorTxLogsToV7(opts: {
  chainId: number;
  txHash: string;
  deployment: V7Deployment;
}): Promise<void> {
  try {
    await db.ensureSchema();
    const rpc = process.env[`RPC_URL_${opts.chainId}`] ?? "";
    if (!rpc) return;
    const pub = createPublicClient({ chain: chainFor(opts.chainId), transport: makeTransport(rpc) });
    const receipt = await pub.getTransactionReceipt({ hash: opts.txHash as `0x${string}` });
    if (!receipt || receipt.status !== "success") return;
    const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
    const ts = Number(block.timestamp);

    // Build a quick (address|topic0) -> source lookup so we don't iterate
    // the full registry for every log.
    const registry = sources(opts.deployment);
    const index = new Map<string, Source>();
    for (const s of registry) {
      const k = `${String(s.address).toLowerCase()}|${toEventSelector(s.event).toLowerCase()}`;
      index.set(k, s);
    }

    for (const log of receipt.logs) {
      try {
        const t0 = (log.topics?.[0] ?? "").toLowerCase();
        const addr = String(log.address).toLowerCase();
        const src = index.get(`${addr}|${t0}`);
        if (!src) continue;
        const { args } = decodeEventLog({ abi: [src.event], data: log.data as `0x${string}`, topics: log.topics as any });
        const m: LogMeta = {
          block: Number(receipt.blockNumber),
          ts,
          txHash: receipt.transactionHash,
          logIndex: Number(log.logIndex ?? 0),
        };
        await src.handle(args, m, opts.chainId);
      } catch { /* skip undecodable / mismatched logs */ }
    }
  } catch {
    /* best-effort — never throw out of the mirror */
  }
}
