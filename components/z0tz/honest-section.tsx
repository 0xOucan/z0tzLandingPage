"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

interface PrivacyRow {
  op: string
  publicData: string
  privateData: string
  notes: string
}

/**
 * V6.5 operation map. Names match the contracts and the GUI wiring — not the
 * legacy V6 shield/unshield vocabulary. Content reinterprets the concepts
 * from docs/internal/z0tz-article-v6.5.md rather than quoting it.
 */
const rows: PrivacyRow[] = [
  {
    op: "Faucet · external deposit",
    publicData: "Recipient stealth EOA, plaintext USDC amount",
    privateData: "—",
    notes: "The initial hop is a standard ERC-20 transfer. Amounts are visible until the sweeper runs.",
  },
  {
    op: "privateSweepToLedger",
    publicData: "Stealth EOA, plaintext USDC amount, 1% fee, ledger ID, sweep nonce",
    privateData: "Credit amount is posted to the ledger as an encrypted handle, not a number",
    notes: "The sweeper is the one chokepoint for every cash-in. Its call set is the anonymity set.",
  },
  {
    op: "Vault.creditFromVault",
    publicData: "Vault, ledger, pseudonymous ledger ID, ciphertext handle",
    privateData: "Balance amount (FHE-encrypted euint64)",
    notes: "The vault holds the wrap; the ledger records only handles. Observers see routing, not value.",
  },
  {
    op: "Ledger.spend · same-chain cashout",
    publicData: "Old ledger ID, new ledger ID, spend action, ephemeral stealth recipient",
    privateData: "Post-spend balance, debit amount",
    notes: "One rotation per spend: the pseudonymous ID changes so past spends don't predict future ones.",
  },
  {
    op: "CCTP V2 depositForBurn",
    publicData: "Ephemeral stealth depositor, destDomain, mint recipient, plaintext USDC amount",
    privateData: "—",
    notes: "Circle's permissionless burn. Both ends are one-time stealth EOAs — the user's account never appears.",
  },
  {
    op: "CCTP V2 receiveMessage",
    publicData: "Ephemeral stealth recipient, plaintext USDC amount",
    privateData: "—",
    notes: "Mint on the destination chain lands at the ephemeral; it's either swept into a ledger or forwarded to a target EOA.",
  },
  {
    op: "Viewer permit decrypt",
    publicData: "FHE.allow grant — ledger ID, viewer address, ciphertext handle",
    privateData: "Decrypted amount (returned off-chain only, to the viewer EOA)",
    notes: "No on-chain reveal tx. The CoFHE threshold network verifies the permit and returns plaintext to you.",
  },
  {
    op: "ERC-4337 UserOp execution",
    publicData: "Sender smart account, paymaster, full inner calldata, gas",
    privateData: "—",
    notes: "Smart-account UserOps don't hide function names or args. Calldata-level privacy is network-layer, not contract-layer.",
  },
  {
    op: "Stealth generation · passkey HKDF",
    publicData: "The stealth EOA itself when it appears on chain",
    privateData: "The derivation index, the passkey, the link back to other addresses you control",
    notes: "Cashin stealths, permanent smart accounts, permanent EOAs all derive from one passkey — the derivation map never leaves your device.",
  },
]

export function HonestSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="honesty" className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-12 text-center text-foreground">
          What&apos;s public, what&apos;s private
        </h2>

        {/* Honest claims cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-10">
          <div className="border border-foreground/30 p-6 bg-secondary">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              We don&apos;t claim
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>
                <span className="text-foreground font-bold">Zero on-chain footprint.</span>{" "}
                Every op leaves a public row. Encryption hides amounts, not existence.
              </li>
              <li>
                <span className="text-foreground font-bold">Every amount hidden.</span>{" "}
                Sweeper input and CCTP burns are plaintext USDC. Only the ledger side is FHE-encrypted.
              </li>
              <li>
                <span className="text-foreground font-bold">Metadata anonymity.</span>{" "}
                IP, timing, RPC metadata are out of scope until Tor/NYM ships.
              </li>
              <li>
                <span className="text-foreground font-bold">Trustless threshold network.</span>{" "}
                Z0tz inherits CoFHE&apos;s trust model — doesn&apos;t replace it.
              </li>
            </ul>
          </div>

          <div className="border border-foreground/30 p-6 bg-secondary">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              We do claim
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>
                <span className="text-foreground font-bold">Address unlinkability.</span>{" "}
                Scanning finds ephemeral stealths and a shared sweeper — no persistent balance graph.
              </li>
              <li>
                <span className="text-foreground font-bold">Cross-chain unlinkability.</span>{" "}
                CCTP uses fresh stealths on both sides; no reconstruction possible.
              </li>
              <li>
                <span className="text-foreground font-bold">Balance confidentiality at rest.</span>{" "}
                Ciphertext handles under pseudonymous IDs. Only your passkey decrypts.
              </li>
              <li>
                <span className="text-foreground font-bold">Anonymity set grows with users.</span>{" "}
                One sweeper per chain aggregates every cash-in. Mixing is free.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-foreground text-sm font-medium mb-8 max-w-2xl mx-auto">
          <span className="text-[var(--bright-red)]">Identity unlinkability</span> +{" "}
          <span className="text-[var(--bright-red)]">amount confidentiality at rest</span>. Wrap/unwrap boundaries are plaintext — being honest about that is what makes the rest trustworthy.
        </p>

        {/* Common-practice / compliance posture callout */}
        <div className="border border-foreground/30 p-6 bg-secondary mb-12 max-w-3xl mx-auto">
          <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground text-center">
            Where Z0tz follows the market — and where it adds risk mitigation
          </h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            We follow the same posture every credible non-custodial wallet and
            protocol on the market does. Your keys, your funds. We never freeze
            balances, never custody flagged value, never run an admin-controlled
            recovery vault that holds user money.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Where Z0tz actively mitigates risk is at the protocol boundary —
            the integration points where plaintext value enters the encrypted
            stack, and where confidential value exits back to plaintext. At
            those choke points we run three independent layers: an on-chain
            compliance gate that refuses sanctioned addresses at sweep,
            withdraw, and bridge time; an external KYC supplier check (yes/no,
            no PII stored on our side); and IP geofencing at the relayer.
            Together they reduce the risk that bad actors use Z0tz&apos;s
            confidentiality to hide harmful funds, while keeping the
            non-custodial guarantee intact.
          </p>
        </div>

        {/* Full per-op table — expandable for the curious */}
        <Expandable
          title="Per-operation public / private map"
          summary="Every on-chain action a V6.5 flow performs, what's public, what's private, and a one-line note on the trade-off."
          moreLabel="see the full table"
          lessLabel="hide the full table"
        >
          <div className="border border-foreground/30 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/30 bg-secondary">
                  <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold whitespace-nowrap">Operation</th>
                  <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Public on-chain</th>
                  <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Private</th>
                  <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i < rows.length - 1 ? "border-b border-foreground/15" : ""}>
                    <td className="p-4 text-foreground font-bold whitespace-nowrap">{r.op}</td>
                    <td className="p-4 text-muted-foreground">{r.publicData}</td>
                    <td className="p-4 text-muted-foreground">{r.privateData}</td>
                    <td className="p-4 text-muted-foreground text-xs">{r.notes}</td>
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
