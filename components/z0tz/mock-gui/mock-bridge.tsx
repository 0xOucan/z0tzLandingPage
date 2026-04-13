"use client"

import { useState } from "react"

export function MockBridge() {
  const [activeTab, setActiveTab] = useState<"bridge" | "cashout" | "cashin">("bridge")
  const [tokenType, setTokenType] = useState<"usdc" | "mockusdc">("usdc")
  const [showSteps, setShowSteps] = useState(false)

  const tokenLabel = tokenType === "usdc" ? "USDC" : "MockUSDC"

  const bridgeSteps = [
    "Generate stealth pair (source + destination)",
    "Encrypted transfer → stealthA",
    "Fund stealthA with ETH",
    "StealthA unshields (2-phase)",
    "Threshold Network decrypts",
    "StealthA claims tokens",
    "CCTP burn at stealthA → mintRecipient=stealthB",
    "Circle attestation (Fast Transfer ~15s)",
    "Fund stealthB on destination",
    "StealthB approves PrivateSweeperV2",
    "CoFHE encrypt with sweeper account",
    "PrivateSweeperV2.privateSweep → user encrypted balance",
  ]

  const cashoutSteps = [
    "Encrypted transfer from your account to stealth",
    "Fund stealth with ETH for gas",
    "Stealth unshields tokens (2-phase via TN)",
    "Stealth claims plaintext tokens",
    "CCTP burn → mint on destination chain",
    "StealthB sends to target address",
  ]

  const cashinSteps = [
    "Fund stealth address with USDC (faucet or transfer)",
    "Stealth approves sweeper + CCTP burn",
    "Circle CCTP attestation + receive on destination",
    "StealthB approves PrivateSweeperV2",
    "CoFHE encrypt → privateSweep into encrypted balance",
  ]

  return (
    <div>
      <h1 className="mock-page-title">Bridge</h1>
      <p className="mock-page-subtitle">Private cross-chain transfers with stealth + FHE</p>

      <div className="mock-pill-group" style={{ marginBottom: 12 }}>
        <button
          className={`mock-pill${activeTab === "bridge" ? " active" : ""}`}
          onClick={() => setActiveTab("bridge")}
        >
          Bridge
        </button>
        <button
          className={`mock-pill${activeTab === "cashout" ? " active" : ""}`}
          onClick={() => setActiveTab("cashout")}
        >
          Cash Out
        </button>
        <button
          className={`mock-pill${activeTab === "cashin" ? " active" : ""}`}
          onClick={() => setActiveTab("cashin")}
        >
          Cash In
        </button>
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

      {tokenType === "usdc" && (
        <div style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20, letterSpacing: 1 }}>
          <span style={{ color: "#E63946", fontWeight: 600 }}>CCTP V2</span>
          <span> bridge layer · privacy preserved</span>
        </div>
      )}

      {/* ─── BRIDGE TAB ─── */}
      {activeTab === "bridge" && (
        <div className="mock-card" style={{ maxWidth: 500 }}>
          <label className="mock-input-label">Source chain</label>
          <input className="mock-input" value="Base Sepolia (current)" disabled style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Destination chain</label>
          <input className="mock-input" value="Arb Sepolia" disabled style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Amount ({tokenLabel})</label>
          <input className="mock-input" placeholder="1.0" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20 }}>
            You send: ~1.0100 {tokenLabel} (includes 1% fee) · Recipient receives: 1.0 {tokenLabel}
          </p>

          <button className="mock-btn mock-btn-full">Private Bridge (Gasless)</button>
        </div>
      )}

      {/* ─── CASH OUT TAB ─── */}
      {activeTab === "cashout" && (
        <div className="mock-card" style={{ maxWidth: 500 }}>
          <div className="mock-card-title">Cross-Chain Cash Out (Stealth)</div>

          <label className="mock-input-label">Target wallet address</label>
          <input className="mock-input" placeholder="0x..." style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Destination chain</label>
          <input className="mock-input" value="Eth Sepolia" disabled style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Amount ({tokenLabel})</label>
          <input className="mock-input" placeholder="0.5" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20 }}>
            Target receives plaintext {tokenLabel} from a stealth address — no on-chain link to your account.
          </p>

          <button className="mock-btn mock-btn-full">Cash Out (Stealth, Gasless)</button>
        </div>
      )}

      {/* ─── CASH IN TAB ─── */}
      {activeTab === "cashin" && (
        <div className="mock-card" style={{ maxWidth: 500 }}>
          <div className="mock-card-title">Cross-Chain Cash In</div>

          <label className="mock-input-label">Source chain (where your stealth has USDC)</label>
          <input className="mock-input" value="Eth Sepolia" disabled style={{ marginBottom: 16 }} />

          <label className="mock-input-label">Your stealth address on source</label>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,245,245,0.12)",
            borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontSize: 14,
          }}>
            <span style={{ flex: 1 }}>0x8dB4...93Ad</span>
            <button className="mock-btn mock-btn-sm">Scan</button>
          </div>

          <p style={{ fontSize: 11, color: "#8A8A8A", marginBottom: 20 }}>
            Fund the stealth address with {tokenLabel}, then click to bridge it into your encrypted balance on the current chain.
          </p>

          <button className="mock-btn mock-btn-full">Cash In (Bridge + Sweep)</button>
        </div>
      )}

      {/* ─── HOW IT WORKS ─── */}
      <div style={{ marginTop: 24 }}>
        <button
          className="mock-btn mock-btn-sm"
          onClick={() => setShowSteps(s => !s)}
          style={{ marginBottom: 12 }}
        >
          {showSteps ? "Hide Steps" : "How It Works"}
        </button>

        {showSteps && (
          <div className="mock-card" style={{ maxWidth: 500 }}>
            <div className="mock-card-title">
              {activeTab === "bridge" ? "Private Bridge Flow (12 steps)" :
               activeTab === "cashout" ? "Stealth Cash-Out Flow (6 steps)" :
               "Cross-Chain Cash-In Flow (5 steps)"}
            </div>
            <ol style={{ fontSize: 12, color: "#8A8A8A", lineHeight: 2.2, paddingLeft: 20, margin: 0 }}>
              {(activeTab === "bridge" ? bridgeSteps :
                activeTab === "cashout" ? cashoutSteps : cashinSteps
              ).map((s, i) => (
                <li key={i} style={{ borderBottom: "1px solid rgba(245,245,245,0.04)", paddingBottom: 4 }}>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
