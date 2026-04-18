"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * How Z0tz fits with the rest of the on-chain world.
 *
 * How Z0tz fits with the rest of permissionless on-chain infrastructure —
 * the composability story, front-and-center instead of buried.
 *
 * Thesis: stealth-as-proxy + sweeper-as-mixer + CCTP as proof.
 * The ecosystem tables stay available, collapsed, for the curious.
 */

const ecosystemLayers = [
  { layer: "FHE runtime", provider: "Fhenix CoFHE", note: "Encrypted computation, threshold decryption" },
  { layer: "Encrypted wrap (FHERC20)", provider: "Fhenix", note: "Vault holds the wrap; sweeper gates access" },
  { layer: "Cross-chain transport", provider: "Circle CCTP V2", note: "Routes via stealth pair on both sides" },
  { layer: "Account abstraction", provider: "ERC-4337", note: "Paymaster sponsors every op; users hold zero ETH" },
  { layer: "P-256 verification", provider: "RIP-7212", note: "~3.5K gas per verify, live post-Pectra" },
  { layer: "Stealth derivation", provider: "ERC-5564 / 6538", note: "One-time addresses from a meta-address" },
  { layer: "Encrypted ledger", provider: "Z0tz", note: "Pseudonymous IDs → ciphertext handles; gasless viewer permits" },
  { layer: "Sweeper", provider: "Z0tz", note: "The one msg.sender for every shield — mixing without a pool" },
]

export function ComposabilitySection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="composability" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              How it fits
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
            Composes with what already exists
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-foreground font-medium">
            Fhenix encrypts the computation. Z0tz encrypts everything around it.
          </p>

          {/* The three primitives that make composition work */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="border border-foreground/30 p-6 transition-colors hover:bg-foreground/5">
              <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--bright-red)] mb-3">
                Entry
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                Stealth as proxy
              </h3>
              <p className="text-sm text-muted-foreground">
                A one-time address gives any protocol an identity to talk to — never yours.
              </p>
            </div>

            <div className="border border-foreground/30 p-6 transition-colors hover:bg-foreground/5">
              <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--bright-red)] mb-3">
                Return leg
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                Sweeper as mixer
              </h3>
              <p className="text-sm text-muted-foreground">
                Every user flows through the same sweeper. One shape, no pool, no queue.
              </p>
            </div>

            <div className="border border-foreground/30 p-6 transition-colors hover:bg-foreground/5">
              <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--bright-red)] mb-3">
                At rest
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                Pseudonymous ledger
              </h3>
              <p className="text-sm text-muted-foreground">
                Balances under HKDF(passkey) — rotates on every spend, never indexes your wallet.
              </p>
            </div>
          </div>

          {/* The CCTP proof */}
          <div className="border border-foreground/40 p-6 mb-12 bg-secondary/30">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)] mb-2 text-center">
              Proof of the pattern
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3 text-center">
              If it works for CCTP, it works for anything
            </h3>
            <p className="text-sm text-muted-foreground max-w-3xl mx-auto text-center">
              Cross-chain is the hardest case — two chains, an unavoidable plaintext window.
              Z0tz wraps Circle&apos;s CCTP V2 in a stealth pair; the bridge&apos;s public events
              connect two random addresses, neither of them yours. The same template applies to
              DEXes, lending markets, NFT mints, governance votes. The protocol never has to know.
            </p>
          </div>

          <Expandable
            title="Full ecosystem stack"
            summary="Per-layer breakdown of who provides what, and how the pieces compose."
            moreLabel="see the full stack"
            lessLabel="hide the full stack"
          >
            <div className="overflow-x-auto">
              <table className="w-full border border-foreground text-sm">
                <thead>
                  <tr className="border-b border-foreground">
                    <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Layer</th>
                    <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Provider</th>
                    <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {ecosystemLayers.map((row) => (
                    <tr key={row.layer} className="border-b border-foreground/20 transition-colors hover:bg-foreground/5">
                      <td className="p-3 font-medium text-foreground">{row.layer}</td>
                      <td className={`p-3 ${row.provider === "Z0tz" ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                        {row.provider}
                      </td>
                      <td className="p-3 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Expandable>
        </div>
      </div>
    </section>
  )
}
