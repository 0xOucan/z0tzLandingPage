/**
 * One-shot backfill for the V7-FINAL #11 name-resolution cache.
 *
 * Reads every NameClaimed / SubdomainClaimed / NameClaimedByAuthority /
 * SubdomainClaimedByAuthority / ResolvedAccountUpdated / RepointedByAuthority
 * / RevokedByAuthority / SubdomainRevoked / NameReleased event from each
 * enabled chain's Z0tzNameRegistry and populates the `name_resolutions`
 * Turso table. Idempotent — re-running just refreshes timestamps.
 *
 * Operator runs this MANUALLY after the V7-final redeploy. It is NOT
 * triggered on every deploy.
 *
 * Required env:
 *   - RPC_URL_<chainId>            for each chain to scan
 *   - DEPLOYMENT_V7_<chainId>      same JSON blob the relayer reads
 *   - TURSO_V7_DATABASE_URL + TURSO_V7_AUTH_TOKEN (or fallback TURSO_*)
 *
 * Optional env:
 *   - BACKFILL_CHAIN_IDS           comma-separated list (defaults to
 *                                  the standard 3 testnets)
 *   - BACKFILL_FROM_BLOCK_<id>     per-chain start block (defaults to 0)
 *   - BACKFILL_RANGE               eth_getLogs page size (default 5000)
 *
 * Usage:
 *   pnpm tsx scripts/backfill-name-resolutions.ts
 */
import { createPublicClient, http, parseEventLogs, type Address, type Hex } from "viem";
import { baseSepolia, sepolia, arbitrumSepolia, hardhat } from "viem/chains";
import { backfillFromReceipt, upsertNameResolution, deactivateNameResolution } from "../lib/relayer/name-cache";

const DEFAULT_CHAIN_IDS = [421614, 84532, 11155111]; // arb / base / eth sepolia
const DEFAULT_RANGE = 5000n;

function chainFor(chainId: number) {
  switch (chainId) {
    case 84532: return baseSepolia;
    case 11155111: return sepolia;
    case 421614: return arbitrumSepolia;
    case 31337: return hardhat;
    default: throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function envOr(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

const namesEventsAbi = [
  { type: "event", name: "NameClaimed", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
    { name: "resolvedAccount", type: "address", indexed: true },
    { name: "isSubdomainRoot", type: "bool" },
  ]},
  { type: "event", name: "SubdomainClaimed", inputs: [
    { name: "parentNameHash", type: "bytes32", indexed: true },
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
    { name: "resolvedAccount", type: "address" },
  ]},
  { type: "event", name: "NameClaimedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "resolvedAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "SubdomainClaimedByAuthority", inputs: [
    { name: "parentNameHash", type: "bytes32", indexed: true },
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "resolvedAccount", type: "address" },
  ]},
  { type: "event", name: "ResolvedAccountUpdated", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "newAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "RepointedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
    { name: "newAccount", type: "address", indexed: true },
  ]},
  { type: "event", name: "RevokedByAuthority", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "authority", type: "address", indexed: true },
  ]},
  { type: "event", name: "SubdomainRevoked", inputs: [
    { name: "leafNameHash", type: "bytes32", indexed: true },
    { name: "parentNameHash", type: "bytes32", indexed: true },
  ]},
  { type: "event", name: "NameReleased", inputs: [
    { name: "nameHash", type: "bytes32", indexed: true },
    { name: "pubkeyHash", type: "bytes32", indexed: true },
  ]},
] as const;

async function scanChain(chainId: number) {
  const rpc = envOr(`RPC_URL_${chainId}`);
  const depRaw = envOr(`DEPLOYMENT_V7_${chainId}`);
  if (!rpc || !depRaw) {
    console.warn(`[${chainId}] missing RPC_URL_${chainId} or DEPLOYMENT_V7_${chainId}; skipping`);
    return;
  }
  const dep = JSON.parse(depRaw) as { nameRegistry: Address };
  const registry = dep.nameRegistry;
  if (!registry) {
    console.warn(`[${chainId}] deployment blob missing nameRegistry; skipping`);
    return;
  }

  const pub = createPublicClient({ chain: chainFor(chainId), transport: http(rpc) });
  const head = await pub.getBlockNumber();
  const start = BigInt(envOr(`BACKFILL_FROM_BLOCK_${chainId}`, "0") ?? "0");
  const range = BigInt(envOr("BACKFILL_RANGE", String(DEFAULT_RANGE)) ?? String(DEFAULT_RANGE));

  console.log(`[${chainId}] scanning ${registry} blocks ${start} -> ${head} (range ${range})`);

  let cursor = start;
  let total = 0;
  while (cursor <= head) {
    const toBlock = cursor + range - 1n > head ? head : cursor + range - 1n;
    const logs = await pub.getLogs({
      address: registry,
      fromBlock: cursor,
      toBlock,
    });
    const parsed = parseEventLogs({ abi: namesEventsAbi, logs });
    for (const log of parsed) {
      const a = (log as any).args ?? {};
      const txHash = log.transactionHash as Hex;
      switch (log.eventName) {
        case "NameClaimed":
        case "NameClaimedByAuthority":
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            resolvedAccount: a.resolvedAccount as Address,
            chainId, txHash, active: true,
          });
          total++; break;
        case "SubdomainClaimed":
        case "SubdomainClaimedByAuthority":
          await upsertNameResolution({
            nameHash: a.leafNameHash as Hex,
            parentNameHash: (a.parentNameHash as Hex) ?? null,
            resolvedAccount: a.resolvedAccount as Address,
            chainId, txHash, active: true,
          });
          total++; break;
        case "ResolvedAccountUpdated":
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            resolvedAccount: a.newAccount as Address,
            chainId, txHash, active: true,
          });
          total++; break;
        case "RepointedByAuthority":
          await upsertNameResolution({
            nameHash: a.nameHash as Hex,
            resolvedAccount: a.newAccount as Address,
            chainId, txHash, active: true,
          });
          total++; break;
        case "RevokedByAuthority":
        case "NameReleased":
          await deactivateNameResolution(a.nameHash as Hex, chainId, txHash);
          total++; break;
        case "SubdomainRevoked":
          await deactivateNameResolution(a.leafNameHash as Hex, chainId, txHash);
          total++; break;
      }
    }
    cursor = toBlock + 1n;
  }
  console.log(`[${chainId}] done — processed ${total} events`);
  void backfillFromReceipt; // re-export keep-alive
}

async function main() {
  const ids = (envOr("BACKFILL_CHAIN_IDS") ?? DEFAULT_CHAIN_IDS.join(","))
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  console.log(`Backfilling name_resolutions for chains: ${ids.join(", ")}`);
  for (const id of ids) {
    try {
      await scanChain(id);
    } catch (e: any) {
      console.error(`[${id}] failed: ${e?.message ?? e}`);
    }
  }
  console.log("backfill complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
