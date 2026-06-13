-- 0002_api_events.sql
-- Durable per-request audit log for /api/v7/* endpoints. Populated by
-- lib/relayer/request-log.ts via the withApiLog() wrapper. Caller identity
-- and request body are stored as sha256 hex digests — never plaintext.

CREATE TABLE IF NOT EXISTS api_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                  -- ms since epoch
  route TEXT NOT NULL,                  -- e.g. "/api/v7/names"
  method TEXT NOT NULL,                 -- POST | GET | …
  caller_hash TEXT,                     -- sha256(ip|ua) — opaque, non-reversible
  org_id TEXT,                          -- optional org_keys.key_id
  status INTEGER NOT NULL,              -- HTTP status code
  tx_hash TEXT,                         -- on-chain tx hash if relayer broadcast one
  chain_id INTEGER,                     -- destination chain
  error_code TEXT,                      -- short slug, e.g. "validation_failed"
  request_body_hash TEXT                -- sha256(raw body) — for dedup / abuse signals
);

CREATE INDEX IF NOT EXISTS idx_api_events_route_ts ON api_events(route, ts);
CREATE INDEX IF NOT EXISTS idx_api_events_caller   ON api_events(caller_hash, ts);

-- Token-bucket persistence (rate-limit). Best-effort; the in-memory map is
-- authoritative per instance — this row exists so cold lambdas can't reset
-- an attacker's budget to full capacity for free.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,          -- e.g. "ip:1.2.3.4" or "acct:0x…"
  tokens     REAL NOT NULL,             -- fractional tokens remaining
  updated_at INTEGER NOT NULL,          -- ms since epoch of last refill
  tier       TEXT NOT NULL DEFAULT 'sandbox'
);
