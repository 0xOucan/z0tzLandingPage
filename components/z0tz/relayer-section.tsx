"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const endpoints = [
  { method: "POST", path: "/relay",         description: "Submit ERC-4337 UserOps (deploy, V6 tx)" },
  { method: "POST", path: "/fund-stealth",  description: "Fund a stealth EOA with ETH for sweep / CCTP gas" },
  { method: "POST", path: "/ledger-sweep",  description: "V6.5 privateSweepToLedger (cash-in → ledger credit)" },
  { method: "POST", path: "/ledger-op",     description: "V6.5 Ledger.spend (cashout, bridge, internal transfer)" },
  { method: "GET",  path: "/config",        description: "Contract addresses + useLedger flag + V6.5 ledger addrs" },
  { method: "GET",  path: "/health",        description: "Status" },
]

export function RelayerSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-8 text-center text-foreground">
          Z0tz Relayer
        </h2>

        <div className="max-w-2xl mx-auto">
          <p className="text-muted-foreground mb-2 text-center">
            The relayer submits UserOps, funds stealth gas, and routes V6.5 ledger operations.
          </p>
          <p className="text-muted-foreground mb-12 text-center">
            Users never touch ETH. The paymaster absorbs gas and recovers a 1% fee in the transacted token.
          </p>

          <div className="bg-secondary border border-foreground/30 p-6 mb-8">
            {endpoints.map((endpoint, index) => (
              <div
                key={index}
                className="flex items-center gap-4 py-2 border-b border-foreground/10 last:border-0"
              >
                <span className="text-accent font-bold w-12">
                  {endpoint.method}
                </span>
                <span className="text-foreground font-medium flex-1">
                  {endpoint.path}
                </span>
                <span className="text-muted-foreground text-sm">
                  → {endpoint.description}
                </span>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground mb-4 text-center text-sm">
            P-256 passkey authentication on every endpoint. Clients sign the canonical request body
            with their wallet passkey and include{" "}
            <code className="text-foreground">X-Z0tz-PubX</code>,{" "}
            <code className="text-foreground">X-Z0tz-PubY</code>, and{" "}
            <code className="text-foreground">X-Z0tz-Sig</code> headers. The relayer verifies against
            the smart-account owner before processing. Backward-compatible — requests without auth
            headers fall back to IP-based rate limiting.
          </p>

          <p className="text-muted-foreground mb-8 text-center text-sm">
            Self-hosted via <code className="text-foreground">npx tsx server.ts</code> for local dev.
            Deployed as Vercel API routes for production. Same auth, same routes.
          </p>
        </div>
      </div>
      </div>
    </section>
  )
}
