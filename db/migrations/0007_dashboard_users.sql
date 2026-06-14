-- B2B dashboard login accounts.
--
-- These are the human operators of an org (Coppel ops, etc.) — distinct
-- from the HMAC org_keys, which are the machine credentials. A dashboard
-- user MAY be linked to one org key via `org_key_id`; all org API calls
-- the dashboard makes on their behalf use that key, server-side only.
--
-- No email delivery: password reset is admin-driven. An admin (super-admin
-- key) mints a one-time `reset_token` + `reset_expires`, hands the user a
-- /dashboard/reset?token=<token> link; the user sets a new password and
-- the token is cleared.
CREATE TABLE IF NOT EXISTS dashboard_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT,
  password_hash TEXT NOT NULL,
  org_key_id    TEXT,                 -- FK-ish to org_keys.key_id (nullable)
  role          TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  reset_token   TEXT,                 -- one-time admin-issued reset handle
  reset_expires INTEGER,             -- unix ms; token invalid after this
  created_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_reset ON dashboard_users(reset_token);
