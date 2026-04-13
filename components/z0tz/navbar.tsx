"use client"

import { useState, useEffect } from "react"
import { BatLogo } from "./bat-logo"

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-nav border-b"
          : "bg-background/0 border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3 text-foreground">
          <BatLogo size={28} />
          <span className="text-lg font-bold tracking-widest uppercase">
            Z0tz
          </span>
        </a>
        <a
          href="/app"
          className="glow-hover border border-foreground bg-transparent text-foreground px-6 py-2 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
        >
          Launch App →
        </a>
      </div>
    </nav>
  )
}
