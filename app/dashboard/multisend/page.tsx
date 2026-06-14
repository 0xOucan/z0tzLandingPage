"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Bulk onboard: an array of subdomain-claim requests, each dispatched as a
// POST /api/v7/org/subdomain. Useful for an org enrolling many employees at
// once. The dashboard backend signs each call with the org key (M-7 HMAC).
const SAMPLE = {
  rows: [
    {
      chainId: 84532,
      claim: {
        leafSegment: "arturo",
        parentNameHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        leafNameHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        userPubX: "0",
        userPubY: "0",
        userResolvedAccount: "0x0000000000000000000000000000000000000000",
        adminPubX: "0",
        adminPubY: "0",
        deadline: "0",
        sigR: "0",
        sigS: "0",
        userSigR: "0",
        userSigS: "0",
      },
    },
  ],
};

export default function MultisendPage() {
  const [text, setText] = useState(JSON.stringify(SAMPLE, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<any[] | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setResults(null);
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch (e: any) {
      setErr("Invalid JSON: " + (e?.message ?? ""));
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/dashboard/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "multisend", payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error || `HTTP ${res.status}`);
      } else {
        setResults(json.results || []);
      }
    } catch (e: any) {
      setErr(e?.message ?? "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk Onboard</h1>
        <p className="text-sm text-muted-foreground">
          Enroll many users in one batch. Each row is a subdomain claim, dispatched as an
          individual <code className="bg-muted px-1 rounded">POST /api/v7/org/subdomain</code> (max 50).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batch subdomain claims</CardTitle>
          <CardDescription>JSON: {"{ rows: [ { chainId, claim } ] }"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(24, text.split("\n").length + 1)}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <Button onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit batch"}
          </Button>
          {err && <p className="text-sm text-red-500">{err}</p>}
          {results && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {results.filter((r) => r.ok).length}/{results.length} succeeded
              </p>
              <pre className="text-xs whitespace-pre-wrap border border-border rounded p-3 bg-muted overflow-auto max-h-96">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
