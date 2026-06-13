-- 0003_bridge_replays.sql
-- Idempotency ledger for /api/v7/bridge-relay. Keyed by the source
-- (chainId, txHash) the CLI hands the relayer; stores the prior dest tx
-- so a replayed request returns the same hash instead of re-submitting.
--
-- Schema is created lazily by the route (see ensureBridgeReplaysSchema)
-- so a fresh deploy that hasn't run migrations still works; this file is
-- the canonical version for the deploy pipeline.

CREATE TABLE IF NOT EXISTS bridge_replays (
  src_chain_id  INTEGER NOT NULL,
  src_tx_hash   TEXT    NOT NULL,
  dst_chain_id  INTEGER NOT NULL,
  dst_tx_hash   TEXT    NOT NULL,
  status        TEXT    NOT NULL,   -- "delivered" | "already-used"
  ts            INTEGER NOT NULL,   -- ms since epoch
  PRIMARY KEY (src_chain_id, src_tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_bridge_replays_dst
  ON bridge_replays(dst_chain_id, ts);
