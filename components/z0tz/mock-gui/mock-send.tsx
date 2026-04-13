"use client"

import { useState } from "react"

export function MockSend() {
  const [tokenType, setTokenType] = useState<"usdc" | "mockusdc">("usdc")
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSend = () => {
    setShowConfirm(true)
    setTimeout(() => {
      setShowConfirm(false)
      setShowSuccess(true)
    }, 2000)
  }

  return (
    <div>
      <h1 className="mock-page-title">Send</h1>
      <p className="mock-page-subtitle">Transfer tokens (gasless via paymaster)</p>

      <div className="mock-pill-group" style={{ marginBottom: 24 }}>
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

      {showSuccess ? (
        <div className="mock-card mock-success" style={{ maxWidth: 500 }}>
          <div className="mock-page-title" style={{ fontSize: 18, marginBottom: 8 }}>
            Transaction Successful
          </div>
          <div style={{ fontSize: 12, color: "#8A8A8A" }}>Tx: 0x7f1e...c399</div>
        </div>
      ) : (
        <div className="mock-card" style={{ maxWidth: 500 }}>
          <label className="mock-input-label">Recipient wallet address</label>
          <input className="mock-input" placeholder="0x..." style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Amount</label>
          <input className="mock-input" placeholder="4.2069" style={{ marginBottom: 8 }} />

          <p style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20 }}>
            You send: ~4.2489 USDC (includes 1% fee)
          </p>

          <button className="mock-btn mock-btn-full" onClick={handleSend}>
            Send {tokenType === "usdc" ? "USDC" : "MockUSDC"} (Gasless)
          </button>
        </div>
      )}

      {showConfirm && (
        <div className="mock-overlay">
          <div className="mock-modal">
            <div className="mock-spinner" style={{ margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14 }}>Confirming transaction...</div>
          </div>
        </div>
      )}
    </div>
  )
}
