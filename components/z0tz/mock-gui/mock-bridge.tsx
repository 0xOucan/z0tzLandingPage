"use client"

import { useState } from "react"

export function MockBridge() {
  const [activeTab, setActiveTab] = useState("bridge")
  const [tokenType, setTokenType] = useState<"usdc" | "mockusdc">("usdc")
  const [showSteps, setShowSteps] = useState(false)

  const steps = [
    "Generate stealth pair",
    "Encrypted transfer",
    "Fund stealth",
    "Unshield",
    "TN decrypt",
    "Claim",
    "CCTP burn",
    "CCTP attestation",
    "Fund stealthB",
    "Approve sweeper",
    "Encrypt",
    "privateSweep",
  ]

  return (
    <div>
      <h1 className="mock-page-title">Bridge</h1>
      <p className="mock-page-subtitle">Cross-chain private transfers</p>

      <div className="mock-pill-group" style={{ marginBottom: 12 }}>
        <button
          className={`mock-pill${activeTab === "bridge" ? " active" : ""}`}
          onClick={() => setActiveTab("bridge")}
        >
          Bridge
        </button>
        <button className="mock-pill dimmed">Cash Out</button>
        <button className="mock-pill dimmed">Cash In</button>
      </div>

      <div className="mock-pill-group" style={{ marginBottom: 12 }}>
        <button
          className={`mock-pill${tokenType === "usdc" ? " active" : ""}`}
          onClick={() => setTokenType("usdc")}
        >
          USDC
        </button>
        <button
          className={`mock-pill${tokenType === "mockusdc" ? " active" : ""}`}
          onClick={() => setTokenType("mockusdc")}
        >
          MockUSDC
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20, letterSpacing: 1 }}>
        CCTP V2 bridge layer
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <label className="mock-input-label">Source chain</label>
        <input
          className="mock-input"
          value="Base Sepolia (current)"
          disabled
          style={{ marginBottom: 16 }}
        />

        <label className="mock-input-label">Destination chain</label>
        <input
          className="mock-input"
          value="Arb Sepolia"
          disabled
          style={{ marginBottom: 16 }}
        />

        <label className="mock-input-label">Amount</label>
        <input className="mock-input" placeholder="1.0" style={{ marginBottom: 20 }} />

        <button className="mock-btn mock-btn-full">Private Bridge (Gasless)</button>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          className="mock-btn mock-btn-sm"
          onClick={() => setShowSteps((s) => !s)}
          style={{ marginBottom: 12 }}
        >
          {showSteps ? "Hide" : "How It Works"}
        </button>

        {showSteps && (
          <ol style={{ fontSize: 12, color: "#8A8A8A", lineHeight: 2, paddingLeft: 20 }}>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
