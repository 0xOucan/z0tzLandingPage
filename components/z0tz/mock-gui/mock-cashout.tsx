"use client"

import { useState } from "react"

// Matches /home/oucan/EVVM/FHE/Z0tz/gui/src/renderer/pages/CashOut.tsx:
// Same-chain: pick chain + target EOA. Cross-chain: src + dst + target on dst.
// Both go through Ledger.spend(Cashout) → ephemeral stealth → plaintext USDC
// forwarded to the target.
export function MockCashOut() {
  const CHAINS = ["base-sepolia", "eth-sepolia", "arb-sepolia"] as const
  const [mode, setMode] = useState<"same" | "cross">("same")
  const [network, setNetwork] = useState<string>("base-sepolia")
  const [srcNet, setSrcNet] = useState<string>("base-sepolia")
  const [dstNet, setDstNet] = useState<string>("eth-sepolia")
  const [amount, setAmount] = useState("1.0")
  const [target, setTarget] = useState("")

  const validAddr = /^0x[a-fA-F0-9]{40}$/.test(target)
  const validAmount = parseFloat(amount) > 0

  return (
    <div>
      <h1 className="mock-page-title">Cash Out</h1>
      <p className="mock-page-subtitle">
        Debit your encrypted ledger, deliver plaintext USDC to any address.
        Same chain or any chain you pick.
      </p>

      <div className="mock-toggle-row">
        <button className={`mock-toggle ${mode === "same" ? "active" : ""}`} onClick={() => setMode("same")}>
          Same chain
        </button>
        <button className={`mock-toggle ${mode === "cross" ? "active" : ""}`} onClick={() => setMode("cross")}>
          Cross chain
        </button>
      </div>

      {mode === "same" && (
        <div className="mock-card">
          <div className="mock-form-grid">
            <label>
              <div className="mock-label">Chain</div>
              <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <div className="mock-label">Amount (USDC)</div>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            <div className="mock-label">Destination address (EOA · stealth · permanent stealth)</div>
            <input
              type="text"
              placeholder="0x…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={target === "" ? "" : validAddr ? "mock-valid" : "mock-invalid"}
            />
            <div className={`mock-field-hint ${target === "" ? "" : validAddr ? "ok" : "err"}`}>
              {target === ""
                ? "20-byte hex address (0x + 40 chars)"
                : validAddr ? "✓ Valid address" : "✕ Not a valid 40-char hex address"}
            </div>
          </label>
          <button
            className="mock-btn mock-btn-primary"
            style={{ marginTop: 12 }}
            disabled={!validAddr || !validAmount}
          >
            Cash out
          </button>
        </div>
      )}

      {mode === "cross" && (
        <div className="mock-card">
          <div className="mock-form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label>
              <div className="mock-label">From</div>
              <select value={srcNet} onChange={(e) => setSrcNet(e.target.value)}>
                {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <div className="mock-label">To</div>
              <select value={dstNet} onChange={(e) => setDstNet(e.target.value)}>
                {CHAINS.filter((c) => c !== srcNet).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <div className="mock-label">Amount (USDC)</div>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            <div className="mock-label">Destination address on {dstNet}</div>
            <input
              type="text"
              placeholder="0x…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={target === "" ? "" : validAddr ? "mock-valid" : "mock-invalid"}
            />
            <div className={`mock-field-hint ${target === "" ? "" : validAddr ? "ok" : "err"}`}>
              {target === ""
                ? "20-byte hex address (0x + 40 chars)"
                : validAddr ? "✓ Valid address" : "✕ Not a valid 40-char hex address"}
            </div>
          </label>
          <button
            className="mock-btn mock-btn-primary"
            style={{ marginTop: 12 }}
            disabled={!validAddr || !validAmount || srcNet === dstNet}
          >
            Bridge → cash out
          </button>
        </div>
      )}
    </div>
  )
}
