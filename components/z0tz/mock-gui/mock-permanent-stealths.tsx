"use client"

import { useState } from "react"

// Matches the V6.5 Permanent Stealths page: smart-account stealths at
// different CREATE2 salts, per-chain deploy status + balance table, plus
// an EOA stealth section with a reveal-privkey button. Preview-only —
// no wallet work actually happens.
export function MockPermanentStealths() {
  const [scanned, setScanned] = useState(false)
  const [deployType, setDeployType] = useState<"smart" | "eoa">("smart")

  const smartStealths = [
    {
      salt: 1,
      perChain: [
        { network: "base-sepolia", address: "0x41a7…8b90", deployed: true,  usdc: "5.000000", eth: "0.000250" },
        { network: "eth-sepolia",  address: "0x8cF3…0a41", deployed: true,  usdc: "0.000000", eth: "0.000120" },
        { network: "arb-sepolia",  address: "0xD22e…c814", deployed: false, usdc: "0.000000", eth: "0.000000" },
      ],
    },
    {
      salt: 2,
      perChain: [
        { network: "base-sepolia", address: "0x0b5E…4f29", deployed: true,  usdc: "2.500000", eth: "0.000180" },
        { network: "eth-sepolia",  address: "0xaa12…ee71", deployed: false, usdc: "0.000000", eth: "0.000000" },
        { network: "arb-sepolia",  address: "0x3091…a6cd", deployed: true,  usdc: "1.250000", eth: "0.000090" },
      ],
    },
  ]

  return (
    <div>
      <div className="mock-dashboard-head">
        <div>
          <h1 className="mock-page-title">Permanent Stealths</h1>
          <p className="mock-page-subtitle">
            Passkey-owned smart accounts at different CREATE2 salts, plus extractable EOA stealths.
            Use them for DeFi composition or as portable EOAs without linking back to the main wallet.
          </p>
        </div>
        <button className="mock-btn mock-btn-primary" onClick={() => setScanned(true)}>
          {scanned ? "Refresh" : "Scan stealths"}
        </button>
      </div>

      {!scanned && (
        <div className="mock-card" style={{ borderStyle: "dashed", color: "#8A8A8A" }}>
          Click &quot;Scan stealths&quot; to discover any permanent stealths you&apos;ve deployed
          or received at.
        </div>
      )}

      {scanned && smartStealths.map((s) => (
        <div key={s.salt} className="mock-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Stealth #{s.salt}</div>
            <div style={{ fontSize: 11, color: "#8A8A8A" }}>CREATE2 salt {s.salt}</div>
          </div>
          <table className="mock-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Address</th>
                <th>Deployed</th>
                <th style={{ textAlign: "right" }}>USDC</th>
                <th style={{ textAlign: "right" }}>ETH</th>
              </tr>
            </thead>
            <tbody>
              {s.perChain.map((c) => (
                <tr key={c.network}>
                  <td>{c.network}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{c.address}</td>
                  <td>{c.deployed ? "✓" : "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{c.usdc}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{c.eth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Deploy new — matches the V6.5 form at the bottom */}
      <div className="mock-card" style={{ marginTop: 16 }}>
        <div className="mock-card-title">Deploy new stealth</div>
        <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
          <button
            className={`mock-btn ${deployType === "smart" ? "mock-btn-primary" : ""}`}
            style={{ borderRadius: "6px 0 0 6px", flex: 1 }}
            onClick={() => setDeployType("smart")}
          >
            Smart Account
          </button>
          <button
            className={`mock-btn ${deployType === "eoa" ? "mock-btn-primary" : ""}`}
            style={{ borderRadius: "0 6px 6px 0", flex: 1 }}
            onClick={() => setDeployType("eoa")}
          >
            EOA
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#8A8A8A", marginBottom: 0 }}>
          {deployType === "smart"
            ? "ERC-4337 smart account at a fresh CREATE2 salt. Paymaster sponsors the deploy. Reachable by contract address across all chains."
            : "Raw secp256k1 EOA derived from your passkey. Privkey extractable via PIN-gated reveal — export to MetaMask or protocol-specific signers."}
        </p>
      </div>
    </div>
  )
}
