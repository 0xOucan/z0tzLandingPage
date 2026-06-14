/**
 * Server helpers to read the dashboard session from the request cookie,
 * usable from both route handlers and Server Components.
 */
import { cookies } from "next/headers";
import { verifySession, getUserById, SESSION_COOKIE_NAME, type DashboardUser } from "./auth";

/** Returns the verified session payload, or null. */
export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySession(token);
}

/** Full user row for the current session (re-reads DB for fresh org_key_id). */
export async function getSessionUser(): Promise<DashboardUser | null> {
  const sess = await getSession();
  if (!sess) return null;
  return getUserById(sess.uid);
}
