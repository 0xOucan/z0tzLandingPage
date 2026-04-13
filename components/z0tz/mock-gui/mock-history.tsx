"use client"

import { useState } from "react"

const bridgeSteps = [
  "1. Lock USDC on source chain",
  "2. Wait for bridge confirmation",
  "3. Mint wrapped USDC on destination",
  "4. Shield wrapped USDC",
  "5. Generate stealth address",
  "6. Encrypted transfer to stealth",
  "7. Unshield at stealth (phase 1)",
  "8. Unshield at stealth (phase 2)",
  "9. Claim plaintext tokens",
  "10. Send to destination wallet",
  "11. Return ETH to relayer",
  "12. Confirm completion",
]

const transactions = [
  { type: "bridge", label: "Bridge", amount: "0.25 USDC", time: "2 min ago", borderColor: "#E63946", expandable: true },
  { type: "cashout", label: "Cash Out", amount: "0.125 USDC", time: "5 min ago", borderColor: "#2d6a4f" },
  { type: "send", label: "Send", amount: "4.2069 USDC", time: "8 min ago", detail: "to 0x9c77...6e45" },
  { type: "shield", label: "Shield", amount: "10.0 USDC", time: "15 min ago" },
  { type: "cashin", label: "Cash In", amount: "20.0 USDC", time: "20 min ago", borderColor: "#2d6a4f" },
  { type: "deploy", label: "Deploy", amount: "", time: "25 min ago" },
]

export function MockHistory() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <h1 className="mock-page-title">History</h1>
      <p className="mock-page-subtitle">Transaction log for this session</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <button className="mock-btn mock-btn-sm">Export</button>
        <button className="mock-btn mock-btn-sm">Import</button>
        <span style={{ fontSize: 12, color: "#8A8A8A", marginLeft: 8 }}>12 transactions</span>
      </div>

      <div className="mock-stagger" style={{ maxWidth: 600 }}>
        {transactions.map((tx, i) => (
          <div
            key={i}
            className="mock-card"
            style={{
              ...(tx.borderColor ? { borderLeft: `3px solid ${tx.borderColor}` } : {}),
              cursor: tx.expandable ? "pointer" : "default",
            }}
            onClick={() => tx.expandable && setExpanded(!expanded)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, minWidth: 80 }}>
                {tx.label}
              </span>
              <span style={{ fontSize: 13, color: "#8A8A8A", flex: 1 }}>
                {tx.amount}
                {tx.detail && <span style={{ marginLeft: 8 }}>{tx.detail}</span>}
              </span>
              <span style={{ fontSize: 11, color: "#8A8A8A", whiteSpace: "nowrap" }}>{tx.time}</span>
              {tx.expandable && <span style={{ fontSize: 11, color: "#8A8A8A" }}>{expanded ? "▲" : "▼"}</span>}
            </div>

            {tx.expandable && expanded && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(245,245,245,0.08)" }}>
                {bridgeSteps.map((step, j) => (
                  <div key={j} style={{ fontSize: 12, color: "#8A8A8A", padding: "3px 0", display: "flex", gap: 8 }}>
                    <span style={{ color: "#2d6a4f" }}>&#10003;</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
