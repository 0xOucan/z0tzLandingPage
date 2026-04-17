"use client"

import { BatLogo } from "./bat-logo"

const links = [
  { label: "GitHub", url: "https://github.com/0xOucan/Z0tz" },
  { label: "X/Twitter", url: "https://x.com/0xoucan" },
  { label: "Telegram", url: "https://t.me/oucan" },
]

export function Footer() {
  return (
    <footer className="py-16 px-6 border-t border-foreground/20">
      <div className="max-w-[1200px] mx-auto">
        {/* Closing statement */}
        <blockquote className="text-center mb-16 max-w-2xl mx-auto">
          <p className="text-muted-foreground italic mb-2">
            Financial privacy is a right.
          </p>
          <p className="text-foreground font-medium">
            Z0tz is how you claim it — powered by Fhenix CoFHE.
          </p>
        </blockquote>

        <div className="flex flex-col items-center gap-8">
          {/* Logo and tagline */}
          <div className="flex items-center gap-3">
            <BatLogo size={24} className="text-foreground/50" />
            <span className="text-muted-foreground">
              Z0tz — FHE-encrypted ledger wallet
            </span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline uppercase text-sm tracking-wider"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Attribution */}
          <div className="text-center text-muted-foreground text-sm">
            <p>Built with FHE by 0xOucan</p>
            <p className="mt-2">Apache-2.0</p>
          </div>

          {/* Disclosure — matches Z0tz README */}
          <div className="mt-4 max-w-2xl border border-foreground/20 px-4 py-3 text-center text-xs text-muted-foreground">
            <span className="text-foreground font-bold">Testnet proof-of-concept.</span>{" "}
            Z0tz contracts are functional and audited on testnets (Phase 2: 2 Critical, 8 High — all fixed).
            They are <span className="text-foreground">not yet deployed to mainnet</span> and should not be
            used with real funds. Use for evaluation, integration prototyping, and research.
          </div>
        </div>
      </div>
    </footer>
  )
}
