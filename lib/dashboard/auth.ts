/**
 * Dashboard auth — the human-operator login layer for the Z0tz B2B
 * dashboard. Distinct from the HMAC `org_keys` (machine creds): a
 * `dashboard_users` row is a person, optionally linked to ONE org key via
 * `org_key_id`. All org API calls the dashboard makes on the user's behalf
 * use that linked key, server-side only (see lib/dashboard/org-client.ts).
 *
 * Passwords: bcryptjs (cost 12).
 *
 * Session: a stateless HMAC-signed token (`<payloadB64>.<sigB64url>`) over
 * `{ uid, username, role, exp }`, signed with SESSION_SECRET. Set as an
 * httpOnly, SameSite=Lax cookie. No JWT lib needed — this is a minimal,
 * self-contained signed token.
 *
 * Password reset is admin-only (no email): an admin mints a one-time
 * reset_token; the user redeems it at /dashboard/reset.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { client, ensureSchema as ensureV7Schema } from "@/lib/indexer/turso-v7";

const SESSION_COOKIE = "z0tz_dash_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  // Dev fallback — loud, never use in prod (sessions become forgeable).
  console.warn("[dashboard/auth] SESSION_SECRET unset — using insecure dev fallback.");
  return "z0tz-dashboard-dev-session-secret-DO-NOT-USE-IN-PROD";
}

let _ready = false;
async function ensureSchema(): Promise<void> {
  // Reuse the v7 schema bootstrap (creates org_keys etc.), then add ours.
  await ensureV7Schema();
  if (_ready) return;
  await client().execute(
    `CREATE TABLE IF NOT EXISTS dashboard_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT,
      password_hash TEXT NOT NULL,
      org_key_id    TEXT,
      role          TEXT NOT NULL DEFAULT 'user',
      reset_token   TEXT,
      reset_expires INTEGER,
      created_at    INTEGER NOT NULL
    )`,
  );
  await client().execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_reset ON dashboard_users(reset_token)`,
  ).catch(() => {});
  _ready = true;
}

export interface DashboardUser {
  id: number;
  username: string;
  email: string | null;
  org_key_id: string | null;
  role: string;
  created_at: number;
}

function rowToUser(row: any): DashboardUser {
  return {
    id: Number(row.id),
    username: row.username as string,
    email: (row.email as string | null) ?? null,
    org_key_id: (row.org_key_id as string | null) ?? null,
    role: row.role as string,
    created_at: Number(row.created_at),
  };
}

// ── Password hashing ───────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(plain, hash);
}

// ── Signup / login ──────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<any | null> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM dashboard_users WHERE username = ? LIMIT 1`,
    args: [username.toLowerCase()],
  });
  return r.rows[0] ?? null;
}

export async function getUserById(id: number): Promise<DashboardUser | null> {
  await ensureSchema();
  const r = await client().execute({
    sql: `SELECT * FROM dashboard_users WHERE id = ? LIMIT 1`,
    args: [id],
  });
  return r.rows[0] ? rowToUser(r.rows[0]) : null;
}

export async function signupUser(args: {
  username: string;
  password: string;
  email?: string | null;
  orgKeyId?: string | null;
  role?: string;
}): Promise<DashboardUser> {
  await ensureSchema();
  const username = args.username.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    throw new Error("username must be 3-32 chars (a-z 0-9 _ . -)");
  }
  if (args.password.length < 8) throw new Error("password must be >= 8 chars");
  const existing = await getUserByUsername(username);
  if (existing) throw new Error("username already taken");
  const passwordHash = await hashPassword(args.password);
  const created = Date.now();
  const res = await client().execute({
    sql: `INSERT INTO dashboard_users (username, email, password_hash, org_key_id, role, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      username,
      args.email ?? null,
      passwordHash,
      args.orgKeyId ?? null,
      args.role ?? "user",
      created,
    ],
  });
  const id = Number(res.lastInsertRowid);
  return {
    id,
    username,
    email: args.email ?? null,
    org_key_id: args.orgKeyId ?? null,
    role: args.role ?? "user",
    created_at: created,
  };
}

export async function loginUser(username: string, password: string): Promise<DashboardUser | null> {
  const row = await getUserByUsername(username);
  if (!row) return null;
  const ok = await verifyPassword(password, row.password_hash as string);
  if (!ok) return null;
  return rowToUser(row);
}

export async function setUserOrgKey(userId: number, orgKeyId: string): Promise<void> {
  await ensureSchema();
  await client().execute({
    sql: `UPDATE dashboard_users SET org_key_id = ? WHERE id = ?`,
    args: [orgKeyId, userId],
  });
}

export async function listUsers(): Promise<DashboardUser[]> {
  await ensureSchema();
  const r = await client().execute(`SELECT * FROM dashboard_users ORDER BY created_at DESC`);
  return r.rows.map(rowToUser);
}

// ── Admin-driven password reset ─────────────────────────────────────────

/** Mint a one-time reset token (admin-only). Returns the token; the admin
 *  hands the user a /dashboard/reset?token=<token> link. */
export async function issueResetToken(username: string, ttlMs = 24 * 3600 * 1000): Promise<string | null> {
  await ensureSchema();
  const row = await getUserByUsername(username);
  if (!row) return null;
  const token = randomBytes(24).toString("hex");
  await client().execute({
    sql: `UPDATE dashboard_users SET reset_token = ?, reset_expires = ? WHERE id = ?`,
    args: [token, Date.now() + ttlMs, Number(row.id)],
  });
  return token;
}

/** Redeem a reset token: set a new password, clear the token. */
export async function redeemResetToken(token: string, newPassword: string): Promise<boolean> {
  await ensureSchema();
  if (newPassword.length < 8) throw new Error("password must be >= 8 chars");
  const r = await client().execute({
    sql: `SELECT * FROM dashboard_users WHERE reset_token = ? LIMIT 1`,
    args: [token],
  });
  const row = r.rows[0];
  if (!row) return false;
  if (!row.reset_expires || Date.now() > Number(row.reset_expires)) return false;
  const passwordHash = await hashPassword(newPassword);
  await client().execute({
    sql: `UPDATE dashboard_users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`,
    args: [passwordHash, Number(row.id)],
  });
  return true;
}

// ── Signed session token ────────────────────────────────────────────────

interface SessionPayload {
  uid: number;
  username: string;
  role: string;
  exp: number; // unix ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signSession(user: DashboardUser): string {
  const payload: SessionPayload = {
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", sessionSecret()).update(payloadB64).digest());
  return `${payloadB64}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", sessionSecret()).update(payloadB64).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000);

// ── Admin-key check (mirrors issue-org-key route) ───────────────────────

export async function checkAdminKey(provided: string | null | undefined): Promise<boolean> {
  const adminKey = process.env.Z0TZ_ADMIN_KEY;
  if (!adminKey) return false;
  const got = provided ?? "";
  if (got.length !== adminKey.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(adminKey));
  } catch {
    return false;
  }
}
