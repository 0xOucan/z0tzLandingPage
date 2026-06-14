import { NextRequest, NextResponse } from "next/server";
import { checkAdminKey, listUsers } from "@/lib/dashboard/auth";
import { listOrgKeys } from "@/lib/indexer/turso-v7";

// Super-admin: list dashboard users + issued org keys.
export async function GET(req: NextRequest) {
  if (!(await checkAdminKey(req.headers.get("x-z0tz-admin-key")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [users, orgKeys] = await Promise.all([listUsers(), listOrgKeys()]);
  return NextResponse.json({ users, orgKeys });
}
