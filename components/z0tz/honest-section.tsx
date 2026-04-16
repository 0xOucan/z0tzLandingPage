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
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          What&apos;s Public, What&apos;s Private
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
          Z0tz is a privacy stack, not a black box. Being explicit about which operations
          hide which fields is more useful than marketing absolutes. Everything below
          is the V6.5 model that ships today.
        </p>

        {/* Honest claims cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="border border-foreground/30 p-6 bg-secondary">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              We don&apos;t claim
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>
                <span className="text-foreground font-bold">Zero on-chain footprint.</span>{" "}
                Every UserOp, sweep, and bridge leaves a public row with its calldata, gas,
                and timestamp. Encryption hides <em>amounts</em>, not <em>existence</em>.
              </li>
              <li>
                <span className="text-foreground font-bold">Every amount hidden.</span>{" "}
                The sweeper takes plaintext USDC in; CCTP burns plaintext USDC; only the
                ledger side is FHE-encrypted. Clear-text wrap/unwrap boundaries are the
                anonymity-set's price.
              </li>
              <li>
                <span className="text-foreground font-bold">Metadata anonymity.</span>{" "}
                IP, timing, and RPC-level metadata are out of scope until Tor/NYM routing
                lands on the roadmap.
              </li>
              <li>
                <span className="text-foreground font-bold">A trustless threshold network.</span>{" "}
                Decryption guarantees are whatever CoFHE provides. Z0tz inherits that
                trust model and makes it visible.
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
                An observer scanning for your smart account will find ephemeral stealth
                EOAs and a sweeper — not a persistent balance history tied to one identity.
              </li>
              <li>
                <span className="text-foreground font-bold">Cross-chain unlinkability.</span>{" "}
                CCTP uses fresh stealths on both sides. The destination observer can't
                reconstruct the source chain, the source account, or the intermediate hops.
              </li>
              <li>
                <span className="text-foreground font-bold">Balance confidentiality at rest.</span>{" "}
                The ledger stores ciphertext handles under pseudonymous IDs. Only a viewer
                permit can decrypt — off chain, gaslessly, under your passkey.
              </li>
              <li>
                <span className="text-foreground font-bold">Anonymity set grows with users.</span>{" "}
                One sweeper per chain aggregates every cash-in. With one user, the set is one.
                With N users, it&apos;s N. No special mixers; the architecture mixes for free.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-foreground text-sm font-medium mb-12 max-w-3xl mx-auto">
          The useful framing: Z0tz gives you <span className="text-[var(--bright-red)]">unlinkability between identities</span> everywhere
          and <span className="text-[var(--bright-red)]">amount confidentiality at rest</span>. It does not give you plaintext invisibility at
          the wrap/unwrap boundaries — and being honest about that boundary is what makes the rest trustworthy.
        </p>

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
