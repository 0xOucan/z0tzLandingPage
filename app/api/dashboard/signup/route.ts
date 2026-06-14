import { NextRequest, NextResponse } from "next/server";
import {
  signupUser,
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_S,
} from "@/lib/dashboard/auth";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { username, password, email } = body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }
  try {
    const user = await signupUser({ username, password, email: email ?? null });
    const token = signSession(user);
    const res = NextResponse.json({ ok: true, user: { username: user.username, role: user.role } });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "signup failed" }, { status: 400 });
  }
}
