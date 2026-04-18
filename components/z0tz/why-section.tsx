"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * Why Z0tz — three-for-three benefit mapping.
 *
 * Left column: what most wallets leak.
 * Right column: what Z0tz gives you back.
 *
 * Benefits-framed, not feature-framed. One line each.
 */

const leaks = [
  { label: "Your identity", note: "one address, linked to everything you sign" },
  { label: "Your balance", note: "visible to any block explorer in real time" },
  { label: "Your pattern", note: "income cadence, counterparties, timing all legible" },
]

const gains = [
  { label: "Unlinkable identity", note: "three address families, one passkey, per-intent isolation" },
  { label: "Encrypted balance", note: "FHE ciphertext at rest; only you decrypt, gaslessly" },
  { label: "Indistinguishable cadence", note: "a shared sweeper aggregates every user's activity into one stream" },
]

export function WhySection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
            Why Z0tz
          </h2>

          <div className="grid md:grid-cols-2 gap-12 md:gap-24">
            <div className="text-muted-foreground">
              <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
                Most wallets leak
              </p>
              <ul className="space-y-4">
                {leaks.map((x) => (
                  <li key={x.label} className="flex gap-4">
                    <span className="text-foreground font-bold whitespace-nowrap">{x.label}</span>
                    <span>— {x.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-6 font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
                Z0tz gives back
              </p>
              <ul className="space-y-4 text-foreground">
                {gains.map((x) => (
                  <li key={x.label} className="flex gap-4">
                    <span className="font-bold whitespace-nowrap">{x.label}</span>
                    <span className="text-muted-foreground">— {x.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
