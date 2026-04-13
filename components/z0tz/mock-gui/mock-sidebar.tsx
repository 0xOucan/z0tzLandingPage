"use client"

import { BatLogo } from "@/components/z0tz/bat-logo"

interface MockSidebarProps {
  activePage: string
  onNavigate: (page: string) => void
}

export function MockSidebar({ activePage, onNavigate }: MockSidebarProps) {
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
        <button
          className={`mock-nav-item${activePage === "dashboard" ? " active" : ""}`}
          onClick={() => onNavigate("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`mock-nav-item${activePage === "send" ? " active" : ""}`}
          onClick={() => onNavigate("send")}
        >
          Send
        </button>
        <button className="mock-nav-item dimmed">Shield</button>
        <button
          className={`mock-nav-item${activePage === "bridge" ? " active" : ""}`}
          onClick={() => onNavigate("bridge")}
        >
          Bridge
        </button>

        <div className="mock-sidebar-separator" />

        <button className="mock-nav-item dimmed">Cash In</button>
        <button className="mock-nav-item dimmed">Cash Out</button>
        <button className="mock-nav-item dimmed">History</button>
        <button className="mock-nav-item dimmed">Settings</button>
      </nav>

      <div className="mock-sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span className="mock-dot mock-dot-ok" />
          <span>Base Sepolia</span>
        </div>
        <div style={{ color: "#8A8A8A" }}>0x7A0F...3c2B</div>
      </div>
    </aside>
  )
}
