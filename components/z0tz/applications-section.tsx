"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * What you can do with Z0tz — applications, not features.
 *
 * Each card is a user story grounded in the composition pattern: a concrete
 * scenario, the address family it uses, the external protocol it composes
 * with. This is the section first-reader feedback asked for — "benefits
 * and applications, not features".
 */

interface Application {
  scenario: string
  detail: string
  family: string
  composesWith: string
}

const apps: Application[] = [
  {
    scenario: "Get paid privately",
    detail:
      "Publish one Cash-in stealth address to a payroll system. Recurring deposits land at a stable inbox and fold into your encrypted ledger without clustering on-chain.",
    family: "Cash-in stealth (multi-sweep)",
    composesWith: "Any payroll tool that sends USDC",
  },
  {
    scenario: "Shop without revealing your balance",
    detail:
      "Pay a merchant from a one-time address that holds only the transaction amount. The merchant sees the payment; nobody sees what you own.",
    family: "Cash-in stealth (one-shot)",
    composesWith: "Any ERC-20 checkout",
  },
  {
    scenario: "Bridge without a trace",
    detail:
      "Cross-chain transfers route through a fresh stealth on each side of Circle's CCTP. The bridge's public events connect two random addresses — neither of them yours.",
    family: "Ephemeral stealth pair",
    composesWith: "Circle CCTP V2",
  },
  {
    scenario: "Use DeFi privately",
    detail:
      "Interact with a DEX, lending market, NFT mint, or governance vote from a fresh stealth that pulls funds from the encrypted ledger for one operation and disappears. The protocol doesn't need to know Z0tz exists.",
    family: "Stealth as one-time proxy",
    composesWith: "Any permissionless EVM protocol",
  },
  {
    scenario: "Hold long-term without publishing",
    detail:
      "Your encrypted balance lives under a pseudonymous ledger ID that rotates on every spend. Past activity doesn't predict future activity; observers can't cluster you.",
    family: "Encrypted ledger + auto-rotation",
    composesWith: "Fhenix CoFHE threshold network",
  },
  {
    scenario: "Recover without a seed phrase",
    detail:
      "Guardians, a QR backup, or a steganographic PNG restore the passkey. No twelve-word mnemonic to write down, photograph, or lose.",
    family: "Recovery module",
    composesWith: "Your phone, any device with WebAuthn",
  },
]

export function ApplicationsSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="applications" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              What you can do with it
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
            Six things, same passkey
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
            Every scenario below is a composition: a stealth gives the external protocol a one-time
            identity to talk to, the sweeper mixes the return leg, and your encrypted ledger closes
            the loop. The protocols don't change. Your identity just stops appearing in them.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((a) => (
              <div
                key={a.scenario}
                className="border border-foreground/30 p-6 flex flex-col transition-colors hover:bg-foreground/5"
              >
                <h3 className="text-lg font-bold text-foreground mb-3">{a.scenario}</h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1">{a.detail}</p>
                <div className="space-y-1 pt-4 border-t border-foreground/15">
                  <div className="flex gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-[var(--bright-red)]/80">uses</span>
                    <span className="text-foreground/80">{a.family}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-[var(--bright-red)]/80">with</span>
                    <span className="text-foreground/80">{a.composesWith}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
