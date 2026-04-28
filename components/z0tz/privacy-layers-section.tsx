"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const layers = [
  { layer: "Identity", tech: "P-256 passkeys", protects: "Who you are" },
  { layer: "State", tech: "FHE (CoFHE/Fhenix)", protects: "What you own" },
  { layer: "Execute", tech: "ERC-4337 + relayer", protects: "How you transact" },
  { layer: "Network", tech: "TOR / NYM routing", protects: "Where you connect" },
  { layer: "Payments", tech: "Stealth addresses", protects: "Who you pay" },
  { layer: "Recovery", tech: "Steganographic PNG", protects: "How you recover" },
  { layer: "Gas", tech: "Z0tzPaymaster", protects: "That you even tx" },
  { layer: "Compliance", tech: "Gate + KYC supplier + geofencing", protects: "The protocol from bad actors" },
]

export function PrivacyLayersSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section className="py-24 px-6 bg-secondary">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Privacy Layers
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full border border-foreground text-sm md:text-base">
            <thead>
              <tr className="border-b border-foreground">
                <th className="text-left p-4 uppercase tracking-wider font-bold text-foreground">
                  Layer
                </th>
                <th className="text-left p-4 uppercase tracking-wider font-bold text-foreground">
                  Technology
                </th>
                <th className="text-left p-4 uppercase tracking-wider font-bold text-foreground">
                  What it protects
                </th>
              </tr>
            </thead>
            <tbody>
              {layers.map((row, index) => (
                <tr
                  key={index}
                  className="border-b border-foreground/30 transition-colors hover:bg-foreground/5"
                >
                  <td className="p-4 font-medium text-foreground">{row.layer}</td>
                  <td className="p-4 text-muted-foreground">{row.tech}</td>
                  <td className="p-4 text-muted-foreground">{row.protects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </section>
  )
}
