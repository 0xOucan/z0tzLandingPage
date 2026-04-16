"use client"

import Image from "next/image"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { InteractiveFlow } from "./interactive-flow"

interface DiagramBlock {
  id: string
  eyebrow: string
  title: string
  lead: string
  src: string
  alt: string
  w: number
  h: number
}

const blocks: DiagramBlock[] = [
  {
    id: "stealths",
    eyebrow: "Address families",
    title: "Three kinds of addresses,\none passkey",
    lead:
      "Every address derives from a single WebAuthn passkey. Three families serve three purposes — disposable cash-in inboxes, permanent smart accounts for DeFi, permanent EOAs you can export into MetaMask.",
    src: "/diagrams/stealth-types.svg",
    alt: "Diagram branching from a central P-256 passkey into three address families.",
    w: 960,
    h: 460,
  },
  {
    id: "architecture",
    eyebrow: "Architecture",
    title: "What runs where",
    lead:
      "Passkey material lives locally. A relayer submits UserOps and funds stealth gas. Three on-chain contracts — sweeper, vault, encrypted ledger — move money in and out of the encrypted zone. CoFHE handles threshold decryption off-chain.",
    src: "/diagrams/architecture.svg",
    alt: "System architecture diagram.",
    w: 960,
    h: 560,
  },
]

/**
 * Reveals a child block on first scroll-into-view with a fade + 12px rise.
 * Intentionally subtle — the diagrams should feel like part of the prose,
 * not stage-managed announcements.
 */
function RevealBlock({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, revealed } = useScrollReveal(0.15)
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
    >
      {children}
    </div>
  )
}

function DiagramBlockView({ b, priority }: { b: DiagramBlock; priority?: boolean }) {
  return (
    <RevealBlock className="py-24 md:py-32">
      <div className="mx-auto mb-10 max-w-2xl px-6 text-center md:mb-14">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
          {b.eyebrow}
        </div>
        <h3 className="whitespace-pre-line font-mono text-2xl font-bold leading-tight tracking-tight md:text-4xl">
          {b.title}
        </h3>
        <p className="mt-4 text-sm text-muted-foreground md:text-base">{b.lead}</p>
      </div>

      {/* Full-bleed diagram — no card, no border. The page background shows
          through; the SVG is the hero. Clamp max width but let it breathe. */}
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="relative w-full" style={{ aspectRatio: `${b.w} / ${b.h}` }}>
          <Image
            src={b.src}
            alt={b.alt}
            fill
            priority={priority}
            className="object-contain"
            sizes="(max-width: 1024px) 100vw, 960px"
          />
        </div>
      </div>
    </RevealBlock>
  )
}

export function DiagramsSection() {
  return (
    <section id="diagrams" className="border-t border-border">
      {/* Intro block — tight, centered, breathes into the first diagram */}
      <RevealBlock>
        <div className="mx-auto max-w-2xl px-6 pt-24 text-center md:pt-32">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
            Visual tour
          </div>
          <h2 className="font-mono text-3xl font-bold tracking-tight md:text-5xl">
            See Z0tz end to end
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Three answers to the three questions people ask first: how does money flow, what are all these addresses, and what actually runs on my machine.
          </p>
        </div>
      </RevealBlock>

      {/* Flow — interactive, but presented inline. The component was already
          rebuilt to feel light; we just drop the outer card treatment. */}
      <RevealBlock className="py-24 md:py-32">
        <div className="mx-auto mb-10 max-w-2xl px-6 text-center md:mb-14">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
            How it works
          </div>
          <h3 className="font-mono text-2xl font-bold leading-tight tracking-tight md:text-4xl">
            Cash in, hold, cash out
          </h3>
          <p className="mt-4 text-sm text-muted-foreground md:text-base">
            Five flows, one mental model. Pick a scenario to trace the path.
          </p>
        </div>
        <div className="mx-auto w-full max-w-5xl px-6">
          <InteractiveFlow />
        </div>
      </RevealBlock>

      {/* Static SVG diagrams — one per scroll "scene" */}
      {blocks.map((b) => (
        <DiagramBlockView key={b.id} b={b} />
      ))}
    </section>
  )
}
