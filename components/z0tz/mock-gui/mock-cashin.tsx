"use client"

import { useState } from "react"

// Mirrors /home/oucan/EVVM/FHE/Z0tz/gui/src/renderer/pages/CashIn.tsx:
// Same-chain / Cross-chain toggle → generate stealth → faucet → sweep.
// In cross mode the sweep bridges via CCTP to a destination chain's ledger.
export function MockCashIn() {
  const [mode, setMode] = useState<"same" | "cross">("same")
  const CHAINS = ["base-sepolia", "eth-sepolia", "arb-sepolia"] as const
  const [network, setNetwork] = useState<string>("base-sepolia")
  const [dstNet, setDstNet] = useState<string>("eth-sepolia")
  const [generated, setGenerated] = useState<{ index: number; address: string } | null>(null)
  const [pending, setPending] = useState<Array<{ index: number; address: string; usdc: string }>>([])

  const handleGenerate = () => {
    setGenerated({ index: 0, address: "0x4Ffe03d5…629388" })
    setPending([])
  }

  const handleSimulateDeposit = () => {
    if (!generated) return
    setPending([{ index: generated.index, address: generated.address, usdc: "20.000000" }])
  }

  return (
    <div>
      <h1 className="mock-page-title">Cash In</h1>
      <p className="mock-page-subtitle">
        {mode === "same"
          ? "Receive USDC at a stealth address, sweep into your encrypted ledger on the same chain."
          : "Receive USDC on chain A, bridge via CCTP, credit your encrypted ledger on chain B — all in one click."}
      </p>

      {/* Mode toggle — matches the real page's pill switcher */}
      <div className="mock-toggle-row">
        <button
          className={`mock-toggle ${mode === "same" ? "active" : ""}`}
          onClick={() => setMode("same")}
        >
          Same chain
        </button>
        <button
          className={`mock-toggle ${mode === "cross" ? "active" : ""}`}
          onClick={() => setMode("cross")}
        >
          Cross chain
        </button>
      </div>

      <div className="mock-card">
        <div className="mock-card-title">1. Generate stealth</div>
        <div className="mock-form-grid" style={{ gridTemplateColumns: mode === "cross" ? "1fr 1fr" : "1fr" }}>
          <label>
            <div className="mock-label">{mode === "cross" ? "Source chain (faucet here)" : "Chain"}</div>
            <select value={network} onChange={(e) => setNetwork(e.target.value)}>
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {mode === "cross" && (
            <label>
              <div className="mock-label">Destination (ledger credit)</div>
              <select value={dstNet} onChange={(e) => setDstNet(e.target.value)}>
                {CHAINS.filter((c) => c !== network).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
        <button className="mock-btn mock-btn-primary" style={{ marginTop: 12 }} onClick={handleGenerate}>
          Generate fresh stealth
        </button>

        {generated && (
          <div className="mock-inline-card">
            <div className="mock-label">Stealth #{generated.index} on <strong>{network}</strong> — send USDC here:</div>
            <div className="mock-addr-row">
              <code>{generated.address}</code>
              <button className="mock-btn mock-btn-sm">Copy</button>
              <button className="mock-btn mock-btn-sm">QR</button>
            </div>
            <button className="mock-btn mock-btn-sm" style={{ marginTop: 8 }} onClick={handleSimulateDeposit}>
              Simulate deposit (20 USDC)
            </button>
          </div>
        )}
      </div>

      <div className="mock-card" style={{ marginTop: 12 }}>
        <div className="mock-card-title">2. Pending cash-ins{pending.length > 0 ? ` (${pending.length})` : ""}</div>
        {pending.length === 0 && (
          <p style={{ fontSize: 12, color: "#8A8A8A", margin: 0 }}>
            No pending cash-ins. Generate a stealth above, or scan for funded stealths across chains.
          </p>
        )}
        {pending.map((p) => (
          <div key={p.index} className="mock-pending-row">
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 11 }}>#{p.index} — {p.address}</div>
              <div style={{ fontSize: 10, color: "#8A8A8A" }}>{network}</div>
            </div>
            <div style={{ fontFamily: "monospace", fontWeight: 600 }}>{p.usdc} USDC</div>
            <button className="mock-btn mock-btn-primary mock-btn-sm">
              {mode === "same" ? "Sweep" : `Bridge → ${dstNet}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
