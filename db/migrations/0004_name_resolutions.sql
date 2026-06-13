-- 0003_name_resolutions.sql
-- Relayer-side name -> account resolution cache.
--
-- V7-FINAL #11: the on-chain Z0tzNameRegistry.resolve(nameHash) returns the
-- sentinel address(0x1) for all callers without LEDGER_ROLE — public
-- observers cannot deanonymize a recipient by querying the registry. Off-
-- chain callers (CLI `send --to-name`, GUI) still need to translate a
-- nameHash to a smart-account address before signing a spend.
--
-- The relayer is already the namespace authority (V7-FINAL #7) so every
-- `NameClaim*` / `*Repointed*` / `*Revoked*` tx flows through this process —
-- we cache (nameHash -> resolvedAccount) in this table at submit time, plus
-- a one-shot historical backfill script.
--
-- Privacy posture: rows here mirror what the relayer already saw when it
-- submitted the tx. Exposing them via a passkey-auth GET endpoint (see
-- /api/v7/resolve/[nameHash]) keeps lookups available to z0tz users while
-- preventing public bulk-scraping.
CREATE TABLE IF NOT EXISTS name_resolutions (
  name_hash         TEXT PRIMARY KEY,
  name              TEXT NOT NULL,            -- cleartext segment (empty if unknown e.g. authority path)
  parent_name_hash  TEXT,                     -- NULL for top-level
  resolved_account  TEXT NOT NULL,
  chain_id          INTEGER NOT NULL,
  claimed_at        INTEGER NOT NULL,         -- ms since epoch (first observation)
  last_updated      INTEGER NOT NULL,         -- ms since epoch (last mutation)
  active            INTEGER NOT NULL DEFAULT 1,
  tx_hash           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_name_resolutions_active   ON name_resolutions(active, chain_id);
CREATE INDEX IF NOT EXISTS idx_name_resolutions_resolved ON name_resolutions(resolved_account);
