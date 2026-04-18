"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { CLISection } from "./cli-section"
import { ContractsSection } from "./contracts-section"
import { RelayerSection } from "./relayer-section"

/**
 * For developers and integrators — everything technical behind one click.
 *
 * Collapses CLI, Contracts, and Relayer sections (previously three separate
 * top-level sections totaling ~740 lines of component markup) into a single
 * "For developers" zone. The general reader scrolls right past; the builder
 * expands what they need.
 *
 * Most visitors aren't integrators — they're users trying to understand the
 * product. Technical surface lives in an expandable so the main scroll stays
 * product-focused.
 */
export function DevelopersSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="developers" className="py-24 px-6 border-t border-border">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
              For developers & integrators
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-6 text-center text-foreground">
            Plug in at any layer
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
            The CLI, deployed contract addresses per chain, and relayer API. Click into whichever
            layer you integrate against — each stays collapsed by default.
          </p>

          <Expandable
            title="CLI"
            summary="Command-line reference, install, and example flows — cash in, spend, bridge, recover."
            moreLabel="open CLI reference"
            lessLabel="hide CLI reference"
          >
            <div className="-mx-6 md:mx-0">
              <CLISection />
            </div>
          </Expandable>

          <Expandable
            title="Deployed contracts"
            summary="V6.5.2 ledger / vault / sweeper / wrapper addresses across Base, Eth, and Arb Sepolia, each verified on the appropriate explorer."
            moreLabel="see contract addresses"
            lessLabel="hide contract addresses"
          >
            <div className="-mx-6 md:mx-0">
              <ContractsSection />
            </div>
          </Expandable>

          <Expandable
            title="Relayer API"
            summary="HTTP endpoints for cash-in sweeps, ledger ops, stealth funding, and bundler UserOps."
            moreLabel="see relayer endpoints"
            lessLabel="hide relayer endpoints"
          >
            <div className="-mx-6 md:mx-0">
              <RelayerSection />
            </div>
          </Expandable>
        </div>
      </div>
    </section>
  )
}
