"use client"

import { useState } from "react"
import { BatLogo } from "./bat-logo"
import { ComingSoonModal } from "./coming-soon-modal"

export function Navbar() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-foreground/20">
        <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3 text-foreground">
            <BatLogo size={28} />
            <span className="text-lg font-bold tracking-widest uppercase">
              Z0tz
            </span>
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="border border-foreground bg-transparent text-foreground px-6 py-2 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
          >
            Launch App →
          </button>
        </div>
      </nav>
      <ComingSoonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
