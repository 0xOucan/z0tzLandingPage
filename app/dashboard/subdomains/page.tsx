import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dashboard/session";
import { OrgActionCard } from "@/components/z0tz/dashboard/org-action";

export const dynamic = "force-dynamic";

export default async function SubdomainsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subdomains</h1>
        <p className="text-sm text-muted-foreground">
          Onboard users under your subdomain root, repoint, or revoke a leaf. Claims are signed by
          your org admin&apos;s P-256 key; the relayer pays gas.
        </p>
      </div>

      <OrgActionCard
        title="Claim subdomain"
        description="Onboard a user (e.g. arturo.acme.z0tz) under your root."
        action="subdomain"
        endpoint="POST /api/v7/org/subdomain"
        sample={{
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
        }}
      />

      <OrgActionCard
        title="Repoint subdomain"
        description="Point an existing leaf at a new user pubkey + resolved account."
        action="repoint"
        endpoint="POST /api/v7/org/subdomain/repoint"
        sample={{
          chainId: 84532,
          claim: {
            leafNameHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            newUserPubX: "0",
            newUserPubY: "0",
            newResolvedAccount: "0x0000000000000000000000000000000000000000",
            adminPubX: "0",
            adminPubY: "0",
            deadline: "0",
            sigR: "0",
            sigS: "0",
          },
        }}
      />

      <OrgActionCard
        title="Revoke subdomain"
        description="Revoke a subdomain leaf."
        action="revoke"
        endpoint="POST /api/v7/org/subdomain/revoke"
        sample={{
          chainId: 84532,
          claim: {
            leafNameHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            adminPubX: "0",
            adminPubY: "0",
            deadline: "0",
            sigR: "0",
            sigS: "0",
          },
        }}
      />
    </div>
  );
}
