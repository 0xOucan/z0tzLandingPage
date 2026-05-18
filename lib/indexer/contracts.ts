/**
 * Z0tz contract addresses + event ABIs for the indexer.
 *
 * Addresses are read from env vars per chain (same pattern as the existing
 * relayer config at app/api/config/route.ts). If an env var is missing the
 * indexer skips that contract on that chain instead of crashing.
 *
 * Event signatures are duplicated here (instead of importing from contracts
 * package) so the indexer is a standalone module with no compile-time
 * dependency on the contracts/typechain output.
 */
import { parseAbiItem, type Address, type AbiEvent } from "viem";

export type ChainId = 84532 | 11155111 | 421614;
export const SUPPORTED_CHAINS: ChainId[] = [84532, 11155111, 421614];

export const CHAIN_NETWORK: Record<ChainId, string> = {
  84532: "base-sepolia",
  11155111: "eth-sepolia",
  421614: "arb-sepolia",
};

// ─── Event ABIs ──────────────────────────────────────────────────────────

// EntryPoint v0.8 UserOperationEvent. Indexed: userOpHash, sender, paymaster.
export const ENTRYPOINT_USEROP_EVENT: AbiEvent = parseAbiItem(
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)"
);

// Z0tzAccountFactory.AccountCreated. Indexed: account.
export const ACCOUNT_CREATED_EVENT: AbiEvent = parseAbiItem(
  "event AccountCreated(address indexed account, uint256 ownerX, uint256 ownerY)"
);

// Sweeper.PrivateSweep. Indexed: stealthAddress, wrappedTokenOrVault.
export const SWEEPER_PRIVATE_SWEEP: AbiEvent = parseAbiItem(
  "event PrivateSweep(address indexed stealthAddress, address indexed wrappedTokenOrVault, uint256 shieldedAmount, uint256 fee)"
);

// Ledger events. ledgerId always indexed first.
export const LEDGER_REGISTERED: AbiEvent = parseAbiItem(
  "event Registered(bytes32 indexed ledgerId, bytes32 pubkeyHash, address viewer)"
);
export const LEDGER_CREDITED: AbiEvent = parseAbiItem(
  "event CreditedFromVault(bytes32 indexed ledgerId, uint64 netAmount)"
);
export const LEDGER_SPENT: AbiEvent = parseAbiItem(
  "event Spent(bytes32 indexed oldId, bytes32 indexed newId, uint8 action)"
);
export const LEDGER_ROTATED: AbiEvent = parseAbiItem(
  "event Rotated(bytes32 indexed oldId, bytes32 indexed newId)"
);

// Z0tzPrivateLedgerVault.TransferredOut. encAmount is bytes32 (CoFHE
// ciphertext handle), NOT uint256 — declaring it wrong returns 0 logs.
export const VAULT_TRANSFERRED_OUT: AbiEvent = parseAbiItem(
  "event TransferredOut(address indexed to, bytes32 indexed encAmount)"
);

// ─── Address resolution per chain ────────────────────────────────────────

export type ChainContracts = {
  chainId: ChainId;
  network: string;
  entryPoint?: Address;
  accountFactory?: Address;
  sweeper?: Address;
  ledger?: Address;
  vault?: Address;
};

/**
 * Per-chain contract addresses, loaded from env vars. Mirrors the convention
 * already used by app/api/config/route.ts.
 *
 * Expected env names (NEW for indexer — falls back to existing relayer vars
 * where the names overlap):
 *   ENTRY_POINT_ADDRESS_{chainId}    or  ENTRYPOINT_ADDRESS_{chainId}
 *   ACCOUNT_FACTORY_ADDRESS_{chainId}
 *   SWEEPER_V65_ADDRESS_{chainId}    (already used by relayer)
 *   LEDGER_ADDRESS_{chainId}         (already used by relayer)
 *   VAULT_ADDRESS_{chainId}          (already used by relayer)
 */
export function loadChainContracts(chainId: ChainId): ChainContracts {
  const ep =
    process.env[`ENTRY_POINT_ADDRESS_${chainId}`] ??
    process.env[`ENTRYPOINT_ADDRESS_${chainId}`];
  const factory = process.env[`ACCOUNT_FACTORY_ADDRESS_${chainId}`];
  const sweeper = process.env[`SWEEPER_V65_ADDRESS_${chainId}`];
  const ledger = process.env[`LEDGER_ADDRESS_${chainId}`];
  const vault = process.env[`VAULT_ADDRESS_${chainId}`];
  return {
    chainId,
    network: CHAIN_NETWORK[chainId],
    entryPoint: ep ? (ep as Address) : undefined,
    accountFactory: factory ? (factory as Address) : undefined,
    sweeper: sweeper ? (sweeper as Address) : undefined,
    ledger: ledger ? (ledger as Address) : undefined,
    vault: vault ? (vault as Address) : undefined,
  };
}

/**
 * Static fallback addresses for testnet, used when env vars aren't set.
 * These match contracts/deployments/v6.5-ledger-{chainId}.json. Useful for
 * local dev — production should rely on env vars only.
 */
export const STATIC_TESTNET_ADDRESSES: Record<ChainId, Partial<ChainContracts>> = {
  84532: {
    entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
    accountFactory: "0xe67471E72647E6088791a0f752628D910Dc4D94b",
    sweeper: "0xF1368C62986F1681aEb370E796cdcf8f18635E8c",
    ledger: "0xD912e777811238F14106F4Fb161230Bb182dAF4e",
    vault: "0x308fbdc8aaD5e5Ee470Adb1A89072a31CbDa3829",
  },
  11155111: {
    entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
    sweeper: "0x9BA45877b983a0c704dA37b50cd5e746e66E5F66",
    ledger: "0x60570F2DeA11A09B5c6411A8f48017F50eFc4D6C",
    vault: "0x763BC9f2F6520E92B4D56622F55F370D3bF1bF3F",
  },
  421614: {
    entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
    sweeper: "0x0fb0CC4eedfA2f93729cD16Cd2F553A617e56D5A",
    ledger: "0x1b45Da2D95ad8180D60616b668F44AC8dc457504",
    vault: "0x2B147275C63aFDF8583A4bce53c49100fE171CAC",
  },
};

/**
 * Resolves contracts for a chain — env vars first, static fallbacks for
 * any missing values.
 */
export function resolveChainContracts(chainId: ChainId): ChainContracts {
  const fromEnv = loadChainContracts(chainId);
  const fallback = STATIC_TESTNET_ADDRESSES[chainId] ?? {};
  return {
    chainId,
    network: CHAIN_NETWORK[chainId],
    entryPoint: fromEnv.entryPoint ?? fallback.entryPoint,
    accountFactory: fromEnv.accountFactory ?? fallback.accountFactory,
    sweeper: fromEnv.sweeper ?? fallback.sweeper,
    ledger: fromEnv.ledger ?? fallback.ledger,
    vault: fromEnv.vault ?? fallback.vault,
  };
}
