/**
 * Static DeFi vault registry — mirror of
 * /home/oucan/EVVM/FHE/Z0tz/contracts/deployments/defi-vaults.json,
 * stripped to the fields the indexer needs.
 *
 * Maintained by hand here so the relayer doesn't depend on the Z0tz
 * monorepo at build time. When new vaults deploy, add them here AND
 * to defi-vaults.json. Drift is detectable by comparing vault.wrapped
 * against scan_state rows — if a wrapped address shows up in
 * usdc_transfers but not in this registry, the registry is stale.
 */
import type { Address } from "viem";
import type { ChainId } from "./contracts";

export interface IndexedVault {
  id: string;          // friendly slug, e.g. "tezcatli-usdc-aave"
  chainId: ChainId;
  underlying: Address; // USDC token address on the chain
  wrapped: Address;    // the confidential wrapper that emits Transfer events to/from stealths
}

export const DEFI_VAULTS: IndexedVault[] = [
  // arb-sepolia — Aave-backed USDC confidential vault
  {
    id: "tezcatli-usdc-aave",
    chainId: 421614,
    underlying: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    wrapped: "0x14655ba23f11FAaBd310703CAc387a69429cb7C8",
  },
  // base-sepolia — skeleton (no Aave market on base testnet)
  {
    id: "tezcatli-usdc-skeleton",
    chainId: 84532,
    underlying: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    wrapped: "0xeb571Fb31DcB7713bf83CdcF137003c852089eE8",
  },
  // eth-sepolia — skeleton
  {
    id: "tezcatli-usdc-skeleton",
    chainId: 11155111,
    underlying: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    wrapped: "0xa6f051D55Af5AF7F39643064A41ACEC355Aa9A71",
  },
];

/** All vaults configured for one chain. Used to enumerate per-vault scans. */
export function vaultsForChain(chainId: ChainId): IndexedVault[] {
  return DEFI_VAULTS.filter((v) => v.chainId === chainId);
}
