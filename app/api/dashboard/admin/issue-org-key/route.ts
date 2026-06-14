/**
 * Super-admin: provision an org HMAC key (any tier) and optionally link it
 * to an existing dashboard user. Thin wrapper over the issueOrgKey
 * primitive, gated by X-Z0tz-Admin-Key.
 */
import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { issueOrgKey } from "@/lib/indexer/turso-v7";
import { checkAdminKey, getUserByUsername, setUserOrgKey } from "@/lib/dashboard/auth";

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
  const { orgName, subdomainRoot, tier, contactEmail, linkUsername } = body ?? {};
  if (typeof orgName !== "string" || typeof subdomainRoot !== "string") {
    return NextResponse.json({ error: "orgName and subdomainRoot required" }, { status: 400 });
  }
  try {
    const subdomainRootHash = keccak256(toBytes(String(subdomainRoot).toLowerCase()));
    const issued = await issueOrgKey({
      orgName,
      subdomainRootHash,
      tier: tier === "verified" ? "verified" : "sandbox",
      contactEmail: contactEmail ?? null,
    });
    let linked: string | null = null;
    if (typeof linkUsername === "string" && linkUsername.trim()) {
      const u = await getUserByUsername(linkUsername.trim());
      if (u) {
        await setUserOrgKey(Number(u.id), issued.key_id);
        linked = linkUsername.trim().toLowerCase();
      }
    }
    return NextResponse.json({
      key_id: issued.key_id,
      org_name: issued.org_name,
      subdomain_root_hash: issued.subdomain_root_hash,
      tier: issued.tier,
      plaintext_api_key: issued.plaintext,
      linked_username: linked,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "issue failed" }, { status: 500 });
  }
}
