"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Generic org-action panel: edit a JSON payload, POST it to
 * /api/dashboard/org with the given action, render the response. The
 * dashboard backend signs the M-7 HMAC and forwards to /api/v7/org/*.
 */
export function OrgActionCard({
  title,
  description,
  action,
  sample,
  endpoint,
}: {
  title: string;
  description: string;
  action: string;
  sample: unknown;
  endpoint: string;
}) {
  const [text, setText] = useState(JSON.stringify(sample, null, 2));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setResult(null);
    let payload: unknown;
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
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (!res.ok) setErr(json?.error || `HTTP ${res.status}`);
      setResult(JSON.stringify(json, null, 2));
    } catch (e: any) {
      setErr(e?.message ?? "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <p className="text-xs text-muted-foreground mt-1">
          Wires <code className="bg-muted px-1 rounded">{endpoint}</code> · signed
          server-side with your org key (M-7 HMAC).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(20, text.split("\n").length + 1)}
          className="font-mono text-xs"
          spellCheck={false}
        />
        <Button onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit"}
        </Button>
        {err && (
          <pre className="text-xs text-red-500 whitespace-pre-wrap border border-red-500/30 rounded p-3 bg-red-500/5">
            {err}
          </pre>
        )}
        {result && (
          <pre className="text-xs whitespace-pre-wrap border border-border rounded p-3 bg-muted overflow-auto max-h-80">
            {result}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
