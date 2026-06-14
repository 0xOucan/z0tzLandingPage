-- 0006_pubkey_commitment.sql
-- Privacy fix: protect the ONE off-chain de-anonymization vector in the V7
-- landing DB — the relayer-learned `stealth_address -> pubkey_hash` map in
-- `stealth_watch_v7`. That linkage is recorded at watch-registration time,
-- BEFORE any on-chain tx exists, so a raw DB dump could reverse a user's
-- stealth receive addresses back to their pubkey with zero on-chain footprint.
-- (By contrast sweeper_events_v7 / credit_events_v7 only carry data the
-- on-chain PrivateSweep event already makes public — those stay plaintext.)
--
-- Fix: store a SALTED COMMITMENT keccak256(pubkeyHash || SERVER_SALT) instead
-- of the raw pubkeyHash. A user who supplies their pubkeyHash (already the
-- read/write capability for watch + inbound) recomputes the same commitment,
-- so the relayer can still MATCH a known user; a DB read alone cannot reverse
-- stealth -> user without the server secret.
--
-- See lib/indexer/turso-v7.ts :: pubkeyCommitment() for the runtime helper.
-- ensureSchema() mirrors this rename idempotently at runtime; this file is the
-- file-driven equivalent for a clean Turso bootstrap.
--
-- OPERATOR REQUIREMENT: production MUST set env `SERVER_SALT` (or
-- `STEALTH_WATCH_SALT`) to a long random secret. ROTATING IT ORPHANS ALL
-- EXISTING COMMITMENTS — every previously-watched stealth becomes unmatchable
-- and clients must re-register. Back it up; do not churn it.

-- Fresh deploys: create the table directly with the commitment column.
CREATE TABLE IF NOT EXISTS stealth_watch_v7 (
  stealth_address   TEXT PRIMARY KEY,
  pubkey_commitment TEXT    NOT NULL,
  idx               INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

-- Existing deploys whose table still has the legacy raw-pubkey column: rename
-- it in place. SQLite has no "RENAME COLUMN IF EXISTS"; on a fresh table (the
-- column is already `pubkey_commitment`) this statement errors. Migration
-- runners should tolerate / skip the error — the CREATE above plus the runtime
-- ensureSchema() rename keep the end state correct and idempotent either way.
ALTER TABLE stealth_watch_v7 RENAME COLUMN pubkey_hash TO pubkey_commitment;
