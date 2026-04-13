"use client"

import { useState } from "react"

interface MockDashboardProps {
  onNavigate: (page: string) => void
}

export function MockDashboard({ onNavigate }: MockDashboardProps) {
  const [revealA, setRevealA] = useState(false)
  const [loadingA, setLoadingA] = useState(false)
  const [revealB, setRevealB] = useState(false)
  const [loadingB, setLoadingB] = useState(false)

  const handleRevealA = () => {
    setLoadingA(true)
    setTimeout(() => {
      setLoadingA(false)
      setRevealA(true)
    }, 1500)
  }

  const handleRevealB = () => {
    setLoadingB(true)
    setTimeout(() => {
      setLoadingB(false)
      setRevealB(true)
    }, 1500)
  }

  const chains = [
    { name: "Base Sepolia", balance: "12.5 eZ0TZUSD" },
    { name: "Eth Sepolia", balance: "8.2 eZ0TZUSD" },
    { name: "Arb Sepolia", balance: "5.0 eZ0TZUSD" },
  ]

  const actions = [
    { label: "Deploy", nav: null },
    { label: "Faucet", nav: null },
    { label: "Shield", nav: null },
    { label: "Unshield", nav: null },
    { label: "Send", nav: "send" },
    { label: "Bridge", nav: "bridge" },
    { label: "Cash Out", nav: null },
    { label: "History", nav: null },
  ]

  return (
    <div>
      <h1 className="mock-page-title">Dashboard</h1>
      <p className="mock-page-subtitle">Overview of your private wallet</p>

      <div className="mock-stagger">
        <div className="mock-grid-2">
          <div className="mock-card">
            <div className="mock-card-title">MockUSDC (eZ0TZUSD)</div>
            <div className="mock-balance mock-balance-encrypted" style={{ marginBottom: 12 }}>
              {loadingA ? (
                <span className="mock-spinner" />
              ) : revealA ? (
                "42.500000"
              ) : (
                "\u2022\u2022\u2022\u2022\u2022"
              )}
            </div>
            {!revealA && (
              <button className="mock-btn mock-btn-sm" onClick={handleRevealA} disabled={loadingA}>
                Reveal
              </button>
            )}
          </div>
          <div className="mock-card">
            <div className="mock-card-title">USDC</div>
            <div className="mock-balance mock-balance-encrypted" style={{ marginBottom: 12 }}>
              {loadingB ? (
                <span className="mock-spinner" />
              ) : revealB ? (
                "127.830000"
              ) : (
                "\u2022\u2022\u2022\u2022\u2022"
              )}
            </div>
            {!revealB && (
              <button className="mock-btn mock-btn-sm" onClick={handleRevealB} disabled={loadingB}>
                Reveal
              </button>
            )}
          </div>
        </div>

        <div className="mock-grid-3">
          {chains.map((c) => (
            <div className="mock-card" key={c.name}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className="mock-dot mock-dot-ok" />
                <strong>{c.name}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 4 }}>0x7A0F...3c2B</div>
              <div style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 4 }}>Deployed</div>
              <div style={{ fontSize: 12 }}>{c.balance}</div>
            </div>
          ))}
        </div>

        <div className="mock-grid-actions">
          {actions.map((a) => (
            <div
              className="mock-action-card"
              key={a.label}
              onClick={a.nav ? () => onNavigate(a.nav!) : undefined}
            >
              {a.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
