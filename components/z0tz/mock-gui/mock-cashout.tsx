"use client"

import { useState } from "react"

export function MockCashOut() {
  const [tokenType, setTokenType] = useState<"usdc" | "mockusdc">("usdc")

  return (
    <div>
      <h1 className="mock-page-title">Cash Out</h1>
      <p className="mock-page-subtitle">Private exit via stealth — no link between you and the target</p>

      <div className="mock-pill-group" style={{ marginBottom: 24 }}>
        <button className={`mock-pill${tokenType === "usdc" ? " active" : ""}`} onClick={() => setTokenType("usdc")}>USDC</button>
        <button className={`mock-pill${tokenType === "mockusdc" ? " active" : ""}`} onClick={() => setTokenType("mockusdc")}>MockUSDC</button>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Private Cash Out (via Stealth)</div>

        <label className="mock-input-label">Destination wallet address</label>
        <input className="mock-input" placeholder="0x..." style={{ marginBottom: 16 }} />

        <label className="mock-input-label">Amount to cash out</label>
        <input className="mock-input" placeholder="1.5" style={{ marginBottom: 16 }} />

        <button className="mock-btn mock-btn-full">Cash Out (Stealth, Gasless)</button>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Stealth Cash-Out Flow (Full Privacy)</div>
        <ol style={{ fontSize: 13, color: "#8A8A8A", paddingLeft: 20, margin: 0, lineHeight: 2 }}>
          <li>Encrypted transfer from your account to a one-time stealth address</li>
          <li>Fund stealth with ETH for gas</li>
          <li>Stealth unshields tokens (2-phase via threshold network)</li>
          <li>Stealth claims plaintext tokens</li>
          <li>Stealth sends to target address</li>
          <li>Return remaining ETH to relayer treasury</li>
        </ol>
      </div>
    </div>
  )
}
