"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ShellUser {
  username: string;
  role: string;
  hasOrgKey: boolean;
}

const NAV: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/api-key", label: "API Key" },
  { href: "/dashboard/subdomains", label: "Subdomains" },
  { href: "/dashboard/policy", label: "Policy" },
  { href: "/dashboard/multisend", label: "Bulk Onboard" },
  { href: "/dashboard/recovery", label: "Recovery" },
  { href: "/dashboard/api", label: "API Explorer" },
  { href: "/dashboard/admin", label: "Admin", adminOnly: true },
];

// Routes that render their own full-page chrome (no sidebar).
const BARE = ["/dashboard/login", "/dashboard/signup", "/dashboard/reset"];

export function DashboardShell({ user, children }: { user: ShellUser | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (BARE.includes(pathname)) {
    return <div className="min-h-screen bg-background text-foreground font-mono">{children}</div>;
  }

  async function logout() {
    await fetch("/api/dashboard/logout", { method: "POST" });
    router.push("/dashboard/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex">
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            z0tz<span className="text-muted-foreground">/console</span>
          </Link>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
            B2B Dashboard · Demo
          </p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((n) => !n.adminOnly || user?.role === "admin").map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-border space-y-3">
          {user ? (
            <>
              <div className="text-xs">
                <div className="font-semibold truncate">{user.username}</div>
                <div className="flex gap-1 mt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {user.role}
                  </Badge>
                  <Badge variant={user.hasOrgKey ? "default" : "outline"} className="text-[10px]">
                    {user.hasOrgKey ? "org linked" : "no org key"}
                  </Badge>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={logout}>
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" className="w-full" onClick={() => router.push("/dashboard/login")}>
              Sign in
            </Button>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
