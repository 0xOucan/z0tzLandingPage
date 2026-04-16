"use client"

import { useState } from "react"

// Matches /home/oucan/EVVM/FHE/Z0tz/gui/src/renderer/pages/Bridge.tsx:
// Bridge is self-ledger → self-ledger only. Both ends belong to the same
// passkey. For cross-chain cash-in use Cash In, for cross-chain cash-out
// use Cash Out. This page has no tabs — just src/dst/amount.
export function MockBridge() {
  const CHAINS = ["base-sepolia", "eth-sepolia", "arb-sepolia"] as const
  const [srcNet, setSrcNet] = useState("base-sepolia")
  const [dstNet, setDstNet] = useState("eth-sepolia")
  const [amount, setAmount] = useState("1.0")
  const [step, setStep] = useState<"idle" | "step1" | "step2" | "done">("idle")

  const handleBridge = () => {
    if (srcNet === dstNet || parseFloat(amount) <= 0) return
    setStep("step1")
    setTimeout(() => setStep("step2"), 1400)
    setTimeout(() => setStep("done"), 2800)
  }

  return (
    <div>
      <h1 className="mock-page-title">Bridge</h1>
      <p className="mock-page-subtitle">
        Move funds between your own ledgers across chains. Src ledger debits,
        CCTP bridges USDC, dst ledger credits. Your passkey owns both ends —
        no external target. Use Cash Out if you need to send to another address.
      </p>

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
        <p style={{ fontSize: 11, color: "#8A8A8A", marginTop: 12 }}>
          ~60-90s. Two-stage: CCTP bridge, then sweep into dst ledger. If stage 2 fails,
          your funds are safe at a dst stealth — the error dialog will show its address
          so you can recover via Cash In.
        </p>
        <button
          className="mock-btn mock-btn-primary"
          style={{ marginTop: 8 }}
          disabled={srcNet === dstNet || parseFloat(amount) <= 0 || step !== "idle" && step !== "done"}
          onClick={handleBridge}
        >
          {step === "step1" || step === "step2" ? "Bridging…" : step === "done" ? "Bridge again" : "Bridge ledger"}
        </button>
      </div>

      {step !== "idle" && (
        <div className="mock-card" style={{ marginTop: 12 }}>
          <div className="mock-step-progress">
            <StepRow label={`CCTP bridge (${srcNet} → dst stealth)`} state={step === "step1" ? "active" : "done"} detail={step === "step1" ? "~30–60s" : undefined} />
            <StepRow label={`Sweep dst stealth into ${dstNet} ledger`} state={step === "step1" ? "pending" : step === "step2" ? "active" : "done"} />
          </div>
        </div>
      )}
    </div>
  )
}

function StepRow({
  label,
  state,
  detail,
}: {
  label: string
  state: "pending" | "active" | "done"
  detail?: string
}) {
  return (
    <div className={`mock-step-line ${state}`}>
      <span className="mock-step-pip" />
      <span style={{ flex: 1 }}>
        {label}
        {detail && <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 11 }}>— {detail}</span>}
      </span>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
        {state === "active" && "…"}
        {state === "done" && "✓"}
      </span>
    </div>
  )
}
