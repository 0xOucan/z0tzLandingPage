"use client"

import { useState } from "react"

// Matches /home/oucan/EVVM/FHE/Z0tz/gui/src/renderer/pages/DeFi.tsx after
// the no-cache refactor: position values come straight from chain
// (vault.principalDepositedOf, netPositionSnapshotOf, pendingYieldSnapshotOf),
// the per-card layout collapses to four rows (withdrawable / deposited /
// yield / apy), and closed positions filter out at the scanner.
//
// Tezcatli on arb-sepolia is the only live yield strategy — base & eth
// surface skeleton vaults (compliance-gate-only, no Aave on those chains)
// that this preview hides per the active-only filter.
export function MockDefi() {
  const [openModal, setOpenModal] = useState<null | { kind: "deposit" | "withdraw"; vaultId: string; index?: number; from?: string }>(null)
  const [amount, setAmount] = useState("1.0")
  const [routing, setRouting] = useState("arb-sepolia")
  const [running, setRunning] = useState(false)

  const positions = [
    {
      id: "from-arb",
      label: "from arb",
      isCrossChain: false,
      stealth: "0xd6cda6…39ddc0",
      withdrawable: "5.500024",
      deposited: "5.500000",
      yield: "+0.000024",
    },
    {
      id: "from-base",
      label: "from base",
      isCrossChain: true,
      stealth: "0x2737fc…0cfcef",
      withdrawable: "≈ 3.499544",
      deposited: "3.499545",
      yield: "−0.000001",
    },
  ]

  const totalPrincipal = positions.reduce((a, p) => a + parseFloat(p.deposited), 0)
  const totalNet = positions.reduce((a, p) => a + parseFloat(p.withdrawable.replace("≈ ", "")), 0)
  const totalYield = totalNet - totalPrincipal

  const runAction = () => {
    if (!openModal || parseFloat(amount) <= 0) return
    setRunning(true)
    setTimeout(() => {
      setRunning(false)
      setOpenModal(null)
    }, 2400)
  }

  return (
    <div>
      <h1 className="mock-page-title">DeFi</h1>
      <p className="mock-page-subtitle">
        Deposit plaintext USDC into Tezcatli confidential vaults via an HKDF-derived stealth EOA.
        Your smart account is never linked to the vault — derivation is deterministic per
        (origin chain, vault chain, vault, index), so you can scan positions any time using your
        passkey alone, and Withdraw auto-routes funds back to the chain they came from.
      </p>

      {/* Portfolio aggregate — chain-truth sums across active positions */}
      <div className="mock-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 1.5 }}>Portfolio</div>
          <div style={{ fontSize: 11, color: "#8A8A8A" }}>
            {positions.length} active position{positions.length === 1 ? "" : "s"} · on-chain values
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <PortfolioStat label="principal deposited" value={`${totalPrincipal.toFixed(6)} USDC`} />
          <PortfolioStat label="net withdrawable" value={`${totalNet.toFixed(6)} USDC`} accent />
          <PortfolioStat label="yield earned" value={`${totalYield >= 0 ? "+" : ""}${totalYield.toFixed(6)} USDC`} positive={totalYield > 0} />
          <PortfolioStat label="active positions" value={String(positions.length)} />
        </div>
      </div>

      {/* Vault card — only arb-sepolia surfaces here in the preview */}
      <div style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
        arb-sepolia
      </div>
      <div className="mock-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{ fontSize: 17, fontWeight: 500 }}>Tezcatli Confidential USDC Vault — Aave</div>
            <div style={{ fontSize: 13, color: "#8A8A8A", marginTop: 4 }}>USDC → tzcUSDC · strategy: Aave V3</div>
            <div style={{ fontSize: 11, color: "#8A8A8A", marginTop: 8, fontFamily: "var(--font-mono, monospace)" }}>
              vault: 0x90638B…8a5A78<br />
              wrapped: 0x14655b…cb7C8 (tzcUSDC)<br />
              underlying: 0x75faf1…6AA4d (USDC)
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <Pill text="30s lock" tone="muted" />
              <Pill text="strategy: active" tone="ok" />
              <Pill text="compliance: open" tone="ok" />
              <Pill text="KYC + OFAC ready" tone="muted" />
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 1 }}>supply APY</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: "#FFB347" }}>4.36%</div>
            <div style={{ fontSize: 10, color: "#8A8A8A", marginTop: 2 }}>APR 4.27% · Aave V3</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button
            className="mock-btn mock-btn-primary"
            onClick={() => { setRouting("arb-sepolia"); setOpenModal({ kind: "deposit", vaultId: "tezcatli-usdc-aave" }) }}
          >
            Deposit
          </button>
          <button
            className="mock-btn"
            disabled={positions.length === 0}
            onClick={() => positions.length > 0 && setOpenModal({ kind: "withdraw", vaultId: "tezcatli-usdc-aave", index: 0, from: positions[0].label })}
          >
            Withdraw
          </button>
          <button className="mock-btn">Scan positions</button>
          <button className="mock-btn">Refresh</button>
          <span style={{ fontSize: 11, color: "#8A8A8A", alignSelf: "center", marginLeft: 6 }}>
            {positions.length} live / 24 scanned
          </span>
        </div>

        {/* Per-position rows — clean 4-row chain-truth layout */}
        <div style={{ marginTop: 14, borderTop: "1px solid #1f1f1f" }}>
          {positions.map((p, i) => (
            <div key={p.id} style={{ padding: "12px 0", borderBottom: i < positions.length - 1 ? "1px solid #1f1f1f" : "none" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>
                <span style={{ color: "#FFB347" }}>●</span>
                <span style={{ width: 28 }}>[0{i}]</span>
                <span style={{ flex: "0 0 160px" }}>{p.stealth}</span>
                <span style={{ flex: "0 0 70px" }}>lock: none</span>
                <span style={{ flex: "0 0 110px" }}>unlock: available</span>
                <span style={{ flex: "0 0 80px" }}>fee: 0.00%</span>
                <Pill text={`from ${p.label.replace("from ", "")}`} tone={p.isCrossChain ? "blue" : "muted"} />
                <span style={{ flex: "1 1 auto" }} />
                <button
                  className="mock-btn mock-btn-sm"
                  onClick={() => setOpenModal({ kind: "withdraw", vaultId: "tezcatli-usdc-aave", index: i, from: p.label })}
                >
                  Withdraw
                </button>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 8, marginLeft: 40, flexWrap: "wrap", fontSize: 12 }}>
                <PositionStat label="withdrawable" value={`${p.withdrawable} USDC`} accent />
                <PositionStat label="deposited" value={`${p.deposited} USDC`} />
                <PositionStat label="yield" value={`${p.yield} USDC`} positive={p.yield.startsWith("+")} />
                <PositionStat label="apy" value="4.36%" accent />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {openModal && (
        <div className="mock-overlay" onClick={() => !running && setOpenModal(null)}>
          <div className="mock-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>
              {openModal.kind === "deposit" ? "Deposit into" : "Withdraw from"} Tezcatli Confidential USDC Vault
            </h3>
            <p style={{ fontSize: 12, color: "#8A8A8A", marginBottom: 14 }}>
              {openModal.kind === "deposit"
                ? "Cashes out from your ledger to an HKDF-derived stealth, then deposits into the vault. Your smart account never appears."
                : openModal.from && openModal.from !== "from arb"
                  ? `Routing home to ${openModal.from?.replace("from ", "")}-sepolia: vault → unshield → CCTP → src ledger.`
                  : "Withdraws position to the DeFi stealth, then sweeps back into your arb-sepolia ledger."}
            </p>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div className="mock-label">{openModal.kind === "deposit" ? "Source ledger" : "Destination ledger"}</div>
              <select value={routing} onChange={(e) => setRouting(e.target.value)} disabled={running}>
                <option value="arb-sepolia">arb-sepolia (same chain — fastest)</option>
                <option value="base-sepolia">base-sepolia (cross-chain via CCTP)</option>
                <option value="eth-sepolia">eth-sepolia (cross-chain via CCTP)</option>
              </select>
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div className="mock-label">Amount (USDC)</div>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={running} />
            </label>

            <p style={{ fontSize: 11, color: "#8A8A8A", marginTop: 8 }}>
              {openModal.kind === "deposit"
                ? "Auto-fresh stealth index — picks (highest-ever-touched + 1) so prior FHE state never collides with a new deposit."
                : "Pre-flight redeem trigger pulls aTokens out of Aave first so the unshield has plaintext USDC to settle against."}
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button className="mock-btn" disabled={running} onClick={() => setOpenModal(null)}>
                Cancel
              </button>
              <button className="mock-btn mock-btn-primary" disabled={running} onClick={runAction}>
                {running ? "Running…" : openModal.kind === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PortfolioStat({ label, value, accent, positive }: { label: string; value: string; accent?: boolean; positive?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent ? "#FFB347" : positive ? "#22c55e" : "inherit" }}>{value}</div>
    </div>
  )
}

function PositionStat({ label, value, accent, positive }: { label: string; value: string; accent?: boolean; positive?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: accent ? "#FFB347" : positive ? "#22c55e" : "inherit" }}>{value}</div>
    </div>
  )
}

function Pill({ text, tone }: { text: string; tone: "ok" | "muted" | "blue" }) {
  const colors: Record<string, { fg: string; border: string }> = {
    ok:    { fg: "#22c55e", border: "#22c55e" },
    blue:  { fg: "#3b82f6", border: "#3b82f6" },
    muted: { fg: "#8A8A8A", border: "#3a3a3a" },
  }
  const c = colors[tone]
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 999,
      border: `1px solid ${c.border}`, color: c.fg, background: "transparent",
    }}>{text}</span>
  )
}
