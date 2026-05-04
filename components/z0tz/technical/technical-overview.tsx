"use client"

import { BatLogo } from "../bat-logo"
import { Footer } from "../footer"
import { GeneralSection } from "./general-section"
import { CliSection } from "./cli-section"
import { GuiSection } from "./gui-section"
import { ComplianceSection } from "./compliance-section"
import { VaultsSection } from "./vaults-section"
import { TestsSection } from "./tests-section"

const TOC = [
  { id: "general", label: "General architecture" },
  { id: "cli", label: "CLI" },
  { id: "gui", label: "GUI" },
  { id: "compliance", label: "Tezcatli compliance" },
  { id: "vaults", label: "Tezcatli DeFi vaults" },
  { id: "tests", label: "Test coverage" },
]

export function TechnicalOverview() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Minimal header */}
      <header className="border-b border-foreground/20">
        <div className="mx-auto max-w-[1100px] px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 text-foreground">
            <BatLogo size={24} />
            <span className="text-base font-bold tracking-widest uppercase">
              Z0tz
            </span>
            <span className="hidden sm:inline text-xs uppercase tracking-[0.2em] text-muted-foreground border-l border-foreground/30 pl-3 ml-1">
              Technical overview
            </span>
          </a>
          <a
            href="/"
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            ← back to landing
          </a>
        </div>
      </header>

      {/* Title block */}
      <section className="border-b border-border px-6 py-16">
        <div className="max-w-[1100px] mx-auto">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
            How it&apos;s built
          </span>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold uppercase tracking-widest text-foreground">
            Technical overview
          </h1>
          <p className="mt-6 max-w-3xl text-base md:text-lg text-muted-foreground leading-relaxed">
            A walkthrough of the moving pieces — the wallet stack, the
            command-line tool, the desktop wallet, the Tezcatli compliance gate
            we consult before every shielded movement, and the confidential
            vaults Z0tz routes DeFi through. Aimed at engineers and integrators
            evaluating the architecture, not at end users. Everything below
            describes what is currently running on testnet across Base, Ethereum,
            and Arbitrum Sepolia.
          </p>

          <nav className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 max-w-3xl">
            {TOC.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                → {t.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <GeneralSection />
      <CliSection />
      <GuiSection />
      <ComplianceSection />
      <VaultsSection />
      <TestsSection />

      <Footer />
    </main>
  )
}
