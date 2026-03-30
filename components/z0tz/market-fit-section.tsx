"use client"

const ecosystemLayers = [
  { layer: "FHE Runtime", provider: "Fhenix / CoFHE", z0tz: "—" },
  { layer: "Encrypted Contracts", provider: "FHERC20, FHE.sol", z0tz: "Wraps with gasless UX" },
  { layer: "Wallet & Identity", provider: "Z0tz", z0tz: "P-256 passkeys, no seed phrases" },
  { layer: "Transaction Privacy", provider: "Z0tz", z0tz: "ERC-4337 + relayer + paymaster" },
  { layer: "Payment Privacy", provider: "Z0tz", z0tz: "Stealth addresses (ERC-5564/6538)" },
  { layer: "Cross-chain", provider: "Z0tz", z0tz: "Lock-and-mint bridge with FHE tokens" },
  { layer: "Recovery", provider: "Z0tz", z0tz: "Steganographic + guardian recovery" },
]

const stack = [
  { layer: "FHE encryption engine", provider: "Fhenix CoFHE SDK" },
  { layer: "Encrypted contracts (FHERC20)", provider: "Fhenix" },
  { layer: "Wallet identity (P-256 passkeys)", provider: "Z0tz" },
  { layer: "Account abstraction (ERC-4337)", provider: "Z0tz" },
  { layer: "Gasless UX (paymaster)", provider: "Z0tz" },
  { layer: "Stealth addresses (ERC-5564/6538)", provider: "Z0tz" },
  { layer: "Cross-chain bridge", provider: "Z0tz" },
  { layer: "Steganographic recovery", provider: "Z0tz" },
]

export function MarketFitSection() {
  return (
    <section id="market-fit" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          The Wallet Layer for FHE
        </h2>
        <p className="text-center text-muted-foreground mb-4 max-w-2xl mx-auto">
          Fhenix and CoFHE bring FHE to EVM — encrypted computation on-chain.
          But FHE without a private wallet is incomplete.
        </p>
        <p className="text-center text-foreground font-medium mb-16 max-w-2xl mx-auto">
          FHE encrypts the computation. Z0tz encrypts everything else.
        </p>

        {/* Ecosystem Layers Table */}
        <h3 className="text-xl font-bold uppercase tracking-wider mb-6 text-foreground">
          Z0tz in the Fhenix Ecosystem
        </h3>
        <div className="overflow-x-auto mb-16">
          <table className="w-full border border-foreground text-sm">
            <thead>
              <tr className="border-b border-foreground">
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  FHE Layer
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  Provider
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  What Z0tz Adds
                </th>
              </tr>
            </thead>
            <tbody>
              {ecosystemLayers.map((row) => (
                <tr
                  key={row.layer}
                  className={`border-b border-foreground/20 transition-colors hover:bg-foreground/5 ${
                    row.provider === "Z0tz" ? "" : ""
                  }`}
                >
                  <td className="p-3 font-medium text-foreground">{row.layer}</td>
                  <td className={`p-3 ${row.provider === "Z0tz" ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                    {row.provider}
                  </td>
                  <td className="p-3 text-muted-foreground">{row.z0tz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Why it matters */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="border border-foreground/30 p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              Why This Matters
            </h3>
            <ul className="space-y-3 text-muted-foreground">
              <li>Every Fhenix dApp needs a wallet — <span className="text-foreground">Z0tz provides it as an SDK</span></li>
              <li>FHE adoption depends on UX — <span className="text-foreground">Z0tz makes it gasless and seedless</span></li>
              <li>CoFHE SDK integration is native — <span className="text-foreground">already uses CoFHE for encryption</span></li>
              <li>Multi-chain from day one — <span className="text-foreground">deployed on 3 testnets, bridge included</span></li>
            </ul>
          </div>

          {/* SDK Example */}
          <div className="border border-foreground/30 bg-secondary p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              SDK Integration
            </h3>
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">import</span> <span className="text-foreground">{"{ Z0tzSDK }"}</span> <span className="text-muted-foreground">from</span> <span className="text-foreground">&quot;@z0tz/sdk&quot;</span></div>
              <div className="text-muted-foreground">&nbsp;</div>
              <div className="text-muted-foreground">// Any Fhenix dApp can offer private wallets</div>
              <div><span className="text-muted-foreground">const</span> <span className="text-foreground">wallet</span> = <span className="text-muted-foreground">await</span> <span className="text-foreground">z0tz.createWallet()</span></div>
              <div><span className="text-muted-foreground">await</span> <span className="text-foreground">z0tz.shield(wallet, &quot;USDC&quot;, 1000)</span></div>
              <div><span className="text-muted-foreground">await</span> <span className="text-foreground">z0tz.transfer(wallet, to, 100)</span></div>
              <div><span className="text-muted-foreground">const</span> <span className="text-foreground">addr</span> = <span className="text-foreground">z0tz.generateStealthAddress(meta)</span></div>
            </div>
          </div>
        </div>

        {/* Built on Fhenix */}
        <h3 className="text-xl font-bold uppercase tracking-wider mb-6 text-foreground">
          Built on Fhenix
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
                  <td className={`p-3 font-medium ${row.provider.includes("Fhenix") ? "text-muted-foreground" : "text-foreground"}`}>
                    {row.provider}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-foreground font-medium mt-8">
          Z0tz completes the Fhenix stack. Fhenix encrypts computation. Z0tz encrypts the user.
        </p>
      </div>
    </section>
  )
}
