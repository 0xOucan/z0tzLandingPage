"use client"

import { useState } from "react"

interface MockDashboardProps {
  onNavigate: (page: string) => void
}

// Mirrors the V6.5 Dashboard: one total encrypted ledger balance card up
// top, per-chain cards below with deploy status and ledger balance.
export function MockDashboard({ onNavigate }: MockDashboardProps) {
  const [scanned, setScanned] = useState(false)
  const [scanning, setScanning] = useState(false)

  const chains = [
    { network: "base-sepolia", label: "Base Sepolia", addr: "0x7A0F…3c2B", deployed: true,  balance: "12.500000" },
    { network: "eth-sepolia",  label: "Eth Sepolia",  addr: "0xffdB…12c4", deployed: true,  balance: "8.200000"  },
    { network: "arb-sepolia",  label: "Arb Sepolia",  addr: "0x90f2…ba50", deployed: true,  balance: "5.100000"  },
  ]

  const total = (12.5 + 8.2 + 5.1).toFixed(6)

  const handleScan = () => {
    setScanning(true)
    setTimeout(() => { setScanning(false); setScanned(true) }, 1500)
  }

  return (
    <div>
      <div className="mock-dashboard-head">
        <div>
          <h1 className="mock-page-title">Dashboard</h1>
          <p className="mock-page-subtitle">
            Your passkey-owned smart accounts and encrypted-ledger balances across chains.
          </p>
        </div>
        <button className="mock-btn mock-btn-primary" onClick={handleScan} disabled={scanning}>
          {scanning ? "Scanning…" : scanned ? "Refresh balances" : "Scan & decrypt"}
        </button>
      </div>

      {/* Global total */}
      <div className="mock-card" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Total encrypted ledger balance
          </div>
          <div className="mock-balance-total">
            {scanning ? <span className="mock-spinner" /> : scanned ? `${total} USDC` : "•••••• USDC"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#8A8A8A", textAlign: "right" }}>
          <div>Wallet</div>
          <div style={{ fontFamily: "monospace", marginTop: 2 }}>0x7A0F…3c2B</div>
          <button className="mock-btn mock-btn-sm" style={{ marginTop: 6 }}>QR</button>
        </div>
      </div>

      {/* Per-chain cards */}
      <div style={{ display: "grid", gap: 12 }}>
        {chains.map((c) => (
          <div className="mock-card" key={c.network}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "#8A8A8A", marginTop: 2 }}>
                  account {c.addr} ·{" "}
                  <span style={{ color: c.deployed ? "#22c55e" : "#E63946" }}>
                    {c.deployed ? "deployed" : "not deployed"}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#8A8A8A" }}>Ledger balance</div>
                <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "monospace" }}>
                  {scanned ? `${c.balance} USDC` : "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inline shortcuts — match the V6.5 page list */}
      <div className="mock-grid-actions" style={{ marginTop: 24 }}>
        {[
          ["cashin", "Cash In"],
          ["cashout", "Cash Out"],
          ["bridge", "Bridge"],
          ["permanentStealths", "Permanent Stealths"],
        ].map(([nav, label]) => (
          <div className="mock-action-card" key={nav} onClick={() => onNavigate(nav)}>
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
