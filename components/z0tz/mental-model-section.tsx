"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * The one-passkey / three-address-families mental model, delivered in under
 * 60 seconds of scrolling. Answers the first question any reader asks:
 * "okay so what actually IS this?"
 *
 * Every address on Z0tz derives from a single WebAuthn passkey. Three families
 * cover three intents: receive, compose, export. The reader needs this
 * upfront — it's the spine everything else hangs on.
 */

interface Family {
  name: string
  subtitle: string
  purpose: string
  examples: string[]
}

const families: Family[] = [
  {
    name: "Cash-in stealths",
    subtitle: "HKDF from passkey",
    purpose: "Disposable inboxes for receiving funds without clustering. A fresh one per scenario.",
    examples: ["Payroll address", "Shop checkout", "Invoice drop"],
  },
  {
    name: "Permanent smart",
    subtitle: "CREATE2 from passkey",
    purpose: "Stable smart-account addresses for DeFi positions that need a memorable identity.",
    examples: ["Aave collateral", "DAO voting", "Named wallet"],
  },
  {
    name: "Permanent EOA",
    subtitle: "HKDF, extractable",
    purpose: "Regular EOAs you can export into MetaMask when a dapp needs a plain secp256k1 signer.",
    examples: ["ENS name", "MetaMask import", "Legacy signing"],
  },
]

export function MentalModelSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="mental-model" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              The mental model
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
            One passkey, three addresses, one encryption layer
          </h2>
          <p className="mx-auto mb-16 max-w-3xl text-center text-base text-muted-foreground md:text-lg">
            You sign with a passkey. The wallet derives three kinds of addresses from it, each for
            a different purpose. Between those addresses and anything you touch on-chain sits an
            FHE encryption layer that keeps your balances ciphertext-only — until you choose to reveal.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {families.map((f) => (
              <div
                key={f.name}
                className="border border-foreground/30 p-6 transition-colors hover:bg-foreground/5"
              >
                <h3 className="text-lg font-bold uppercase tracking-wider text-foreground mb-1">
                  {f.name}
                </h3>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground mb-4">
                  {f.subtitle}
                </p>
                <p className="text-sm text-muted-foreground mb-4">{f.purpose}</p>
                <ul className="space-y-1 text-xs font-mono text-foreground/70">
                  {f.examples.map((ex) => (
                    <li key={ex}>· {ex}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-sm text-muted-foreground font-mono uppercase tracking-[0.15em]">
            Receive · Compose · Export
          </p>
        </div>
      </div>
    </section>
  )
}
