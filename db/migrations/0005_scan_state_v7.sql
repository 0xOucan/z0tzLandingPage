-- 0005_scan_state_v7.sql
-- Ensure the V7 indexer's per-(chain, contract, event) cursor table exists.
--
-- The runtime path (lib/indexer/turso-v7.ts :: ensureSchema) already issues
-- CREATE TABLE IF NOT EXISTS for `scan_state_v7`. This migration is the
-- file-driven mirror so a clean Turso bootstrap from `db/migrations/` ends up
-- with the same shape without having to load the Next.js runtime first.
--
-- The schema MUST stay byte-compatible with turso-v7.ts:
--   PRIMARY KEY (chain_id, contract_address, event_type)
-- because the indexer reads/writes via that composite key.

CREATE TABLE IF NOT EXISTS scan_state_v7 (
  chain_id          INTEGER NOT NULL,
  contract_address  TEXT    NOT NULL,
  event_type        TEXT    NOT NULL,
  last_block_scanned INTEGER NOT NULL,
  last_scanned_at   INTEGER NOT NULL,
  PRIMARY KEY (chain_id, contract_address, event_type)
);

CREATE INDEX IF NOT EXISTS idx_scan_state_v7_chain
  ON scan_state_v7(chain_id, last_scanned_at DESC);
