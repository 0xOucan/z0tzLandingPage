"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

interface PrivacyReason {
  title: string
  body: string
}

const reasons: PrivacyReason[] = [
  {
    title: "Position size leaks alpha",
    body: "Open a new long, deposit a meaningful size into a yield vault, vote against a proposal — every action that shows your wallet's balance gives counterparties information you didn't choose to share.",
  },
  {
    title: "Front-runners watch your wallet",
    body: "Public balances + public mempool = MEV bots and aggressive market-makers reading your moves before you make them. Confidential balances close that visibility loop.",
  },
  {
    title: "Salaries and treasury are not retail",
    body: "Founders, DAOs, and protocol treasuries shouldn't have to publish operating expenses every time they pay a contributor. DeFi composes with payroll the same way it composes with a swap.",
  },
  {
    title: "Personal finance is personal",
    body: "How much you hold, where you lend, when you cash out, who pays you — these are the same questions a bank asks before opening an account. They don't belong on a public ledger.",
  },
]

interface PathStep {
  step: string
  detail: string
}

const sameChainPath: PathStep[] = [
  { step: "Deposit",  detail: "Encrypted ledger A → confidential vault A. Balance enters under your pseudonymous ledger ID." },
  { step: "Earn",     detail: "Yield accrues on the encrypted handle. The vault tracks your share without learning the value." },
  { step: "Withdraw", detail: "Vault A → encrypted ledger A, decrypts back into your balance. The vault never saw your wallet." },
]

const crossChainPath: PathStep[] = [
  { step: "Spend",    detail: "Encrypted ledger A debits to a one-time ephemeral address on chain A." },
  { step: "Bridge",   detail: "Circle CCTP V2: ephemeral A burns, ephemeral B mints on chain B. Both ends are random; neither is yours." },
  { step: "Deposit",  detail: "Ephemeral B forwards into a confidential vault on chain B. Two chains, one yield position, never your address on either." },
]

export function DefiSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="defi" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              Confidential DeFi
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
            DeFi without the public balance sheet
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
            Z0tz composes with confidential vaults so deposits, yield, and
            withdrawals can move through DeFi without publishing your position
            size. The wallet stack handles wrapping and stealth routing; the
            vault handles strategy and yield.
          </p>

          {/* Why be private in DeFi — four reasons cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {reasons.map((r) => (
              <div
                key={r.title}
                className="border border-foreground/30 p-6 transition-colors hover:bg-foreground/5"
              >
                <h3 className="text-base md:text-lg font-bold text-foreground mb-3">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>

          {/* Two paths — same chain + cross chain */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <div className="border border-foreground/30 p-6 bg-secondary">
              <div className="mb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bright-red)]/80">
                  Same chain
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-4">
                Deposit, earn, withdraw — all on one chain
              </h3>
              <ol className="space-y-3 text-sm">
                {sameChainPath.map((p, i) => (
                  <li key={p.step} className="flex gap-3">
                    <span className="font-mono text-[var(--bright-red)] shrink-0 w-6 text-right">
                      {i + 1}.
                    </span>
                    <div>
                      <span className="text-foreground font-bold">{p.step}.</span>{" "}
                      <span className="text-muted-foreground">{p.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border border-foreground/30 p-6 bg-secondary">
              <div className="mb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bright-red)]/80">
                  Cross-chain
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-4">
                Move balance to a vault on a different chain
              </h3>
              <ol className="space-y-3 text-sm">
                {crossChainPath.map((p, i) => (
                  <li key={p.step} className="flex gap-3">
                    <span className="font-mono text-[var(--bright-red)] shrink-0 w-6 text-right">
                      {i + 1}.
                    </span>
                    <div>
                      <span className="text-foreground font-bold">{p.step}.</span>{" "}
                      <span className="text-muted-foreground">{p.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Tezcatli implementation framing */}
          <div className="border border-foreground/30 p-8 bg-background">
            <div className="mb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--bright-red)]/80">
                Implementation
              </span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-foreground mb-4">
              Built on Tezcatli&apos;s confidential vault
            </h3>
            <p className="text-sm md:text-base text-muted-foreground mb-4 leading-relaxed max-w-3xl">
              The confidential vault Z0tz composes with is a Tezcatli
              implementation. Tezcatli ships the FHE-encrypted vault primitive
              that wraps an underlying ERC-20 strategy (Aave V3 today; ERC-4626
              and Morpho on the roadmap). Z0tz wires the wallet, stealth
              routing, and bridge into that vault; the vault does what it does
              best — confidential strategy composition.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mb-4">
              <div>
                <p className="text-foreground font-bold text-sm mb-2">
                  Cloned and modified
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We&apos;re running our own clone of the Tezcatli vault stack
                  under our deployer keys so we can iterate on the wallet
                  integration surface without waiting on upstream merge cycles.
                </p>
              </div>
              <div>
                <p className="text-foreground font-bold text-sm mb-2">
                  Upstream merge or fork — TBD
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We&apos;re actively talking with Tezcatli about merging the
                  Z0tz-side improvements upstream. If those changes don&apos;t
                  land, the clone stays and matures into a deliberate fork.
                </p>
              </div>
              <div>
                <p className="text-foreground font-bold text-sm mb-2">
                  Audit follows the contracts
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Once the contract surface stabilizes — vault, factory,
                  strategy adapter, wrapped token — the whole bundle goes
                  through a security audit before any mainnet deploy. No
                  shortcuts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
