"use client"

interface PrivacyRow {
  op: string
  publicData: string
  privateData: string
  notes: string
}

const rows: PrivacyRow[] = [
  {
    op: "Faucet / Mint",
    publicData: "Recipient, plaintext amount",
    privateData: "—",
    notes: "Plaintext ERC-20 transfer. Amount is in calldata and the Transfer event.",
  },
  {
    op: "Shield (ERC-20 → FHERC20)",
    publicData: "User, wrapped token, plaintext amount",
    privateData: "—",
    notes: "shield(to, value) takes a uint256 value. Visible in calldata and events.",
  },
  {
    op: "Unshield (2-phase)",
    publicData: "User, wrapped token, plaintext amount (after claim)",
    privateData: "Amount is encrypted between unshield and claimUnshielded (a few blocks)",
    notes: "2-phase defers the amount until TN verification — does not hide it permanently.",
  },
  {
    op: "confidentialTransfer (in-wallet FHE)",
    publicData: "Sender, recipient, ciphertext handle, gas",
    privateData: "Amount (only the euint64 handle is visible)",
    notes: "The only operation in Z0tz where the amount is genuinely hidden on-chain.",
  },
  {
    op: "Bridge lock / mintAndShield",
    publicData: "Stealth source/dest, plaintext amount",
    privateData: "—",
    notes: "Bridges must transit plaintext (FHE handles are chain-specific). Privacy gain comes from one-time addresses, not amount hiding.",
  },
  {
    op: "PrivateSweeperV2.privateSweep",
    publicData: "Sweeper, stealth, recipient, plaintext amount of ERC-20, ciphertext handle for the encrypted credit",
    privateData: "The encrypted credit to the recipient hides the credit amount",
    notes: "Sweeper acts as mixing point — every user shields through it, so the contract becomes the apparent shielder.",
  },
  {
    op: "ERC-4337 UserOp execution",
    publicData: "Sender (smart account), paymaster, full inner calldata",
    privateData: "—",
    notes: "Smart accounts do not hide what function they called or with what args. Public calldata stays public.",
  },
  {
    op: "Stealth Announcement event",
    publicData: "Stealth address, ephemeral pubkey",
    privateData: "Link between stealth and recipient meta-address (only the recipient with the viewing key can match)",
    notes: "Announcements are public but only your scanner knows which ones belong to you.",
  },
]

export function HonestSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          What&apos;s Public, What&apos;s Private
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
          Z0tz is a privacy stack, not a magic black box. Different operations have different
          privacy properties, and being explicit about this is more useful than marketing absolutes.
          Here is exactly what an on-chain observer can and cannot see at each step.
        </p>

        {/* Public/Private map */}
        <div className="border border-foreground/30 mb-12 overflow-x-auto">
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

        {/* Honest claims */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="border border-foreground/30 p-6 bg-secondary">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              What we do NOT claim
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>
                <span className="text-foreground font-bold">Zero on-chain footprint.</span> Every
                UserOperation is recorded with its full inner calldata, gas usage, and timestamps.
              </li>
              <li>
                <span className="text-foreground font-bold">All amounts hidden.</span> Only{" "}
                <code className="text-foreground">confidentialTransfer</code> hides the amount.
                Shield, unshield, faucet, and bridge operations all have public amounts.
              </li>
              <li>
                <span className="text-foreground font-bold">Metadata-level anonymity.</span>{" "}
                Network-layer privacy (TOR/NYM, encrypted RPC) is on the roadmap (Phase 13) and
                not yet shipped.
              </li>
              <li>
                <span className="text-foreground font-bold">Trustless threshold network.</span>{" "}
                The TN is a multi-party computation network with its own trust assumptions; Z0tz
                inherits whatever guarantees CoFHE provides.
              </li>
            </ul>
          </div>

          <div className="border border-foreground/30 p-6 bg-secondary">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4 text-foreground">
              What we DO claim
            </h3>
            <ul className="space-y-3 text-muted-foreground text-sm">
              <li>
                <span className="text-foreground font-bold">Address unlinkability.</span> An
                observer scanning for a user&apos;s smart account will not find it directly
                participating in private flows — they will find encrypted transfers via the
                sweeper and a population of one-time stealth addresses.
              </li>
              <li>
                <span className="text-foreground font-bold">Cross-chain unlinkability.</span> An
                observer at the destination of a Cross-Chain Cash Out cannot determine the source
                chain, the intermediate stealth addresses, or the smart account that funded the
                original encrypted balance — even though the amount is visible at every step.
              </li>
              <li>
                <span className="text-foreground font-bold">Mixing via the sweeper.</span>{" "}
                Shielding events at PrivateSweeperV2 form a natural anonymity set as user count
                grows. With one user it is one. With N users it is N.
              </li>
              <li>
                <span className="text-foreground font-bold">In-wallet amount confidentiality.</span>{" "}
                FHE <code className="text-foreground">confidentialTransfer</code> between smart
                accounts genuinely hides the amount on-chain. Only the ciphertext handle is visible.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-foreground text-sm font-medium">
          Privacy is unlinkability between identities, not amount confidentiality at the wrap/unwrap boundary.
        </p>
      </div>
    </section>
  )
}
