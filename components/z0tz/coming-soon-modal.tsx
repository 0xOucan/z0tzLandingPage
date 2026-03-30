"use client"

import { useEffect, useCallback } from "react"
import { BatLogo } from "./bat-logo"

interface ComingSoonModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ComingSoonModal({ isOpen, onClose }: ComingSoonModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border border-foreground bg-secondary p-8 max-w-md w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <BatLogo size={48} className="mx-auto mb-6 text-foreground" />
        <h2 className="text-xl font-bold uppercase tracking-widest mb-4 text-foreground">
          Coming Soon
        </h2>
        <p className="text-muted-foreground mb-2">
          Z0tz GUI is in development
        </p>
        <p className="text-muted-foreground mb-6">CLI available now:</p>
        <a
          href="https://github.com/0xOucan/Z0tz"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline hover:no-underline block mb-8"
        >
          github.com/0xOucan/Z0tz
        </a>
        <button
          onClick={onClose}
          className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background"
        >
          Close
        </button>
      </div>
    </div>
  )
}
