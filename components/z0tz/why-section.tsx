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
        <p className="mx-auto mb-16 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
          Most wallets show the world your balance, your counterparties, your cadence.
          Z0tz keeps those on your device and out of public chains — without asking you
          to learn a new asset or trust a custodian.
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
                <span>— addresses linked to real-world accounts</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Behavior</span>
                <span>— every transaction legible to anyone</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Metadata</span>
                <span>— IP, timing, and patterns tracked</span>
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
                <span className="text-muted-foreground">— FHE-encrypted ledger on chain, decrypt off-chain</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Counterparty</span>
                <span className="text-muted-foreground">— three kinds of stealth addresses, all from one passkey</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Cadence</span>
                <span className="text-muted-foreground">— multi-sweep inboxes hide recurring-deposit patterns</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Gas</span>
                <span className="text-muted-foreground">— paymaster-sponsored, no ETH balance to trace</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}
