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
  // ── Shipped — compressed to the named V6.5 primitives ────────────────
  {
    title: "FHE-encrypted ledger + vault",
    desc: "Pseudonymous ledger IDs map to ciphertext handles in a bound vault. Balances live on chain as euint64 handles, never plaintext. Viewer permits decrypt off chain under the passkey.",
    status: "done",
  },
  {
    title: "Three stealth-address families",
    desc: "Cash-in inboxes (HKDF), permanent smart accounts (CREATE2 + paymaster), permanent EOAs (HKDF, privkey extractable). All derive from one passkey; each family covers a different use-case without cross-linkage.",
    status: "done",
  },
  {
    title: "Multi-sweep V6.5.2",
    desc: "sweptV2 bool → sweepNonceV2 uint. Recurring-deposit flows (salary, invoicing, subscriptions) land at a stable cash-in address with per-sweep replay protection. 622–668K gas first sweep, ~467K every sweep after.",
    status: "done",
  },
  {
    title: "CCTP V2 as the permissionless bridge",
    desc: "Circle CCTP V2 TokenMessenger handles every cross-chain hop. Stealth-pair routing on both ends — the burn depositor and the mint recipient are both one-shot addresses. The bridge is Circle's; the privacy is still yours.",
    status: "done",
  },
  {
    title: "Phase-2 security audit pass",
    desc: "Parallel ethskills-style reviews of contracts + CLI + GUI (April 2026). 2 Critical, 8 High, 11 Medium findings — all Critical + High fixed before this commit. Relayer auth now strips signatures from the P-256 pre-image correctly.",
    status: "done",
  },

  // ── Current — the work happening this month ──────────────────────────
  {
    title: "Landing page, docs, and FHEIP-0001",
    desc: "V6.5-accurate product site and internal docs. FHEIP-0001 proposes passkey-bound viewer permits upstream so any Fhenix wallet can skip the HKDF secp256k1 step and sign decryption requests directly with a WebAuthn credential.",
    status: "current",
  },

  // ── Next — concrete commitments we can demo ──────────────────────────
  {
    title: "Any permissionless rail, not just CCTP",
    desc: "The cash-in / cash-out flow is rail-agnostic by design. Next integrations: LayerZero, Hyperlane, canonical bridges. Z0tz becomes a privacy wrapper for any permissionless protocol — bridge, DEX, lending, payments.",
    status: "next",
  },
  {
    title: "Network-layer privacy",
    desc: "Tor / NYM SOCKS5 in the Electron transport layer. Encrypted RPC endpoints. IP and timing metadata leave the scope of the observer who already sees your on-chain activity.",
    status: "next",
  },
  {
    title: "Multi-device passkey sync",
    desc: "WebAuthn passkey roaming across phone + desktop so the same ledger is reachable from either. Requires no change to on-chain contracts; all state in main-process keystore.",
    status: "next",
  },

  // ── Later — direction, not a commitment ──────────────────────────────
  {
    title: "Z0tz SDK for dApp embed",
    desc: "Publish the passkey + stealth + viewer-permit primitives as an npm SDK so any Fhenix dApp can offer a private wallet with one import, without shipping its own CoFHE integration.",
    status: "later",
  },
  {
    title: "Mainnet deployment",
    desc: "Base · Ethereum · Arbitrum production deploys once audits reach zero Critical/High across all layers and the relayer has HA + rate-limit hardening. Testnet stays live for onboarding and demos.",
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
            What ships next, what we&apos;re building now, and where it&apos;s headed.
            Shipped work is compressed — the full phase log lives in{" "}
            <code className="text-foreground">docs/internal</code>.
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
            <span><span className="text-accent">→</span> current</span>
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
