/**
 * POST /api/strategy-deploy
 *
 * On-deposit trigger for activating the Tezcatli vault's strategy adapter.
 * Called by the Z0tz client (CLI / GUI) after a successful tezcatliDeposit
 * — it reads the vault's idle USDC reserve and, if above threshold, the
 * relayer (= on-chain coordinator) signs and submits
 * `vault.coordinatorDeployToStrategy(adapter, idle, minSharesOut)` to push
 * the deposit into Aave.
 *
 * Idempotent: if there's nothing idle, returns ok with skipped=true.
 * No state — every call is a fresh read.
 *
 * Request body: { chainId: number }
 * Auth:         passkey signature (X-Z0tz-PubX/PubY/Sig headers) — same as
 *               other Z0tz endpoints. Optional in default config; flip
 *               STRATEGY_DEPLOY_REQUIRE_AUTH=1 to enforce.
 *
 * Why an endpoint instead of a Vercel cron:
 *   - The strategy can only earn yield on actual deposits. A 15-min cron
 *     fires regardless and wastes function invocations on empty vaults.
 *   - The client knows exactly when a deposit lands; calling here right
 *     after gives instant deploy with zero waste.
 *   - The route is fully idempotent, so retries / duplicate triggers
 *     from concurrent deposits are safe.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";
import { verifyRelayerAuth } from "@/lib/relayer/auth";
import { makeTransport, primaryRpc } from "@/lib/relayer/rpc";
import { geofenceResponse } from "@/lib/relayer/geofence";
import { triggerIndexScan } from "@/lib/relayer/trigger-indexer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Z0tz-PubX, X-Z0tz-PubY, X-Z0tz-Sig",
};

const CHAINS: Record<number, any> = {
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
};

/**
 * Per-chain Tezcatli vault config. Mirrors `contracts/deployments/defi-vaults.json`
 * — kept inline here so the relayer doesn't need a cross-repo file read at
 * cold start. Skeleton chains (no strategy adapter) are intentionally
 * absent: there's nothing to deploy. Add a chain when its Aave V3 adapter
 * is wired up.
 */
interface VaultDeploy {
  vault: Address;
  tzcUSDC: Address;          // vault.asset() — Tezcatli wrapped USDC
  underlying: Address;       // raw USDC
  adapter: Address;          // Aave V3 strategy adapter
  aToken: Address;           // adapter.aToken — Aave's aUSDC
}

const VAULTS: Record<number, VaultDeploy> = {
  421614: {
    vault:      "0x90638B32b20e7BeDdb5AEFD745bF7a86b78a5A78",
    tzcUSDC:    "0x14655ba23f11FAaBd310703CAc387a69429cb7C8",
    underlying: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    adapter:    "0xfE573D24eca408B9c5fCf066f66BB57081777A55",
    // aToken (Aave V3 USDC on arb-sepolia) — read from adapter.aToken() at
    // runtime in case it changes; this is just a fallback.
    aToken:     "0x0000000000000000000000000000000000000000" as Address,
  },
};

const VAULT_ABI = parseAbi([
  "function coordinatorDeployToStrategy(address adapter, uint64 assets, uint256 minSharesOut) returns (uint256)",
  "function strategyAdapter() view returns (address)",
  "function coordinator() view returns (address)",
]);

const ADAPTER_ABI = parseAbi([
  "function aToken() view returns (address)",
  "function safeTotalManagedAssets() view returns (uint256, bool)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

/** Threshold below which we skip the deploy. Default 0.5 USDC — small enough
 *  that demo flows always trip it, big enough that gas costs aren't a
 *  rounding error against the deployed amount. Override via env. */
const THRESHOLD_USDC_WEI = BigInt(process.env.STRATEGY_DEPLOY_THRESHOLD ?? "500000");

/** Cap per single call. Default 1,000 USDC. Protects against a runaway
 *  call deploying more than the vault should expose to one tx, and ensures
 *  the riskPolicy's deployment-rate guards never trip on a single deposit
 *  burst. Override via env. */
const CAP_USDC_WEI = BigInt(process.env.STRATEGY_DEPLOY_CAP ?? "1000000000");

/** Slippage tolerance for `minSharesOut`. Aave V3 supply is effectively 1:1
 *  (no curve, no AMM), so 1% is wildly conservative — but cheap insurance
 *  against an Aave config change. */
const SLIPPAGE_BPS = BigInt(process.env.STRATEGY_DEPLOY_SLIPPAGE_BPS ?? "100"); // 100 = 1%

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const blocked = geofenceResponse(req, corsHeaders);
  if (blocked) return blocked;

  try {
    const rawBody = await req.json();
    const hdrs: Record<string, string | undefined> = {
      "x-z0tz-pubx": req.headers.get("x-z0tz-pubx") ?? undefined,
      "x-z0tz-puby": req.headers.get("x-z0tz-puby") ?? undefined,
      "x-z0tz-sig":  req.headers.get("x-z0tz-sig")  ?? undefined,
    };
    const requireAuth = process.env.STRATEGY_DEPLOY_REQUIRE_AUTH === "1";
    const auth = verifyRelayerAuth(hdrs, rawBody, requireAuth);
    if (!auth.authenticated) {
      return NextResponse.json({ ok: false, error: auth.error ?? "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { chainId } = rawBody;
    if (typeof chainId !== "number") {
      return NextResponse.json({ ok: false, error: "Missing chainId" }, { status: 400, headers: corsHeaders });
    }
    const chain = CHAINS[chainId];
    const cfg   = VAULTS[chainId];
    if (!chain || !cfg) {
      return NextResponse.json({ ok: false, skipped: true, reason: `No strategy vault on chain ${chainId}` }, { status: 200, headers: corsHeaders });
    }

    const relayerKey = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
    if (!relayerKey) {
      return NextResponse.json({ ok: false, error: "Relayer not configured" }, { status: 500, headers: corsHeaders });
    }

    const account = privateKeyToAccount(relayerKey);
    const rpc = primaryRpc(chainId);
    const client = createPublicClient({ chain, transport: makeTransport(rpc) });
    const wallet = createWalletClient({ account, chain, transport: makeTransport(rpc) });

    // Sanity: this relayer key is the on-chain coordinator. If the vault
    // was redeployed and the coordinator rotated, the deploy call would
    // revert with UnauthorizedCoordinator — fail fast with a useful error.
    const onChainCoordinator = await client.readContract({
      address: cfg.vault, abi: VAULT_ABI, functionName: "coordinator",
    }) as Address;
    if (onChainCoordinator.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({
        ok: false,
        error: `Coordinator mismatch on chain ${chainId}: vault expects ${onChainCoordinator}, relayer is ${account.address}. Run vault.setCoordinator(relayer) or rotate RELAYER_PRIVATE_KEY.`,
      }, { status: 500, headers: corsHeaders });
    }

    // The configured adapter on the vault is the source of truth — env/
    // hard-coded values are just a heuristic to know we're on the right
    // path. Always use the on-chain value for the deploy call.
    const onChainAdapter = await client.readContract({
      address: cfg.vault, abi: VAULT_ABI, functionName: "strategyAdapter",
    }) as Address;
    if (onChainAdapter === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ ok: false, skipped: true, reason: "vault has no strategy adapter" }, { status: 200, headers: corsHeaders });
    }

    // Resolve aToken from the adapter so we don't drift if Aave changes
    // its USDC aToken address on a redeploy.
    const aToken = await client.readContract({
      address: onChainAdapter, abi: ADAPTER_ABI, functionName: "aToken",
    }) as Address;

    // Idle = USDC the wrapper holds minus what's already in Aave.
    // `tzcUSDC` is dedicated to this Tezcatli vault (not shared with the
    // Z0tz V6.5 ledger's `wrappedUsdcV5`), so the wrapper's reserve maps
    // 1:1 to deposits the vault has accepted.
    const [wrapperReserve, alreadyDeployed] = await Promise.all([
      client.readContract({ address: cfg.underlying, abi: ERC20_ABI, functionName: "balanceOf", args: [cfg.tzcUSDC] }) as Promise<bigint>,
      client.readContract({ address: aToken,         abi: ERC20_ABI, functionName: "balanceOf", args: [onChainAdapter] }) as Promise<bigint>,
    ]);

    let idle = wrapperReserve > alreadyDeployed ? wrapperReserve - alreadyDeployed : 0n;
    if (idle < THRESHOLD_USDC_WEI) {
      return NextResponse.json({
        ok: true, skipped: true,
        reason: `idle=${idle} below threshold=${THRESHOLD_USDC_WEI}`,
        idle: idle.toString(), threshold: THRESHOLD_USDC_WEI.toString(),
        wrapperReserve: wrapperReserve.toString(),
        alreadyDeployed: alreadyDeployed.toString(),
      }, { status: 200, headers: corsHeaders });
    }
    if (idle > CAP_USDC_WEI) idle = CAP_USDC_WEI;

    // The vault's `assets` arg is uint64 (FHERC-20 confidential precision).
    // Idle is bounded above by the cap (1000 USDC = 1e9 wei), well within
    // uint64 range — but bound-check anyway so a future cap change can't
    // smuggle an overflow into the contract call.
    const MAX_U64 = (1n << 64n) - 1n;
    if (idle > MAX_U64) {
      return NextResponse.json({ ok: false, error: `idle ${idle} exceeds uint64 max — raise CAP smaller` }, { status: 500, headers: corsHeaders });
    }

    const minSharesOut = (idle * (10000n - SLIPPAGE_BPS)) / 10000n;

    const txHash = await wallet.writeContract({
      address: cfg.vault,
      abi: VAULT_ABI,
      functionName: "coordinatorDeployToStrategy",
      args: [onChainAdapter, idle, minSharesOut],
    });

    // Don't wait for the receipt — Vercel functions have a 10s default
    // timeout on hobby plans, and Aave's USDC supply is reliable. Return
    // the tx hash and let the client poll if it cares.
    void triggerIndexScan(chainId, req).catch(() => {});
    return NextResponse.json({
      ok: true,
      txHash,
      deployedUsdc: idle.toString(),
      minSharesOut: minSharesOut.toString(),
      adapter: onChainAdapter,
      coordinator: account.address,
    }, { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? String(e) }, { status: 500, headers: corsHeaders });
  }
}
