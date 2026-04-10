"use client"

import { BatLogo } from "./bat-logo"

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20">
      {/* Background bat watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <BatLogo
          size={400}
          className="text-foreground/10 animate-bat-pulse"
        />
      </div>

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <h1 className="text-6xl md:text-8xl font-bold uppercase tracking-widest mb-8 animate-fade-in-up text-foreground">
          Z0tz
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground mb-4 animate-fade-in-up animation-delay-100">
          FHE-native private wallet stack
        </p>
        <p className="text-lg text-muted-foreground mb-8 animate-fade-in-up animation-delay-200">
          from identity to execution to payments — V5 maximum privacy
        </p>
        <p className="text-foreground mb-12 animate-fade-in-up animation-delay-300">
          No seed phrases. No identity-linked flows. Encrypted in-wallet activity.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-400">
          <a
            href="#architecture"
            className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
          >
            Read Docs
          </a>
          <a
            href="https://github.com/0xOucan/Z0tz"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  )
}
