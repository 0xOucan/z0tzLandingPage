"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const chains = [
  { name: "Base Sepolia", status: true },
  { name: "Eth Sepolia", status: true },
  { name: "Arb Sepolia", status: true },
]

// V6.5 per-operation benchmarks. Gas + L2 cost figures come from the April
// 2026 super-script run against live Sepolia (Base, Eth, Arb). Each flow is
// a median across three chains; values round to the nearest documented band.
const operations = [
  {
    label: "Smart-account deploy",
    time: "~4s",
    note: "$0.004",
    detail: "309K gas · ERC-4337 + P-256 via RIP-7212",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xd9872afd689dbbe7760656f211c5a19d21821fe32bb5d7801fc6308dad26ca6d" },
      { chain: "Eth",  url: "https://sepolia.etherscan.io/tx/0xc8a1a7790b6a4efa6fe17239ccc558b64d41cb9ff4bfc8b81b7663716d7d89a5" },
      { chain: "Arb",  url: "https://sepolia.arbiscan.io/tx/0xb250c00829edf2a922a18fd70e1cbf93be1e2b3384e28e3be6921c1e84cb1b4a" },
    ],
  },
  {
    label: "Cash in · same chain",
    time: "~4s",
    note: "$0.012",
    detail: "591K gas · sweeper → vault shield → ledger credit",
    txs: [],
  },
  {
    label: "Internal transfer + rotation",
    time: "~5s",
    note: "$0.008",
    detail: "405K gas · Ledger.spend, atomic debit + credit + pseudonym refresh",
    txs: [],
  },
  {
    label: "Cashout · same chain",
    time: "~20s",
    note: "$0.014",
    detail: "683K gas · ledger → vault → stealth, then unshield + claim",
    txs: [],
  },
  {
    label: "Cash in · cross-chain",
    time: "~40s",
    note: "$0.020",
    detail: "~1.0M gas · CCTP V2 burn/mint → sweep into dst ledger",
    txs: [],
  },
  {
    label: "Cashout · cross-chain",
    time: "~90s",
    note: "$0.024",
    detail: "~1.2M gas · spend + unshield + CCTP + forward to target",
    txs: [],
  },
  {
    label: "Bridge · self ledger",
    time: "~75s",
    note: "$0.030",
    detail: "~1.5M gas · ledger A → CCTP V2 → ledger B, both yours",
    txs: [],
  },
]

export function TestnetSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="testnet" className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          V6.5 benchmarks
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
          End-to-end timings on Sepolia testnets. Medians over six flows, not happy-path samples.
        </p>

        {/* V6.5 headline numbers — always visible */}
        <div className="border border-foreground/30 p-6 mb-12 max-w-3xl mx-auto">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 text-foreground text-center">
            Flow timings · April 2026
          </h3>
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[var(--blood-red)] text-xs uppercase tracking-wider">Cash In · same chain</div>
              <div className="text-foreground font-bold text-2xl mt-1">~4s</div>
              <div className="text-muted-foreground text-xs mt-1">622–668K gas · sweep + ledger credit</div>
            </div>
            <div>
              <div className="text-[var(--blood-red)] text-xs uppercase tracking-wider">Cash Out · cross chain</div>
              <div className="text-foreground font-bold text-2xl mt-1">~90s</div>
              <div className="text-muted-foreground text-xs mt-1">spend + unshield + CCTP + forward</div>
            </div>
            <div>
              <div className="text-[var(--blood-red)] text-xs uppercase tracking-wider">Bridge · self ledger</div>
              <div className="text-foreground font-bold text-2xl mt-1">~75s</div>
              <div className="text-muted-foreground text-xs mt-1">CCTP V2 Fast Transfer · auto-swept</div>
            </div>
          </div>
          <p className="text-center text-muted-foreground text-xs mt-4">
            Multi-sweep second-pass on the same stealth costs ~467K gas — the ledger credit amortizes over subsequent deposits.
          </p>
        </div>

        {/* Full per-operation table — expandable */}
        <Expandable
          title="Full operation benchmarks"
          summary="Per-operation gas, cost, and live explorer links across all three testnets."
          moreLabel="see every operation"
          lessLabel="hide operation list"
        >
          <div className="overflow-x-auto">
            <table className="w-full border border-foreground text-sm">
              <thead>
                <tr className="border-b border-foreground">
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                    Operation
                  </th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                    Time
                  </th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground hidden md:table-cell">
                    Details
                  </th>
                  <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                    Transactions
                  </th>
                </tr>
              </thead>
              <tbody>
                {operations.map((op) => (
                  <tr
                    key={op.label}
                    className="border-b border-foreground/20 transition-colors hover:bg-foreground/5"
                  >
                    <td className="p-3 font-medium text-foreground">
                      {op.label}
                      <span className="text-muted-foreground text-xs ml-2">
                        {op.note}
                      </span>
                    </td>
                    <td className="p-3 text-foreground font-bold text-lg">
                      {op.time}
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">
                      {op.detail}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        {op.txs.length > 0 ? op.txs.map((tx) => (
                          <a
                            key={tx.chain}
                            href={tx.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:underline text-xs border border-foreground/30 px-2 py-1 transition-colors hover:bg-foreground hover:text-background"
                          >
                            {tx.chain}
                          </a>
                        )) : (
                          <span className="text-muted-foreground text-xs italic">measured in CCTP e2e runs</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-muted-foreground text-sm mt-6">
            V6.5 stack across Base · Eth · Arb Sepolia — ledger + vault + multi-sweep sweeper.
            Sub-cent per single-chain op, under three cents end-to-end for cross-chain flows.
          </p>
        </Expandable>
      </div>
      </div>
    </section>
  )
}
