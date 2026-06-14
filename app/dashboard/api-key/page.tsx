"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ApiKeyPage() {
  const [orgName, setOrgName] = useState("");
  const [subdomainRoot, setSubdomainRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<any>(null);

  async function issue() {
    setBusy(true);
    setErr(null);
    setIssued(null);
    const res = await fetch("/api/dashboard/issue-sandbox-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: orgName || undefined, subdomainRoot: subdomainRoot || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json?.error || "issue failed");
      return;
    }
    setIssued(json);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Key</h1>
        <p className="text-sm text-muted-foreground">
          Self-serve a sandbox key, or request a verified/production key from the team.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Issue a sandbox key</CardTitle>
          <CardDescription>
            Sandbox keys are rate-limited and testnet-only. The key is shown ONCE — store it now.
            It auto-links to your account so the dashboard can call the org API on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="org">Org name</Label>
              <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="defaults to your username" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sub">Subdomain root</Label>
              <Input id="sub" value={subdomainRoot} onChange={(e) => setSubdomainRoot(e.target.value)} placeholder="e.g. acme.z0tz" />
            </div>
          </div>
          <Button onClick={issue} disabled={busy}>
            {busy ? "Issuing…" : "Issue sandbox key"}
          </Button>
          {err && <p className="text-sm text-red-500">{err}</p>}
          {issued && (
            <div className="space-y-2 border border-amber-500/40 bg-amber-500/5 rounded p-4">
              <p className="text-xs font-semibold text-amber-600">
                Copy this key now — it will not be shown again.
              </p>
              <pre className="text-xs whitespace-pre-wrap break-all border border-border rounded p-3 bg-muted select-all">
                {issued.plaintext_api_key}
              </pre>
              <div className="text-xs text-muted-foreground">
                key_id: {issued.key_id} · tier: {issued.tier} · root: {issued.subdomain_root}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request a production key</CardTitle>
          <CardDescription>Verified / production tiers are provisioned by the Z0tz team.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            Email <span className="font-semibold">partners@z0tz.dev</span> with your org name, the
            subdomain root you want (e.g. <code className="bg-muted px-1 rounded">coppel.z0tz</code>),
            and your expected call volume. We&apos;ll provision a verified key and link it to your
            account.
          </p>
          <p className="text-xs text-muted-foreground">
            Auth model: every org call is HMAC-signed over the request body
            (M-7). The dashboard signs server-side; the secret never reaches the browser.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
