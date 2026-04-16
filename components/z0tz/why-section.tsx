"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

export function WhySection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
          Why Z0tz
        </h2>
        <p className="mx-auto mb-16 max-w-3xl text-center text-base text-muted-foreground md:text-lg">
          Z0tz keeps private balances on chain, inside a vault that posts only
          ciphertext handles and a ledger that maps those handles to pseudonymous
          IDs. Funds stay verifiable and permissionless — just not legible to
          anyone but you.
        </p>

        <div className="grid md:grid-cols-2 gap-12 md:gap-24">
          {/* The Problem */}
          <div className="text-muted-foreground">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              Most wallets expose
            </p>
            <ul className="space-y-4">
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Identity</span>
                <span>— one address, linked to everything you sign</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Balance</span>
                <span>— visible to any block explorer in real time</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Pattern</span>
                <span>— income cadence, counterparties, timing all legible</span>
              </li>
            </ul>
          </div>

          {/* The Solution */}
          <div>
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              Z0tz keeps private
            </p>
            <ul className="space-y-4 text-foreground">
              <li className="flex gap-4">
                <span className="font-bold">Balance</span>
                <span className="text-muted-foreground">— stored as FHE ciphertext in a vault; the ledger only sees handles</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Counterparty</span>
                <span className="text-muted-foreground">— three stealth-address families, all derived from one passkey</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Cadence</span>
                <span className="text-muted-foreground">— multi-sweep inboxes receive recurring deposits without clustering</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Rails</span>
                <span className="text-muted-foreground">— Circle CCTP today, any permissionless protocol tomorrow</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-16 max-w-3xl text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Powered by <span className="text-foreground">Fhenix CoFHE SDK</span> · Circle <span className="text-foreground">CCTP V2</span> · ERC-4337 account abstraction
        </p>
      </div>
      </div>
    </section>
  )
}
