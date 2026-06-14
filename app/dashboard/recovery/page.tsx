import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dashboard/session";
import { OrgActionCard } from "@/components/z0tz/dashboard/org-action";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recovery</h1>
        <p className="text-sm text-muted-foreground">
          Initiate org-assisted account recovery. The recovery hub derives the org root + admin
          pubkey on-chain and enforces the policy delay; your org admin signs the digest.
        </p>
      </div>

      <OrgActionCard
        title="Initiate recovery"
        description="Start recovery for a user smart-account to a new owner pubkey."
        action="recover"
        endpoint="POST /api/v7/org/recover"
        sample={{
          chainId: 84532,
          claim: {
            account: "0x0000000000000000000000000000000000000000",
            newOwnerX: "0",
            newOwnerY: "0",
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
