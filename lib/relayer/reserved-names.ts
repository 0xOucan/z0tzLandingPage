/**
 * Reserved-name policy enforced by the relayer before /api/v7/names and
 * /api/v7/org/subdomain submit to chain. Sourced from
 * Z0tz/docs/RESERVED_NAMES.md (hard + soft blocklists). Confusables are
 * intentionally minimal here — the on-chain validator already restricts
 * names to [a-z0-9-], so unicode homoglyphs are blocked at the contract
 * boundary; this file handles ASCII-similar variants only.
 */

// HARD: refused for every tier.
const HARD_BLOCKED: readonly string[] = [
  // protocol
  "z0tz", "z0tz.z0tz", "z0tz.z0tz.z0tz", "z0tzteam", "z0tzlabs",
  "z0tzofficial", "z0tzdao", "z0tzgov",
  // generic system / admin
  "admin", "administrator", "root", "sysadmin", "support", "help",
  "helpdesk", "contact", "official", "verified", "team", "hq", "office",
  "ops", "operations", "security", "secure", "auth", "authentication",
  "system", "api", "sdk", "cli", "dashboard", "console", "account",
  "accounts", "profile", "user", "users", "guest", "public", "private",
  "test", "testing", "demo", "dev", "staging", "prod", "production",
  "sandbox", "internal", "external", "mainnet", "testnet", "faucet",
  "docs", "blog", "news", "press", "legal", "terms", "privacy", "abuse",
  "report", "mod", "moderator", "moderation", "master", "mainadmin",
  "superadmin", "boss", "ceo", "cto", "cfo", "ico", "ido", "launch",
  "official-z0tz", "real-z0tz", "verified-z0tz", "secure-z0tz",
];

// SOFT: refused for sandbox tier; allowed for verified.
const SOFT_BLOCKED: readonly string[] = [
  // exchanges + wallets
  "coinbase", "binance", "kraken", "gemini", "crypto", "ftx", "bybit",
  "okx", "huobi", "kucoin", "bitstamp", "bitfinex", "gate", "mexc",
  "deribit", "robinhood", "revolut", "nubank", "paypal", "stripe",
  "square", "venmo", "cashapp", "metamask", "phantom", "rainbow",
  "trust", "trustwallet", "ledger", "trezor", "keystone", "safe",
  "gnosis", "fireblocks", "copper", "ankr", "infura", "alchemy",
  "quicknode", "chainstack", "etherscan", "arbiscan", "basescan",
  "polygonscan",
  // L1/L2/zk
  "optimism", "arbitrum", "base", "polygon", "ethereum", "bitcoin",
  "solana", "avalanche", "sui", "aptos", "near", "cosmos", "osmosis",
  "celestia", "starknet", "zksync", "scroll", "linea", "mantle",
  "mantle-network", "blast", "mode", "zora", "fhenix", "inco", "secret",
  "penumbra", "aleo", "aztec", "zcash", "monero",
  // stablecoins / DeFi blue chips
  "usdc", "usdt", "dai", "frax", "lusd", "gho", "crvusd", "pyusd",
  "fdusd", "ondo", "mim", "sfrxeth", "weth", "wbtc", "steth", "wsteth",
  "reth", "cbeth", "oseth", "uniswap", "sushi", "curve", "balancer",
  "aave", "compound", "makerdao", "maker", "spark", "morpho", "silo",
  "gearbox", "ethena", "pendle", "lido", "rocketpool", "eigenlayer",
  "restaking", "symbiotic", "karak", "puffer", "swell", "synthetix",
  "1inch", "matcha", "cowswap", "paraswap", "kyberswap", "gmx",
  "hyperliquid", "drift", "zeta", "opensea", "blur", "magiceden",
  "foundation", "sound", "courtyard", "tensor",
  // brand impersonation
  "metamask-wallet", "coinbase-wallet", "trust-wallet", "phantom-wallet",
  "ledger-live", "trezor-suite", "opensea-listing", "opensea-mint",
  "mint", "mintnow", "claim", "claimnow", "freemint", "free-claim",
  "airdrop", "airdropnow", "giveaway", "prize", "won", "winner",
  "verified-account", "gov-mint", "official-mint", "team-allocation",
  "treasury-mint",
];

// ASCII-similar z0tz variants — always refused.
const CONFUSABLES_Z0TZ: readonly string[] = [
  "z0tz1", "z0tz2", "z0tzz", "zotz", "zotzz", "zztz", "z0tx", "z0t2",
  "zotx", "z-0tz", "0z0tz", "z00tz", "z0ttz", "zz0tz", "zz0tx",
];

const HARD_SET = new Set(HARD_BLOCKED);
const SOFT_SET = new Set(SOFT_BLOCKED);
const CONFUSE_SET = new Set(CONFUSABLES_Z0TZ);

export type ReservedDecision =
  | { allow: true }
  | { allow: false; reason: "hard-blocked" | "soft-blocked" | "confusable"; matched: string };

/**
 * Decide whether a cleartext name claim should be relayed.
 * @param name  cleartext name (e.g. "alice"); case-insensitive
 * @param tier  caller's org tier; "sandbox" by default, "verified" unlocks soft list
 */
export function checkReserved(name: string, tier?: string): ReservedDecision {
  const lower = String(name ?? "").toLowerCase().trim();
  if (!lower) return { allow: false, reason: "hard-blocked", matched: "" };
  if (HARD_SET.has(lower)) return { allow: false, reason: "hard-blocked", matched: lower };
  if (CONFUSE_SET.has(lower)) return { allow: false, reason: "confusable", matched: lower };
  if (SOFT_SET.has(lower) && tier !== "verified") {
    return { allow: false, reason: "soft-blocked", matched: lower };
  }
  return { allow: true };
}

export const RESERVED_LISTS = { HARD_BLOCKED, SOFT_BLOCKED, CONFUSABLES_Z0TZ };
