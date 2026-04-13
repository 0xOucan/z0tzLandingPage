"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const architectureFlow = [
  { label: "User (P-256 Passkey)", action: "sign UserOp (offline, free)" },
  { label: "Z0tz CLI / GUI", action: "FHE encrypt → build UserOp" },
  { label: "Z0tz Relayer", action: "submit to chain (pays ETH gas)" },
  { label: "EntryPoint (ERC-4337 v0.8)", action: "validateUserOp (P-256)" },
  { label: "Z0tzAccount (Smart Account)", action: "execute()" },
  { label: "FHERC20 Token", action: "encrypted transfer" },
  { label: "Z0tzPaymaster.postOp()", action: "collects 1% token fee" },
]

const layerDetails = [
  {
    layer: "Identity",
    tech: "P-256 passkey (WebAuthn)",
    how: "Each wallet starts with a P-256 keypair held locally by the user. No seed phrase is ever generated. The public key derives the smart account address via CREATE2. On-chain signature verification uses the native RIP-7212 precompile at address 0x100 — available on every modern EVM chain since Pectra.",
  },
  {
    layer: "Smart account",
    tech: "ERC-4337 v0.8 + Z0tzAccount",
    how: "Z0tzAccount implements ERC-1271 for smart-account signature validation so the same P-256 passkey that authenticates the user can also authorize CoFHE permits without touching any secp256k1 key. UserOps validate via the canonical EntryPoint v0.8.",
  },
  {
    layer: "Gasless execution",
    tech: "Z0tzPaymaster + relayer",
    how: "Every operation — deploy, shield, unshield, FHE transfer, bridge — is sponsored by Z0tzPaymaster, which collects a 1% fee in the transacted token from the user in postOp. The relayer advances ETH gas upfront and gets reimbursed. Users never hold or spend ETH.",
  },
  {
    layer: "Encrypted state",
    tech: "Fhenix CoFHE + FHERC20WrappedERC20",
    how: "Token balances live on-chain as euint64 ciphertext handles. Transfer amounts are InEuint64 verified by ZK proof before the FHERC20 contract touches them. Observers see ciphertext handles, not values. Decryption requires a CoFHE permit signed with the passkey through ERC-1271.",
  },
  {
    layer: "Stealth payments",
    tech: "ERC-5564/6538 DKSAP",
    how: "Dual-key stealth addresses generate one-time receive addresses from a recipient's meta-address. Only the recipient — with the viewing key — can identify which announcements belong to them. PrivateSweeperV2 atomically pulls from the stealth, wraps to FHERC20, and executes a confidentialTransfer to the real account, mixing every user through the same sweeper contract.",
  },
  {
    layer: "Cross-chain",
    tech: "Circle CCTP V2 + stealth pairs",
    how: "Real USDC moves cross-chain via Circle's permissionless TokenMessengerV2 (burn) and MessageTransmitterV2 (mint), routed through a fresh stealth pair on each side. Circle's public events connect two one-time addresses, never the user's smart account. Fast Transfer completes the burn → attestation → mint cycle in roughly 15 seconds.",
  },
  {
    layer: "Recovery",
    tech: "Steganographic + guardian",
    how: "Three recovery paths, none of which store secrets on-chain: PIN-encrypted QR code backup, LSB steganographic backup hidden inside an arbitrary PNG, and a RecoveryModule smart contract with configurable guardian threshold, time delay, and commitment-based proof.",
  },
]

export function ArchitectureSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="architecture" className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Architecture
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
          Seven layers, each closing a specific leak the others leave open. Z0tz composes
          permissionless external infrastructure (CoFHE, CCTP V2, ERC-4337, RIP-7212) rather
          than rebuilding it.
        </p>

        {/* Compact flow diagram — always visible */}
        <div className="bg-secondary border border-foreground/30 p-6 md:p-10 mb-12">
          <div className="space-y-0">
            {architectureFlow.map((step, index) => (
              <div key={index}>
                <div className="flex items-start gap-4">
                  <span className="text-foreground font-bold shrink-0">
                    {step.label}
                  </span>
                </div>
                {index < architectureFlow.length - 1 && (
                  <div className="flex items-center gap-4 py-2">
                    <span className="text-muted-foreground text-lg">↓</span>
                    <span className="text-muted-foreground text-sm">
                      {step.action}
                    </span>
                  </div>
                )}
                {index === architectureFlow.length - 1 && (
                  <div className="flex items-center gap-4 pt-2">
                    <span className="text-muted-foreground text-lg">→</span>
                    <span className="text-muted-foreground text-sm">
                      {step.action}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Per-layer deep dive — expandable */}
        <Expandable
          title="Architecture deep dive"
          summary="One paragraph per layer — identity, smart account, gasless execution, encrypted state, stealth payments, cross-chain, recovery."
          moreLabel="see the layer breakdown"
          lessLabel="hide the layer breakdown"
        >
          <div className="space-y-6">
            {layerDetails.map((l, i) => (
              <div key={i} className="border-l-2 border-foreground/30 pl-6">
                <div className="flex items-baseline gap-4 flex-wrap mb-2">
                  <h3 className="text-base font-bold uppercase tracking-wider text-foreground">
                    {l.layer}
                  </h3>
                  <span className="text-xs text-muted-foreground">{l.tech}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{l.how}</p>
              </div>
            ))}
          </div>
        </Expandable>
      </div>
      </div>
    </section>
  )
}
