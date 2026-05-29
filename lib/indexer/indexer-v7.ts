/**
 * V7 indexer — scans the V7 contracts' events into the Turso v7 tables for
 * fast history reconstruction + recovery discovery. Reuses the v6.5
 * log-fetch infra (getLogsPaginated, with RPC fallback). Indexes ONLY public
 * on-chain data (commitments, routing, amounts that are already public);
 * never any secret.
 */
import { createPublicClient, http, decodeEventLog, parseAbiItem, toEventSelector, type AbiEvent, type Address } from "viem";
import { baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";
import { getLogsPaginated, type EtherscanLog } from "./etherscan";
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
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

async function headBlock(chainId: number): Promise<number> {
  const rpc = process.env[`RPC_URL_${chainId}`];
  if (!rpc) throw new Error(`Missing RPC_URL_${chainId}`);
  const pub = createPublicClient({ chain: chainFor(chainId), transport: http(rpc) });
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
  ];
  return arr.filter((s) => Boolean(s.address));
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
}
