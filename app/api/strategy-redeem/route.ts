/**
 * POST /api/strategy-redeem
 *
 * Mirror of /api/strategy-deploy — pulls aTokens out of Aave back into the
 * vault's idle bucket so user-facing withdraws can pay out. Tezcatli's
 * vault refuses withdrawConfidential when `strategyShares > 0 && idleAssetsHint == 0`
 * (revert IdleBucketEmpty()) — by design, since the encrypted FHE pricing
 * needs a plaintext settlement reserve to actually transfer USDC out.
 *
 * The Z0tz client calls this BEFORE running a vault withdraw. The endpoint
 * computes shares-to-redeem from the requested USDC amount, then signs the
 * coordinator-only `vault.coordinatorRedeemFromStrategy(adapter, shares, minAssetsOut)`.
 *
 * Idempotent: if the idle bucket already covers the request, it skips. If
 * strategyShares is 0 (everything already idle), it skips.
 *
 * Request body: { chainId: number, amountUsdc?: string }
 *   amountUsdc — optional, in micro-USDC. When omitted, redeem all shares
 *                back to idle (useful for batch withdraws or to fully
 *                wind down the strategy). With it set, redeem exactly
 *                what's needed for this withdraw + a small slippage buffer.
 *
 * Auth: passkey signature (X-Z0tz-PubX/PubY/Sig) — same as strategy-deploy.
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
import { triggerScanAndRecord } from "@/lib/relayer/trigger-indexer";

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

interface VaultDeploy {
  vault: Address;
  tzcUSDC: Address;
  underlying: Address;
  adapter: Address;
}
const VAULTS: Record<number, VaultDeploy> = {
  421614: {
    vault:      "0x90638B32b20e7BeDdb5AEFD745bF7a86b78a5A78",
    tzcUSDC:    "0x14655ba23f11FAaBd310703CAc387a69429cb7C8",
    underlying: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    adapter:    "0xfE573D24eca408B9c5fCf066f66BB57081777A55",
  },
};

const VAULT_ABI = parseAbi([
  "function coordinatorRedeemFromStrategy(address adapter, uint256 shares, uint64 minAssetsOut) returns (uint256)",
  "function strategyAdapter() view returns (address)",
  "function strategySharesByAdapter(address) view returns (uint256)",
  "function coordinator() view returns (address)",
  "function idleAssetsHint() view returns (uint256)",
]);

const ADAPTER_ABI = parseAbi([
  "function aToken() view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

/** Redeem this much extra above the requested amount, to cover slippage and
 *  any aToken rebase between read and execute. 1% is wildly conservative. */
const REDEEM_BUFFER_BPS = BigInt(process.env.STRATEGY_REDEEM_BUFFER_BPS ?? "100");

/** Floor for `minAssetsOut`. Aave V3 USDC is 1:1; 1% slippage covers any
 *  edge case without making real failures look like slippage. */
const SLIPPAGE_BPS = BigInt(process.env.STRATEGY_REDEEM_SLIPPAGE_BPS ?? "100");

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
    const requireAuth = process.env.STRATEGY_REDEEM_REQUIRE_AUTH === "1";
    const auth = verifyRelayerAuth(hdrs, rawBody, requireAuth);
    if (!auth.authenticated) {
      return NextResponse.json({ ok: false, error: auth.error ?? "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { chainId, amountUsdc } = rawBody;
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

    const onChainCoordinator = await client.readContract({
      address: cfg.vault, abi: VAULT_ABI, functionName: "coordinator",
    }) as Address;
    if (onChainCoordinator.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({
        ok: false,
        error: `Coordinator mismatch on chain ${chainId}: vault expects ${onChainCoordinator}, relayer is ${account.address}.`,
      }, { status: 500, headers: corsHeaders });
    }

    const onChainAdapter = await client.readContract({
      address: cfg.vault, abi: VAULT_ABI, functionName: "strategyAdapter",
    }) as Address;
    if (onChainAdapter === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ ok: false, skipped: true, reason: "vault has no strategy adapter" }, { status: 200, headers: corsHeaders });
    }

    const aToken = await client.readContract({
      address: onChainAdapter, abi: ADAPTER_ABI, functionName: "aToken",
    }) as Address;

    // Source of truth for "idle USDC available to unshield" is the wrapper's
    // actual underlying balance, NOT vault.idleAssetsHint() — the contract's
    // own comment marks the hint as a lower bound that never decrements on
    // user withdraws, so it over-counts after every withdraw and the redeem
    // gets sized too small. tzcUSDC is dedicated to the Tezcatli vault, so
    // its USDC reserve maps 1:1 to vault-attributable idle.
    const [strategyShares, wrapperReserve, aTokenBalance] = await Promise.all([
      client.readContract({ address: cfg.vault, abi: VAULT_ABI, functionName: "strategySharesByAdapter", args: [onChainAdapter] }) as Promise<bigint>,
      client.readContract({ address: cfg.underlying, abi: ERC20_ABI, functionName: "balanceOf",          args: [cfg.tzcUSDC] }) as Promise<bigint>,
      client.readContract({ address: aToken,    abi: ERC20_ABI, functionName: "balanceOf",               args: [onChainAdapter] }) as Promise<bigint>,
    ]);
    const idleHint = wrapperReserve; // expose under the same name for the response shape below

    if (strategyShares === 0n) {
      return NextResponse.json({
        ok: true, skipped: true,
        reason: "strategy has no shares — nothing to redeem",
        idleHint: idleHint.toString(),
      }, { status: 200, headers: corsHeaders });
    }

    // Compute shares to redeem. The adapter is 1:1 aUSDC — shares == aTokens
    // == ~USDC, modulo a tiny rebase delta. Convert the user's requested
    // USDC amount into a share count with a buffer.
    let sharesToRedeem: bigint;
    let amountWei: bigint = 0n;
    if (amountUsdc) {
      amountWei = BigInt(amountUsdc);
      // Skip if the wrapper reserve already covers the request — the unshield
      // can pay out directly from existing idle without touching Aave.
      if (wrapperReserve >= amountWei) {
        return NextResponse.json({
          ok: true, skipped: true,
          reason: `wrapperReserve=${wrapperReserve} already covers request=${amountWei}`,
          wrapperReserve: wrapperReserve.toString(),
          strategyShares: strategyShares.toString(),
        }, { status: 200, headers: corsHeaders });
      }
      // Redeem the actual shortfall plus buffer. Cap at total strategy
      // shares so we never request more than the adapter holds.
      const shortfall = amountWei - wrapperReserve;
      sharesToRedeem = (shortfall * (10000n + REDEEM_BUFFER_BPS)) / 10000n;
      if (sharesToRedeem > strategyShares) sharesToRedeem = strategyShares;
    } else {
      // No amount given — redeem everything (full unwind). Useful for
      // batch flows or maintenance.
      sharesToRedeem = strategyShares;
    }

    if (sharesToRedeem === 0n) {
      return NextResponse.json({ ok: true, skipped: true, reason: "computed sharesToRedeem=0", idleHint: idleHint.toString() }, { status: 200, headers: corsHeaders });
    }

    // minAssetsOut: 1% slippage on the share-equivalent USDC. uint64 cap
    // matches the contract's minAssetsOut type.
    const expectedAssetsOut = sharesToRedeem; // 1:1 aUSDC heuristic
    let minAssetsOut = (expectedAssetsOut * (10000n - SLIPPAGE_BPS)) / 10000n;
    const MAX_U64 = (1n << 64n) - 1n;
    if (minAssetsOut > MAX_U64) minAssetsOut = MAX_U64;

    const txHash = await wallet.writeContract({
      address: cfg.vault,
      abi: VAULT_ABI,
      functionName: "coordinatorRedeemFromStrategy",
      args: [onChainAdapter, sharesToRedeem, minAssetsOut],
    });

    triggerScanAndRecord({
      chainId,
      txHash: txHash as `0x${string}`,
      opKind: "strategy-redeem",
      req,
    });
    return NextResponse.json({
      ok: true,
      txHash,
      sharesRedeemed: sharesToRedeem.toString(),
      minAssetsOut: minAssetsOut.toString(),
      idleHintBefore: idleHint.toString(),
      strategySharesBefore: strategyShares.toString(),
      aTokenBalanceBefore: aTokenBalance.toString(),
      adapter: onChainAdapter,
      coordinator: account.address,
    }, { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? String(e) }, { status: 500, headers: corsHeaders });
  }
}
