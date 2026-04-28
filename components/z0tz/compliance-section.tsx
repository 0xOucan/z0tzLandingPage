"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

interface Layer {
  title: string
  enforcement: string
  body: string
  defaultPosture: string
}

const layers: Layer[] = [
  {
    title: "On-chain AML gate",
    enforcement: "Smart contract",
    body: "A pure predicate contract that vaults, sweepers, and bridges consult before integrating funds. If the funder is on the OFAC / sanctions deny-list, the call reverts with a typed reason. The gate has zero token-moving authority — it answers yes or no, never holds value. Funds stay at the user's wallet keys regardless.",
    defaultPosture: "On by default — Z0tz refuses sanctioned funds at the boundary.",
  },
  {
    title: "Relayer geofencing",
    enforcement: "API layer (HTTP)",
    body: "Restricted regions hit a 403 at the relayer before anything lands on chain. Country list matches the published OFAC sanctions set. Localhost and private-network requests pass through so local development isn't broken.",
    defaultPosture: "On by default — Z0tz's relayer refuses requests from restricted regions.",
  },
  {
    title: "KYC supplier (on-demand)",
    enforcement: "Off-chain provider, on-chain boolean",
    body: "Bridges to standard providers (Sumsub, Persona, Chainalysis KYT) when a dApp or institution integrating Z0tz as an SDK needs it. The supplier owns the verification flow; Z0tz only stores the yes/no answer plus an optional expiry. No documents, no PII, no biometrics on Z0tz's side.",
    defaultPosture: "Off by default — opt-in per integration. dApps and institutions enable it for their own users.",
  },
]

interface DefiPoint {
  label: string
  body: string
}

const defiPoints: DefiPoint[] = [
  {
    label: "Compliance-aware composition",
    body: "Confidential DeFi runs through the same gate. A flagged depositor can't compose with Aave, Morpho, or any vault we wire — the rejection happens before the encrypted balance is ever touched.",
  },
  {
    label: "Late-discovery enforcement",
    body: "Oracles flag addresses hours after an incident. If a user deposited clean and the depositor was flagged later, the gate re-checks at every cash-out and bridge. Tainted contributions stay in the ledger; clean portions exit as normal.",
  },
  {
    label: "Refuse, don't hold",
    body: "When a check fails we don't move funds into a custody vault. We refuse to integrate; the value remains at the user-controlled stealth EOA. The user keeps their keys; Z0tz keeps no custody risk.",
  },
]

export function ComplianceSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="compliance" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              Risk mitigation, not custody
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
            Three layers, one posture
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
            Z0tz refuses to lend its confidentiality to bad actors and refuses
            to take custody of anyone&apos;s funds. AML and geofencing run by
            default; KYC is on-demand for dApps and institutions integrating
            Z0tz as an SDK. We enforce at integration boundaries, never at the
            wallet boundary.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {layers.map((l) => (
              <div
                key={l.title}
                className="border border-foreground/30 p-6 flex flex-col bg-secondary transition-colors hover:bg-foreground/5"
              >
                <div className="mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bright-red)]/80">
                    {l.enforcement}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">{l.title}</h3>
                <p className="text-sm text-muted-foreground mb-6 flex-1 leading-relaxed">
                  {l.body}
                </p>
                <div className="pt-4 border-t border-foreground/15">
                  <span className="text-xs text-foreground/80 font-mono">
                    {l.defaultPosture}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Posture summary block */}
          <div className="border border-foreground/30 p-8 bg-background mb-16">
            <h3 className="text-base md:text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              The posture, in plain terms
            </h3>
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-[var(--bright-red)] font-mono text-xs uppercase tracking-wider mb-3">
                  Z0tz never
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>holds or freezes flagged funds</li>
                  <li>routes user money to a compliance custody vault</li>
                  <li>has an admin who can release seized assets</li>
                  <li>auto-returns funds to sanctioned senders</li>
                  <li>stores PII or KYC documents on chain or in our infrastructure</li>
                </ul>
              </div>
              <div>
                <p className="text-[var(--bright-red)] font-mono text-xs uppercase tracking-wider mb-3">
                  Z0tz does
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>refuse encryption / wrap of flagged USDC at the sweep boundary</li>
                  <li>refuse DeFi composition + bridges that originate from flagged depositors</li>
                  <li>refuse to sponsor gas for any operation a check denies</li>
                  <li>offer a paymaster-funded refund of non-OFAC rejections back to the depositor (opt-in)</li>
                  <li>show the user a clear reason whenever a check rejects an action</li>
                </ul>
              </div>
            </div>
          </div>

          {/* DeFi-specific callout */}
          <div className="border border-foreground/30 p-8 bg-secondary">
            <div className="mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bright-red)]/80">
                Confidential DeFi
              </span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground mb-3">
              How this looks for DeFi
            </h3>
            <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed max-w-3xl">
              Confidential DeFi composition is where the compliance posture
              earns its keep. Vaults like Tezcatli&apos;s confidential USDC
              deposit are the obvious choke point — funds enter the encrypted
              ledger only if the gate accepts them, and they exit only if the
              gate still accepts them at withdraw time.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {defiPoints.map((p) => (
                <div key={p.label}>
                  <p className="text-foreground font-bold text-sm mb-2">
                    {p.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
