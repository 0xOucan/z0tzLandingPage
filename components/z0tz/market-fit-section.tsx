"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const ecosystemLayers = [
  { layer: "FHE Runtime", provider: "Fhenix CoFHE", z0tz: "—" },
  { layer: "Encrypted Wrap (FHERC20)", provider: "Fhenix", z0tz: "Vault holds the wrap; sweeper gates access" },
  { layer: "Encrypted Ledger", provider: "Z0tz", z0tz: "Pseudonymous IDs → ciphertext handles; gasless viewer permits for off-chain decrypt" },
  { layer: "Cross-chain Transport", provider: "Circle CCTP V2", z0tz: "Routes via ephemeral stealth pairs on both sides" },
  { layer: "Wallet & Identity", provider: "Z0tz", z0tz: "P-256 passkeys (WebAuthn) — one passkey derives three stealth families" },
  { layer: "Gasless Execution", provider: "Z0tz", z0tz: "ERC-4337 + paymaster + relayer — users never hold ETH" },
  { layer: "Multi-sweep Inboxes", provider: "Z0tz", z0tz: "sweepNonceV2 allows recurring deposits at stable addresses" },
  { layer: "Recovery", provider: "Z0tz", z0tz: "Steganographic PNG + encrypted ZIP + QR" },
]

const stack = [
  { layer: "FHE encryption engine", provider: "Fhenix CoFHE SDK" },
  { layer: "Encrypted token standard (FHERC20)", provider: "Fhenix" },
  { layer: "Cross-chain USDC transport", provider: "Circle CCTP V2" },
  { layer: "Encrypted ledger + vault", provider: "Z0tz" },
  { layer: "Multi-sweep sweeper (V6.5.2)", provider: "Z0tz" },
  { layer: "Wallet identity (P-256 passkeys)", provider: "Z0tz" },
  { layer: "Account abstraction (ERC-4337 v0.8)", provider: "Z0tz" },
  { layer: "Gasless UX (paymaster + relayer)", provider: "Z0tz" },
  { layer: "Three stealth-address families", provider: "Z0tz" },
  { layer: "Steganographic recovery", provider: "Z0tz" },
]

export function MarketFitSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="market-fit" className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Z0tz in the Fhenix Ecosystem
        </h2>
        <p className="text-center text-muted-foreground mb-4 max-w-2xl mx-auto">
          Fhenix and CoFHE bring FHE to EVM — encrypted computation on-chain.
          Z0tz builds the wallet layer that makes it usable: encrypted ledger,
          gasless UX, three address families, cross-chain bridging.
        </p>
        <p className="text-center text-foreground font-medium mb-12 max-w-2xl mx-auto">
          Fhenix encrypts the computation. Z0tz encrypts everything around it.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          <div className="border border-foreground/30 p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              Why it matters
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>Every Fhenix dApp needs a wallet — <span className="text-foreground">Z0tz provides it</span></li>
              <li>FHE adoption depends on UX — <span className="text-foreground">gasless, seedless, passkey-native</span></li>
              <li>CoFHE SDK is native — <span className="text-foreground">ledger + vault use CoFHE for all FHE ops</span></li>
              <li>Cross-chain from day one — <span className="text-foreground">real USDC via Circle CCTP V2</span></li>
              <li>Composable — <span className="text-foreground">any permissionless protocol plugs in via the stealth pattern</span></li>
            </ul>
          </div>

          <div className="border border-foreground/30 bg-secondary p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              V6.5 — what ships today
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li><span className="text-foreground font-bold">Encrypted ledger</span> — balances as FHE ciphertext handles under pseudonymous IDs</li>
              <li><span className="text-foreground font-bold">Vault</span> — holds the FHERC20 wrap; single shield/unshield gate</li>
              <li><span className="text-foreground font-bold">Sweeper V6.5.2</span> — multi-sweep for recurring deposits; 1% fee; anonymity set = user count</li>
              <li><span className="text-foreground font-bold">Three stealth families</span> — cash-in HKDF, permanent CREATE2, extractable EOA</li>
              <li><span className="text-foreground font-bold">Gasless viewer permit</span> — decrypt balance off-chain, no on-chain reveal tx</li>
            </ul>
          </div>
        </div>

        <Expandable
          title="Full ecosystem stack"
          summary="Per-layer breakdown of who provides what, and how Z0tz composes with external permissionless infrastructure."
          moreLabel="see the full stack"
          lessLabel="hide the full stack"
        >
          <h3 className="text-base font-bold uppercase tracking-wider mb-4 text-foreground">
            Ecosystem layers
          </h3>
          <div className="overflow-x-auto mb-12">
            <table className="w-full border border-foreground text-sm">
              <thead>
                <tr className="border-b border-foreground">
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Layer</th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Provider</th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">What Z0tz Adds</th>
                </tr>
              </thead>
              <tbody>
                {ecosystemLayers.map((row) => (
                  <tr key={row.layer} className="border-b border-foreground/20 transition-colors hover:bg-foreground/5">
                    <td className="p-3 font-medium text-foreground">{row.layer}</td>
                    <td className={`p-3 ${row.provider === "Z0tz" ? "text-foreground font-bold" : "text-muted-foreground"}`}>{row.provider}</td>
                    <td className="p-3 text-muted-foreground">{row.z0tz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-bold uppercase tracking-wider mb-4 text-foreground">
            Built on
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border border-foreground text-sm">
              <thead>
                <tr className="border-b border-foreground">
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Stack Layer</th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">Provided By</th>
                </tr>
              </thead>
              <tbody>
                {stack.map((row) => (
                  <tr key={row.layer} className="border-b border-foreground/20 transition-colors hover:bg-foreground/5">
                    <td className="p-3 text-foreground">{row.layer}</td>
                    <td className={`p-3 font-medium ${row.provider.includes("Fhenix") || row.provider.includes("Circle") ? "text-muted-foreground" : "text-foreground"}`}>{row.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-muted-foreground text-sm mt-8">
            Fhenix encrypts computation. Circle moves USDC. ERC-4337 abstracts accounts.
            Z0tz threads them together so the user stays private through all of it.
          </p>
        </Expandable>
      </div>
      </div>
    </section>
  )
}
