"use client"

import type { ReactNode } from "react"

interface SectionShellProps {
  id: string
  eyebrow: string
  title: string
  intro?: string
  children: ReactNode
}

export function SectionShell({ id, eyebrow, title, intro, children }: SectionShellProps) {
  return (
    <section id={id} className="border-b border-border px-6 py-20">
      <div className="max-w-[1100px] mx-auto">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--bright-red)]">
          {eyebrow}
        </span>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase tracking-widest text-foreground">
          {title}
        </h2>
        {intro && (
          <p className="mt-5 max-w-3xl text-base text-muted-foreground leading-relaxed">
            {intro}
          </p>
        )}
        <div className="mt-10 space-y-8">{children}</div>
      </div>
    </section>
  )
}

interface SubBlockProps {
  heading: string
  children: ReactNode
}

export function SubBlock({ heading, children }: SubBlockProps) {
  return (
    <div className="border border-foreground/30 p-6 bg-secondary">
      <h3 className="text-sm md:text-base font-bold uppercase tracking-wider text-foreground mb-3">
        {heading}
      </h3>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </div>
  )
}

interface KeyValueRow {
  label: string
  value: string
}

export function KeyValueGrid({ rows }: { rows: KeyValueRow[] }) {
  return (
    <dl className="grid sm:grid-cols-[180px_1fr] gap-x-6 gap-y-3 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-mono text-xs uppercase tracking-wider text-foreground/80">
            {r.label}
          </dt>
          <dd className="text-muted-foreground leading-relaxed">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
