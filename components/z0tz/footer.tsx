"use client"

import { BatLogo } from "./bat-logo"

const links = [
  { label: "GitHub", url: "https://github.com/0xOucan/Z0tz" },
  { label: "Relayer", url: "https://github.com/0xOucan/Z0tzRelayer" },
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
            Z0tz is not a privacy feature.
          </p>
          <p className="text-foreground">
            It is a privacy stack — from identity to execution to payments.
          </p>
          <p className="text-foreground mt-2 font-medium">
            Fhenix encrypts computation. Z0tz encrypts the user.
          </p>
        </blockquote>

        <div className="flex flex-col items-center gap-8">
          {/* Logo and tagline */}
          <div className="flex items-center gap-3">
            <BatLogo size={24} className="text-foreground/50" />
            <span className="text-muted-foreground">
              Z0tz — FHE-native private wallet stack
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
        </div>
      </div>
    </footer>
  )
}
