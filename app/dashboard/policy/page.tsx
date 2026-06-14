import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/dashboard/session";
import { OrgActionCard } from "@/components/z0tz/dashboard/org-action";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dashboard/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Policy</h1>
        <p className="text-sm text-muted-foreground">
          Attach a deployed policy contract to your org&apos;s subdomain root. The server scope-checks
          that <code className="bg-muted px-1 rounded">rootNameHash</code> matches your key.
        </p>
      </div>

      <OrgActionCard
        title="Set org policy"
        description="Bind a policy contract to your subdomain root."
        action="policy"
        endpoint="POST /api/v7/org/policy"
        sample={{
          chainId: 84532,
          claim: {
            rootNameHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
            policy: "0x0000000000000000000000000000000000000000",
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
