"use client"

import { useState, type ReactNode } from "react"

/**
 * Expandable section block — the user clicks either the title or the
 * "see more / see less" hint next to it to toggle the collapsed body.
 *
 * Used for progressive disclosure on the landing: the home page stays
 * short for first-time visitors, but anyone who wants to dig in can
 * expand any section in place without leaving the page.
 *
 * Usage:
 *   <Expandable title="The 12-step private bridge" summary="How CCTP is routed through stealth pairs">
 *     <detailed content here />
 *   </Expandable>
 */
export function Expandable({
  title,
  summary,
  children,
  defaultOpen = false,
  moreLabel = "see more",
  lessLabel = "see less",
}: {
  title: string
  summary?: string
  children: ReactNode
  defaultOpen?: boolean
  moreLabel?: string
  lessLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="mb-8">
      {/* Clickable header — title + chevron + see-more hint all toggle the body */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left group"
        aria-expanded={open}
      >
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h3 className="text-xl md:text-2xl font-bold uppercase tracking-widest text-foreground group-hover:underline">
            {title}
          </h3>
          <span className="text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground whitespace-nowrap">
            {open ? `− ${lessLabel}` : `+ ${moreLabel}`}
          </span>
        </div>
        {summary && !open && (
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{summary}</p>
        )}
      </button>

      {/* Expanded body */}
      {open && (
        <div
          className="mt-6 animate-fade-in-up"
          style={{ animationDuration: "0.3s" }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
