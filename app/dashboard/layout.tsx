import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/dashboard/session";
import { DashboardShell } from "@/components/z0tz/dashboard/shell";

export const metadata = {
  title: "Z0tz Console — B2B Dashboard",
};

// The layout reads the session and passes a minimal user descriptor to the
// client shell. Individual pages still guard themselves; unauthenticated
// users on protected pages are bounced to /dashboard/login client-side.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return (
    <DashboardShell
      user={
        user
          ? { username: user.username, role: user.role, hasOrgKey: Boolean(user.org_key_id) }
          : null
      }
    >
      {children}
    </DashboardShell>
  );
}
