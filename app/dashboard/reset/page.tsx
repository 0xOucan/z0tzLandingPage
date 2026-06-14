"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/dashboard/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json?.error || "reset failed");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard/login"), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <CardDescription>
            {token ? "Set a new password using your admin-issued reset link." : "Missing reset token."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-green-500">Password updated. Redirecting to sign in…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="p">New password</Label>
                <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" disabled={!token} />
              </div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <Button type="submit" className="w-full" disabled={busy || !token}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground mt-4 text-center">
            <Link href="/dashboard/login" className="underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetInner />
    </Suspense>
  );
}
