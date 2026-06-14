import { NextRequest, NextResponse } from "next/server";
import { redeemResetToken } from "@/lib/dashboard/auth";

// Redeem an admin-issued one-time reset token to set a new password.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { token, password } = body ?? {};
  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "token and password required" }, { status: 400 });
  }
  try {
    const ok = await redeemResetToken(token, password);
    if (!ok) return NextResponse.json({ error: "invalid or expired token" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "reset failed" }, { status: 400 });
  }
}
