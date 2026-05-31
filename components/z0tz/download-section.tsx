"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react"

const RELEASE_TAG = "v1.0.0"
const RELEASE_URL = "https://github.com/0xOucan/z0tzWalletAPK/releases/tag/v1.0.0"
const APK_URL =
  "https://github.com/0xOucan/z0tzWalletAPK/releases/download/v1.0.0/z0tz-wallet-1.0.0.apk"
const REPO_URL = "https://github.com/0xOucan/z0tzWalletAPK"
const PGP_KEY_URL = "https://github.com/0xOucan/z0tzWalletAPK/blob/main/z0tz-signing-key.asc"

// Trust anchors — also published in the releases repo README.
const APK_CERT_SHA256 =
  "63:A4:E5:A3:2D:54:00:D0:21:FD:14:3B:3C:63:80:63:2E:ED:B2:2E:53:87:D2:AB:85:C4:BF:22:CD:83:ED:4C"
const PGP_FINGERPRINT = "0202 6006 1E03 B7EC 4B0F  7BBC B0F0 6516 919D FA8A"

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => {
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <code className="block break-all font-mono text-xs leading-relaxed text-foreground">{value}</code>
    </div>
  )
}

export function DownloadSection() {
  return (
    <section id="download" className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-500">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Experimental · Testnet only
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Try the Android app
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
            An experimental, signed APK is available now — the full Z0tz wallet on your phone, running on
            Arbitrum &amp; Base Sepolia. No seed phrase, encrypted balances, gasless. This is a demo build:
            don&apos;t store real funds.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Download + install */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-bold">Download {RELEASE_TAG}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Sideload-only. We&apos;re not on the Play Store — get the APK straight from GitHub Releases.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <a href={APK_URL} rel="noopener noreferrer">
                  Download APK
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border bg-transparent hover:bg-background">
                <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                  View release ↗
                </a>
              </Button>
            </div>
            <ol className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="mr-2 font-mono text-primary">1.</span>
                Download the APK (and its <code className="font-mono text-xs">.sha256</code> +{" "}
                <code className="font-mono text-xs">.asc</code> for verification).
              </li>
              <li>
                <span className="mr-2 font-mono text-primary">2.</span>
                On your phone, enable <span className="text-foreground">Install unknown apps</span> for your
                browser or file manager.
              </li>
              <li>
                <span className="mr-2 font-mono text-primary">3.</span>
                Tap the APK to install, then open <span className="text-foreground">Z0tz</span>.
              </li>
            </ol>
          </div>

          {/* Verify */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-bold">Verify before you install</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Every release is checksummed and PGP-signed. Confirm both anchors below match — the full guide is
              in the{" "}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                releases repo
              </a>
              .
            </p>
            <div className="mt-5 space-y-3">
              <Copyable label="APK certificate · SHA-256" value={APK_CERT_SHA256} />
              <Copyable label="PGP signing key · fingerprint" value={PGP_FINGERPRINT} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={PGP_KEY_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Public PGP key ↗
              </a>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Verification guide ↗
              </a>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
{`sha256sum -c z0tz-wallet-1.0.0.apk.sha256
gpg --import z0tz-signing-key.asc
gpg --verify z0tz-wallet-1.0.0.apk.asc \\
  z0tz-wallet-1.0.0.apk`}
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
