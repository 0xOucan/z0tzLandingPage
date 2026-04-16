"use client"

import { BatLogo } from "@/components/z0tz/bat-logo"

interface MockSidebarProps {
  activePage: string
  onNavigate: (page: string) => void
  onLock?: () => void
}

// Mirrors /home/oucan/EVVM/FHE/Z0tz/gui/src/renderer/components/Sidebar.tsx
// MAIN_NAV + SECONDARY_NAV so the mock matches the shipped V6.5 GUI exactly.
const MAIN_NAV: Array<[string, string]> = [
  ["dashboard",         "Dashboard"],
  ["cashin",            "Cash In"],
  ["cashout",           "Cash Out"],
  ["bridge",            "Bridge"],
  ["permanentStealths", "Permanent Stealths"],
]

const SECONDARY_NAV: Array<[string, string]> = [
  ["history",  "History"],
  ["settings", "Settings"],
]

export function MockSidebar({ activePage, onNavigate, onLock }: MockSidebarProps) {
  return (
    <aside className="mock-sidebar">
      <a href="/" className="mock-sidebar-back">
        &larr; Back to Z0tz
      </a>

      <div className="mock-sidebar-logo">
        <BatLogo size={24} />
        <span>Z0tz</span>
      </div>

      <nav className="mock-nav">
        {MAIN_NAV.map(([id, label]) => (
          <button
            key={id}
            className={`mock-nav-item${activePage === id ? " active" : ""}`}
            onClick={() => onNavigate(id)}
          >
            {label}
          </button>
        ))}

        <div className="mock-sidebar-separator" />

        {SECONDARY_NAV.map(([id, label]) => (
          <button
            key={id}
            className={`mock-nav-item${activePage === id ? " active" : ""}`}
            onClick={() => onNavigate(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="mock-sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="mock-dot mock-dot-ok" />
          <span>3 chains deployed</span>
        </div>
        <div style={{ color: "#8A8A8A", fontSize: 10 }}>0x7A0F…3c2B</div>
        {onLock && (
          <button
            onClick={onLock}
            className="mock-btn mock-btn-sm"
            style={{ marginTop: 10, width: "100%" }}
            title="Simulated lock — reloads the preview onboarding screen"
          >
            🔒 Lock
          </button>
        )}
      </div>
    </aside>
  )
}
