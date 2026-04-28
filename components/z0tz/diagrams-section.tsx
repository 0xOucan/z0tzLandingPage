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
    id: "architecture",
    eyebrow: "Architecture",
    title: "What runs where",
    lead:
      "Passkey stays on your device. Three contracts — sweeper, vault, ledger — move money in and out. CoFHE handles threshold decryption off-chain.",
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
      <div className="mx-auto w-full max-w-[1280px] px-4 md:px-6">
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
            What you can do, end to end
          </div>
          <h2 className="font-mono text-3xl font-bold tracking-tight md:text-5xl">
            Eight flows. One passkey.
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Pick a scenario below to trace the path. Each tab is one thing you
            can do with Z0tz — including the compliance refuse path that keeps
            flagged funds out of the privacy stack without taking custody.
          </p>
        </div>
      </RevealBlock>

      {/* Flow — interactive, full-bleed-ish so laptop screens have room. */}
      <RevealBlock className="py-10 md:py-14">
        <div className="mx-auto w-full max-w-[1480px] px-4 md:px-8">
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
