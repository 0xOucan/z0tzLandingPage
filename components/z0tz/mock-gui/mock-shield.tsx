"use client"

import { useState } from "react"

export function MockShield() {
  const [tokenType, setTokenType] = useState<"usdc" | "mockusdc">("usdc")
  const [tab, setTab] = useState<"shield" | "unshield">("shield")

  const token = tokenType === "usdc" ? "USDC" : "MockUSDC"
  const zToken = tokenType === "usdc" ? "zUSDC" : "zMockUSDC"

  return (
    <div>
      <h1 className="mock-page-title">Shield / Unshield</h1>
      <p className="mock-page-subtitle">Convert between public and encrypted balances</p>

      <div className="mock-card" style={{ maxWidth: 500, marginBottom: 24, borderLeft: "3px solid #E63946", background: "rgba(230, 57, 70, 0.06)" }}>
        <p style={{ fontSize: 13, color: "#8A8A8A", margin: 0 }}>
          Shield encrypts your public tokens. Unshield decrypts them back.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div className="mock-pill-group">
          <button className={`mock-pill${tokenType === "usdc" ? " active" : ""}`} onClick={() => setTokenType("usdc")}>USDC</button>
          <button className={`mock-pill${tokenType === "mockusdc" ? " active" : ""}`} onClick={() => setTokenType("mockusdc")}>MockUSDC</button>
        </div>
        <div className="mock-pill-group">
          <button className={`mock-pill${tab === "shield" ? " active" : ""}`} onClick={() => setTab("shield")}>Shield</button>
          <button className={`mock-pill${tab === "unshield" ? " active" : ""}`} onClick={() => setTab("unshield")}>Unshield</button>
        </div>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <label className="mock-input-label">
          {tab === "shield" ? `Amount of ${token} to encrypt` : `Amount of ${zToken} to decrypt`}
        </label>
        <input className="mock-input" placeholder="1.5" style={{ marginBottom: 16 }} />

        <button className="mock-btn mock-btn-full">
          {tab === "shield" ? `Shield ${token}` : `Unshield ${zToken}`}
        </button>
      </div>
    </div>
  )
}
