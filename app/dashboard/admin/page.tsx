"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Super-admin console. The admin key is held in component state only and
// sent as X-Z0tz-Admin-Key to /api/dashboard/admin/* (never persisted).
export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [data, setData] = useState<{ users: any[]; orgKeys: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);

  const h = () => ({ "Content-Type": "application/json", "X-Z0tz-Admin-Key": adminKey });

  async function load() {
    setErr(null);
    const res = await fetch("/api/dashboard/admin/users", { headers: { "X-Z0tz-Admin-Key": adminKey } });
    const json = await res.json();
    if (!res.ok) {
      setErr(json?.error || "unauthorized");
      setData(null);
      return;
    }
    setData(json);
  }

  // issue-reset
  const [resetUser, setResetUser] = useState("");
  async function issueReset() {
    setOut(null);
    setErr(null);
    const res = await fetch("/api/dashboard/admin/issue-reset", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ username: resetUser }),
    });
    const json = await res.json();
    if (!res.ok) return setErr(json?.error || "failed");
    setOut(JSON.stringify(json, null, 2));
  }

  // issue-org-key
  const [orgName, setOrgName] = useState("");
  const [subRoot, setSubRoot] = useState("");
  const [tier, setTier] = useState("verified");
  const [linkUser, setLinkUser] = useState("");
  async function issueOrgKey() {
    setOut(null);
    setErr(null);
    const res = await fetch("/api/dashboard/admin/issue-org-key", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ orgName, subdomainRoot: subRoot, tier, linkUsername: linkUser || undefined }),
    });
    const json = await res.json();
    if (!res.ok) return setErr(json?.error || "failed");
    setOut(JSON.stringify(json, null, 2));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Super-admin console — gated by the Z0tz admin key (held in memory only).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin key</CardTitle>
          <CardDescription>Paste the Z0TZ_ADMIN_KEY to unlock admin actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="X-Z0tz-Admin-Key" />
          <Button onClick={load} disabled={!adminKey}>
            Load users & keys
          </Button>
          {err && <p className="text-sm text-red-500">{err}</p>}
        </CardContent>
      </Card>

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Dashboard users ({data.users.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm border-b border-border py-1">
                  <span className="font-semibold">{u.username}</span>
                  <span className="flex gap-1 items-center">
                    <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                    {u.org_key_id ? (
                      <Badge variant="default" className="text-[10px]">{u.org_key_id}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">no key</Badge>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Org keys ({data.orgKeys.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.orgKeys.map((k) => (
                <div key={k.key_id} className="flex items-center justify-between text-sm border-b border-border py-1">
                  <span>{k.org_name} <span className="text-muted-foreground">({k.key_id})</span></span>
                  <span className="flex gap-1">
                    <Badge variant="secondary" className="text-[10px]">{k.tier}</Badge>
                    {k.revoked_at && <Badge variant="destructive" className="text-[10px]">revoked</Badge>}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issue password-reset link</CardTitle>
          <CardDescription>Mint a one-time reset token; hand the link to the user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={resetUser} onChange={(e) => setResetUser(e.target.value)} />
          </div>
          <Button onClick={issueReset} disabled={!adminKey || !resetUser}>Generate reset link</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Issue org key</CardTitle>
          <CardDescription>Provision a verified/production org HMAC key, optionally linked to a user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Org name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Subdomain root</Label>
              <Input value={subRoot} onChange={(e) => setSubRoot(e.target.value)} placeholder="acme.z0tz" />
            </div>
            <div className="space-y-1">
              <Label>Tier</Label>
              <Input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="verified | sandbox" />
            </div>
            <div className="space-y-1">
              <Label>Link to username (optional)</Label>
              <Input value={linkUser} onChange={(e) => setLinkUser(e.target.value)} />
            </div>
          </div>
          <Button onClick={issueOrgKey} disabled={!adminKey || !orgName || !subRoot}>Issue org key</Button>
        </CardContent>
      </Card>

      {out && (
        <pre className="text-xs whitespace-pre-wrap break-all border border-amber-500/40 bg-amber-500/5 rounded p-3 overflow-auto">
          {out}
        </pre>
      )}
    </div>
  );
}
