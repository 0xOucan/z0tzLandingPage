import { NextRequest, NextResponse } from "next/server";
import { checkAdminKey, issueResetToken } from "@/lib/dashboard/auth";

// Super-admin: mint a one-time password-reset token for a user. Returns a
// reset link the admin hands to the user out-of-band (no email).
export async function POST(req: NextRequest) {
  if (!(await checkAdminKey(req.headers.get("x-z0tz-admin-key")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const username = body?.username;
  if (typeof username !== "string") {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }
  const token = await issueResetToken(username);
  if (!token) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const origin =
    (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "";
  return NextResponse.json({
    token,
    reset_link: `${origin}/dashboard/reset?token=${token}`,
    expires_in_hours: 24,
  });
}
