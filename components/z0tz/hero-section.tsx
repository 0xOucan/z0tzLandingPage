"use client"

import { BatLogo } from "./bat-logo"

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20">
      {/* Background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(122,15,15,0.12) 0%, transparent 60%)",
        }}
      />

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
        <p className="text-xl md:text-2xl text-foreground mb-6 animate-fade-in-up animation-delay-100">
          Confidentiality in a frictionless experience.
        </p>
        <p className="text-base md:text-lg text-muted-foreground mb-10 animate-fade-in-up animation-delay-200 max-w-2xl mx-auto">
          One passkey. Encrypted balances. Gasless from minute one. The
          encryption layer between you and anything you touch on chain.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-400">
          <a
            href="#composability"
            className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
          >
            How it works
          </a>
          <a
            href="/app"
            className="glow-hover border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200"
          >
            Try Demo →
          </a>
        </div>
      </div>
    </section>
  )
}
