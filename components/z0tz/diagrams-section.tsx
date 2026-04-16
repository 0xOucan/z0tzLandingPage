"use client"

import Image from "next/image"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { InteractiveFlow } from "./interactive-flow"

interface Diagram {
  id: string
  eyebrow: string
  title: string
  lead: string
  src: string
  alt: string
  // Native size for aspect-ratio lock
  w: number
  h: number
}

const diagrams: Diagram[] = [
  {
    id: "stealths",
    eyebrow: "Address families",
    title: "Three kinds of addresses, one passkey",
    lead:
      "Every address derives from a single WebAuthn passkey. Three families serve three purposes: disposable cash-in inboxes (with multi-sweep for recurring deposits), permanent smart accounts for DeFi, and permanent EOAs you can export into MetaMask.",
    src: "/diagrams/stealth-types.svg",
    alt: "Diagram branching from a central P-256 passkey into three address families: cash-in stealths via HKDF, permanent smart-account stealths via CREATE2 factory, and permanent EOA stealths via a second HKDF derivation.",
    w: 960,
    h: 460,
  },
  {
    id: "architecture",
    eyebrow: "Architecture",
    title: "What runs where",
    lead:
      "Passkey material lives in the Electron main process. The relayer submits ERC-4337 UserOps and funds stealth gas. Three on-chain contracts — sweeper, vault, and encrypted ledger — move money in and out of the encrypted zone. CoFHE handles threshold decryption for viewer reveals.",
    src: "/diagrams/architecture.svg",
    alt: "System diagram: user device (Z0tz GUI, passkey session) → relayer (P-256 auth, CCTP attestation proxy) → on-chain stack (EntryPoint, paymaster, smart account, stealth EOA, sweeper, vault, encrypted ledger, treasury, FHERC20 wrapper, CCTP V2). CoFHE threshold network decrypts via viewer permits.",
    w: 960,
    h: 560,
  },
]

export function DiagramsSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section
      ref={ref}
      id="diagrams"
      className={`border-t border-border transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}
    >
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 max-w-2xl">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
            Visual tour
          </div>
          <h2 className="font-mono text-3xl font-bold tracking-tight md:text-5xl">
            See Z0tz end to end
          </h2>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Three diagrams for the three questions most people ask first: how does money flow, what are all these addresses, and what actually runs on my machine versus the network.
          </p>
        </div>

        <div className="flex flex-col gap-20">
          {/* Interactive flow — 5 tabbed scenarios with animated path */}
          <article className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
            <header className="lg:col-span-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
                How it works
              </div>
              <h3 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
                Cash in, hold, cash out
              </h3>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">
                Five flows, one mental model: money arrives through a disposable stealth, gets encrypted under your passkey, and leaves the same way. Click a scenario to trace the path.
              </p>
            </header>

            <figure className="lg:col-span-8">
              <InteractiveFlow />
              <figcaption className="sr-only">
                Interactive flow diagram with five scenarios: same-chain cash in, cross-chain cash in, same-chain cash out, cross-chain cash out, and self-bridge.
              </figcaption>
            </figure>
          </article>

          {diagrams.map((d) => (
            <article key={d.id} className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
              <header className="lg:col-span-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--bright-red)]">
                  {d.eyebrow}
                </div>
                <h3 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
                  {d.title}
                </h3>
                <p className="mt-3 text-sm text-muted-foreground md:text-base">{d.lead}</p>
              </header>

              <figure className="lg:col-span-8">
                <div
                  className="rounded-none border border-border bg-[var(--surface)] p-4 md:p-6"
                  style={{ containerType: "inline-size" }}
                >
                  <div
                    className="relative w-full"
                    style={{ aspectRatio: `${d.w} / ${d.h}` }}
                  >
                    <Image
                      src={d.src}
                      alt={d.alt}
                      fill
                      priority={d.id === "flow"}
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 60vw"
                    />
                  </div>
                </div>
                <figcaption className="sr-only">{d.alt}</figcaption>
              </figure>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
