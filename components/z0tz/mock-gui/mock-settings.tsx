"use client"

import { useState } from "react"

const chains = [
  { id: "base-sepolia", name: "Base Sepolia", address: "0x7A0F...3c2B" },
  { id: "eth-sepolia", name: "Eth Sepolia", address: "0x3eF1...a82D" },
  { id: "arb-sepolia", name: "Arb Sepolia", address: "0xB2c4...7f1E" },
]

export function MockSettings() {
  const [activeChain, setActiveChain] = useState("base-sepolia")

  return (
    <div>
      <h1 className="mock-page-title">Settings</h1>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Network</div>
        <p style={{ fontSize: 13, color: "#8A8A8A", marginBottom: 16 }}>Same passkey works on all chains</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {chains.map((c) => (
            <button
              key={c.id}
              className={`mock-btn mock-btn-sm${activeChain === c.id ? "" : ""}`}
              style={activeChain === c.id ? { background: "#F5F5F5", color: "#000" } : {}}
              onClick={() => setActiveChain(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#8A8A8A", margin: 0 }}>
          Current: {activeChain} &middot; {chains.find((c) => c.id === activeChain)?.address}
        </p>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Multichain Accounts</div>
        {chains.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(245,245,245,0.06)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 100 }}>
              {c.name}
              {c.id === activeChain && <span style={{ fontSize: 11, color: "#E63946", marginLeft: 6 }}>(active)</span>}
            </span>
            <span style={{ fontSize: 12, color: "#8A8A8A", flex: 1 }}>{c.address}</span>
            <span className="mock-dot mock-dot-ok" />
            <span style={{ fontSize: 11, color: "#2d6a4f" }}>deployed</span>
          </div>
        ))}
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Security</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mock-btn">Lock Wallet</button>
          <button className="mock-btn mock-btn-sm">Backup &amp; Recovery</button>
        </div>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">About</div>
        <p style={{ fontSize: 13, color: "#8A8A8A", margin: "0 0 4px" }}>Z0tz v0.1.0 — FHE-Native Private Wallet</p>
        <p style={{ fontSize: 13, color: "#8A8A8A", margin: "0 0 4px" }}>Built on Fhenix CoFHE SDK</p>
        <p style={{ fontSize: 13, color: "#8A8A8A", margin: 0 }}>Apache-2.0</p>
      </div>
    </div>
  )
}
