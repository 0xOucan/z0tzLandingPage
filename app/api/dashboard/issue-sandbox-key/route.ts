/**
 * Self-serve SANDBOX org-key issuance for a logged-in dashboard user.
 *
 * Tier is forced to "sandbox" — a verified/production key still requires
 * super-admin provisioning (talk-to-team flow). We call issueOrgKey
 * directly server-side (same primitive the admin endpoint uses), then link
 * the new key_id to the user's account. The plaintext key is returned ONCE
 * to the browser so the user can copy it; we never store it client-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { issueOrgKey } from "@/lib/indexer/turso-v7";
import { getSessionUser } from "@/lib/dashboard/session";
import { setUserOrgKey } from "@/lib/dashboard/auth";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const orgName = typeof body?.orgName === "string" && body.orgName.trim() ? body.orgName.trim() : user.username;
  const subdomainRoot = typeof body?.subdomainRoot === "string" && body.subdomainRoot.trim()
    ? body.subdomainRoot.trim().toLowerCase()
    : `${user.username}.z0tz`;

  try {
    const subdomainRootHash = keccak256(toBytes(subdomainRoot));
    const issued = await issueOrgKey({
      orgName,
      subdomainRootHash,
      tier: "sandbox",
      contactEmail: user.email,
    });
    // Link the new key to this dashboard user (replaces any prior link).
    await setUserOrgKey(user.id, issued.key_id);
    return NextResponse.json({
      key_id: issued.key_id,
      org_name: issued.org_name,
      subdomain_root: subdomainRoot,
      subdomain_root_hash: issued.subdomain_root_hash,
      tier: issued.tier,
      // Shown ONCE — copy it now.
      plaintext_api_key: issued.plaintext,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "issue failed" }, { status: 500 });
  }
}
