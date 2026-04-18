"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

type Status = "done" | "current" | "next" | "later"

interface Milestone {
  title: string
  desc: string
  status: Status
}

/**
 * V6.5.2 roadmap (April 2026). Keeps shipped items condensed — a full phase
 * log belongs in docs/internal, not on a landing page — and emphasizes what
 * the next two bands of work look like. Reinterprets content from
 * docs/internal/z0tz-article-v6.5.md + v6.5.2-multi-sweep.md + the phase-2
 * audit notes, does not quote them.
 */
const milestones: Milestone[] = [
  // ── Shipped ──────────────────────────────────────────────────────────
  {
    title: "FHE-encrypted ledger + vault",
    desc: "Pseudonymous ledger IDs, ciphertext handles, viewer permits. Balances never plaintext on chain.",
    status: "done",
  },
  {
    title: "Three stealth-address families",
    desc: "Cash-in (HKDF), permanent smart (CREATE2), permanent EOA (extractable). All from one passkey.",
    status: "done",
  },
  {
    title: "Multi-sweep V6.5.2",
    desc: "Recurring deposits at a stable address with per-sweep replay protection. ~467K gas after the first sweep.",
    status: "done",
  },
  {
    title: "CCTP V2 as the permissionless bridge",
    desc: "Stealth pair on both sides. Bridge is Circle's; privacy is yours.",
    status: "done",
  },
  {
    title: "Phase-2 security audit pass",
    desc: "Parallel ethskills review of contracts + CLI + GUI. All Critical + High closed before ship.",
    status: "done",
  },

  // ── Next ─────────────────────────────────────────────────────────────
  {
    title: "DeFi composability",
    desc: "Wire permanent smart stealths into lending, DEX, yield. Position pseudonymous, balance private.",
    status: "next",
  },
  {
    title: "Selective-disclosure compliance",
    desc: "Opt-in view key for regulated counterparties. Time-limited, user-signed, bounded scope.",
    status: "next",
  },
  {
    title: "More permissionless rails",
    desc: "LayerZero, Hyperlane, canonical bridges, payment rails. Same flow, different routes.",
    status: "next",
  },

  // ── Later ────────────────────────────────────────────────────────────
  {
    title: "Z0tz SDK for dApp embed",
    desc: "npm package — passkey + stealth + viewer-permit primitives for any Fhenix dApp.",
    status: "later",
  },
  {
    title: "Mainnet deployment",
    desc: "Base · Eth · Arb, once audits reach zero Critical/High and the relayer is HA.",
    status: "later",
  },
]

export function RoadmapSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="roadmap" className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
            Roadmap
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-muted-foreground">
            What ships next and where it&apos;s headed.
          </p>

          <div className="mx-auto max-w-3xl">
            {milestones.map((m, i) => {
              const prev = milestones[i - 1]
              const bandChanged = !prev || prev.status !== m.status
              return (
                <div key={m.title}>
                  {bandChanged && <BandLabel status={m.status} />}
                  <MilestoneRow m={m} />
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-12 text-center flex items-center justify-center gap-6 text-xs text-muted-foreground flex-wrap">
            <span><span className="text-foreground/60">✓</span> shipped</span>
            <span><span className="text-foreground/60">◆</span> next</span>
            <span><span className="text-foreground/30">○</span> later</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function BandLabel({ status }: { status: Status }) {
  const label =
    status === "done" ? "Shipped" :
    status === "current" ? "Current" :
    status === "next" ? "Next" :
    "Later"
  const accent =
    status === "current" ? "text-[var(--bright-red)]" :
    status === "done" ? "text-foreground" :
    "text-muted-foreground"
  return (
    <div
      className={`mb-3 mt-8 font-mono text-xs font-semibold uppercase tracking-[0.2em] ${accent}`}
    >
      {label}
    </div>
  )
}

function MilestoneRow({ m }: { m: Milestone }) {
  const isDone = m.status === "done"
  const isCurrent = m.status === "current"
  const isNext = m.status === "next"

  const borderClass =
    isCurrent ? "border-l-2 border-[var(--bright-red)]" :
    isDone ? "border-l-2 border-foreground/40" :
    isNext ? "border-l-2 border-foreground/30" :
    "border-l-2 border-foreground/10"

  const marker =
    isDone ? "✓" : isCurrent ? "→" : isNext ? "◆" : "○"

  const markerClass =
    isCurrent ? "text-[var(--bright-red)]" :
    isDone ? "text-foreground/60" :
    isNext ? "text-foreground/60" :
    "text-foreground/30"

  const titleClass =
    isCurrent ? "text-foreground font-bold" :
    isDone ? "text-foreground font-medium" :
    "text-foreground/80 font-medium"

  const descClass =
    isCurrent ? "text-foreground" :
    isDone ? "text-muted-foreground" :
    "text-muted-foreground/80"

  return (
    <div className={`${borderClass} pl-6 py-3`}>
      <div className="flex items-baseline gap-3">
        <span className={`shrink-0 ${markerClass}`}>{marker}</span>
        <span className={`text-base ${titleClass}`}>{m.title}</span>
      </div>
      <p className={`text-sm mt-1 ${descClass}`}>{m.desc}</p>
    </div>
  )
}
