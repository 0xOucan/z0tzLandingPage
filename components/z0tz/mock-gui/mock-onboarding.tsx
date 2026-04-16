"use client"

import { useRef, useState } from "react"
import { BatLogo } from "@/components/z0tz/bat-logo"

interface MockOnboardingProps {
  /** Called when the user "unlocks" or "creates" the simulated wallet. */
  onUnlocked: () => void
}

type Mode = "choose" | "pin" | "create" | "import"

export function MockOnboarding({ onUnlocked }: MockOnboardingProps) {
  const [mode, setMode] = useState<Mode>("choose")
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [err, setErr] = useState<string | null>(null)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const enterDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return
    const next = [...digits]
    next[i] = v
    setDigits(next)
    setErr(null)
    // Auto-advance to the next input so the user doesn't click each digit.
    if (v && i < digits.length - 1) inputRefs.current[i + 1]?.focus()
    if (next.every((d) => d !== "")) {
      // Accept any 6-digit PIN in the preview. Real GUI verifies it by
      // decrypting the keystore with scrypt.
      setTimeout(() => onUnlocked(), 180)
    }
  }

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
    if (e.key === "ArrowLeft" && i > 0) inputRefs.current[i - 1]?.focus()
    if (e.key === "ArrowRight" && i < digits.length - 1) inputRefs.current[i + 1]?.focus()
  }

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!text) return
    e.preventDefault()
    const next = ["", "", "", "", "", ""]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setDigits(next)
    const focusAt = Math.min(text.length, 5)
    inputRefs.current[focusAt]?.focus()
    if (next.every((d) => d !== "")) setTimeout(() => onUnlocked(), 180)
  }

  return (
    <div className="mock-onboarding">
      <div className="mock-onboarding-card">
        <div className="mock-onboarding-banner">
          Simulated preview · no real wallet, no network traffic, nothing written to disk
        </div>

        <div className="mock-onboarding-logo">
          <BatLogo size={48} />
          <span>Z0TZ</span>
        </div>

        {mode === "choose" && (
          <>
            <h2 className="mock-onboarding-title">Welcome</h2>
            <p className="mock-onboarding-sub">
              In the real GUI you&apos;d pick one of these paths. This preview simulates
              all three — none of them write to your disk or hit a network.
            </p>

            <div className="mock-onboarding-choices">
              <button
                className="mock-btn mock-btn-primary mock-btn-full"
                onClick={() => setMode("pin")}
              >
                Unlock with PIN
              </button>
              <button
                className="mock-btn mock-btn-full"
                onClick={() => setMode("create")}
              >
                Create new wallet
              </button>
              <button
                className="mock-btn mock-btn-full"
                onClick={() => setMode("import")}
              >
                Import backup (QR · ZIP · stego PNG)
              </button>
            </div>

            <p className="mock-onboarding-foot">
              Real GUI: passkey-rooted, 6-digit PIN gates the local keystore, auto-lock after 5 minutes idle.
            </p>
          </>
        )}

        {mode === "pin" && (
          <>
            <h2 className="mock-onboarding-title">Enter PIN</h2>
            <p className="mock-onboarding-sub">
              Simulated — any 6 digits will unlock the preview.
            </p>
            <div className="mock-pin-row">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => enterDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={i === 0 ? onPaste : undefined}
                  className="mock-pin-digit"
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {err && <p className="mock-onboarding-err">{err}</p>}
            <button
              className="mock-btn mock-btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => { setMode("choose"); setDigits(["","","","","",""]) }}
            >
              ← back
            </button>
          </>
        )}

        {mode === "create" && (
          <>
            <h2 className="mock-onboarding-title">Create new wallet</h2>
            <p className="mock-onboarding-sub">
              In the real GUI this would register a WebAuthn passkey with your device
              and encrypt the derived keystore under a 6-digit PIN. In this preview
              we skip the crypto and jump straight to the simulated dashboard.
            </p>
            <div className="mock-onboarding-steps">
              <div className="mock-step-row done">
                <span className="mock-step-dot" /> Register passkey on device (simulated)
              </div>
              <div className="mock-step-row done">
                <span className="mock-step-dot" /> Derive smart-account addresses (simulated)
              </div>
              <div className="mock-step-row done">
                <span className="mock-step-dot" /> Encrypt local keystore (simulated)
              </div>
            </div>
            <button
              className="mock-btn mock-btn-primary mock-btn-full"
              style={{ marginTop: 16 }}
              onClick={onUnlocked}
            >
              Enter preview →
            </button>
            <button
              className="mock-btn mock-btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setMode("choose")}
            >
              ← back
            </button>
          </>
        )}

        {mode === "import" && (
          <>
            <h2 className="mock-onboarding-title">Import backup</h2>
            <p className="mock-onboarding-sub">
              The real GUI opens a system file picker and decrypts a QR PNG, a
              stego-encoded image, or a ZIP. In this preview we skip the file
              chooser entirely.
            </p>
            <div className="mock-onboarding-note">
              No file explorer in the preview — backups work only in the installed
              desktop GUI, where saves land in your chosen Downloads-adjacent folder.
            </div>
            <button
              className="mock-btn mock-btn-primary mock-btn-full"
              style={{ marginTop: 16 }}
              onClick={onUnlocked}
            >
              Continue to preview →
            </button>
            <button
              className="mock-btn mock-btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setMode("choose")}
            >
              ← back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
