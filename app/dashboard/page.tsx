import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dashboard/session";
import { callOrgApi } from "@/lib/dashboard/org-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");

  let usage: any = null;
  let usageErr: string | null = null;
  if (user.org_key_id) {
    const r = await callOrgApi({ keyId: user.org_key_id, method: "GET", path: "/api/v7/org/usage" });
    if (r.ok) usage = r.json;
    else usageErr = r.json?.error || `HTTP ${r.status}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user.username}.</p>
      </div>

      {!user.org_key_id ? (
        <Card>
          <CardHeader>
            <CardTitle>No org key linked</CardTitle>
            <CardDescription>
              You haven&apos;t linked an org API key yet. Issue a sandbox key to start calling the
              B2B API, or contact the Z0tz team for a verified/production key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/api-key" className="underline text-sm">
              Go to API Key →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Organization</CardDescription>
                <CardTitle className="text-lg break-all">{usage?.orgName ?? "—"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">tier: {usage?.tier ?? "—"}</Badge>{" "}
                <Badge variant="outline">key: {usage?.keyId ?? user.org_key_id}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Billable calls (30d)</CardDescription>
                <CardTitle className="text-3xl">{usage?.ok ?? "—"}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {usage ? `${usage.total} total · ${usage.badRequest} 4xx · ${usage.serverError} 5xx` : ""}
              </CardContent>
            </Card>
          </div>

          {usageErr && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-red-500">Usage unavailable</CardTitle>
                <CardDescription>{usageErr}</CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Raw /api/v7/org/usage</CardTitle>
              <CardDescription>Fetched server-side with your org key (M-7 HMAC).</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap border border-border rounded p-3 bg-muted overflow-auto">
                {JSON.stringify(usage ?? { error: usageErr }, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
