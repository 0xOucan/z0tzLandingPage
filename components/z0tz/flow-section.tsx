"use client"

import { Expandable } from "./expandable"

interface FlowRow {
  name: string
  steps: number
  scope: string
  property: string
  what: string
}

const flows: FlowRow[] = [
  {
    name: "Cash In",
    steps: 4,
    scope: "Same chain",
    property: "Sender → receiver unlinkable",
    what: "Sender posts to a stealth address, the sweeper atomically wraps + encrypted-transfers to the recipient's account. Shielding is attributed to the sweeper, never to the recipient.",
  },
  {
    name: "Stealth Cash Out",
    steps: 8,
    scope: "Same chain",
    property: "Receiver → user unlinkable",
    what: "User encrypted-transfers to a fresh stealth, stealth runs 2-phase unshield (TN-verified), claims plaintext, sends to target. Target only sees a random one-time address.",
  },
  {
    name: "Private Bridge",
    steps: 12,
    scope: "Cross chain",
    property: "Sender + receiver unlinkable on both chains",
    what: "Encrypted balance on Chain A becomes encrypted balance on Chain B. Stealth pair routing on both sides, CCTP V2 as the transport — see the 12-step breakdown.",
  },
  {
    name: "Cross-Chain Cash In",
    steps: 8,
    scope: "Cross chain",
    property: "Sender → user unlinkable across chains",
    what: "Plaintext USDC at the user's stealth on Chain A becomes encrypted balance on Chain B. Used when an external party paid your stealth on a different chain.",
  },
  {
    name: "Cross-Chain Cash Out",
    steps: 10,
    scope: "Cross chain",
    property: "Receiver → user unlinkable across chains",
    what: "Encrypted balance on Chain A becomes plaintext USDC at a target on Chain B, with no on-chain link between either side.",
  },
]

interface BridgeStep {
  step: number
  chain: "A" | "B" | "—"
  action: string
  hides: string
}

const bridgeSteps: BridgeStep[] = [
  { step: 1, chain: "—", action: "Generate stealthA (source) + stealthB (destination) from random seeds", hides: "Both endpoints are one-time addresses" },
  { step: 2, chain: "A", action: "Encrypted transfer: smart account → stealthA (FHE confidentialTransfer)", hides: "Amount encrypted; only the link is 'user → fresh stealth'" },
  { step: 3, chain: "A", action: "Relayer funds stealthA with ETH for the next 4 transactions", hides: "Funding from a shared relayer pool — no user→stealth ETH link" },
  { step: 4, chain: "A", action: "stealthA calls unshield(self, amount) — burns encrypted, FHE.allowPublic, creates claim", hides: "Amount still encrypted on-chain at this point" },
  { step: 5, chain: "A", action: "CoFHE threshold network decrypts the burned ciphertext, publishes signed result", hides: "TN signature is the only authority on the value" },
  { step: 6, chain: "A", action: "stealthA calls claimUnshielded(ctHash, amount, sig) — receives plaintext USDC", hides: "Plaintext sits at a random address with no history" },
  { step: 7, chain: "A", action: "stealthA approves TokenMessengerV2, calls depositForBurn(amount, destDomain, stealthB, USDC, ...)", hides: "Circle CCTP event names a random source + a random mint recipient — both one-time stealths" },
  { step: 8, chain: "—", action: "Poll Circle attestation API until status = complete (~5–15s on Fast Transfer)", hides: "Only the burn message hash crosses Circle's API — no user-linkable data" },
  { step: 9, chain: "B", action: "Relayer funds stealthB with ETH for the receiveMessage + sweep transactions", hides: "Shared-pool funding — no user→stealth ETH link" },
  { step: 10, chain: "B", action: "stealthB calls MessageTransmitterV2.receiveMessage(message, attestation) — mints USDC at stealthB", hides: "CCTP MessageReceived event names stealthB, never the user" },
  { step: 11, chain: "B", action: "stealthB approves PrivateSweeperV2. Client encrypts the amount with setAccount(sweeper) for ACL", hides: "Approval is from a one-time address; encrypted input is bound to the sweeper" },
  { step: 12, chain: "B", action: "PrivateSweeperV2.privateSweep — pull from stealthB, wrap, confidentialTransfer to user", hides: "Shielding attributed to sweeper, mixing all users; user gets encrypted balance with no link to stealthB" },
]

export function FlowSection() {
  return (
    <section id="flows" className="py-24 px-6 bg-secondary">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Private Flows
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
          Five end-to-end flows built on the same primitives — FHE encrypted balance, stealth addresses,
          the PrivateSweeperV2 mixing contract, Circle CCTP V2 as the cross-chain bridge, and the gasless
          paymaster. Each flow closes a specific privacy leak that single-primitive systems leave open.
        </p>

        {/* Flows summary table — always visible */}
        <div className="border border-foreground/30 mb-16 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/30 bg-background">
                <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Flow</th>
                <th className="text-center p-4 uppercase tracking-wider text-foreground font-bold">Steps</th>
                <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Scope</th>
                <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">Privacy Property</th>
                <th className="text-left p-4 uppercase tracking-wider text-foreground font-bold">What It Does</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((row, i) => (
                <tr key={i} className={i < flows.length - 1 ? "border-b border-foreground/15" : ""}>
                  <td className="p-4 text-foreground font-bold whitespace-nowrap">{row.name}</td>
                  <td className="p-4 text-center text-foreground">{row.steps}</td>
                  <td className="p-4 text-muted-foreground whitespace-nowrap">{row.scope}</td>
                  <td className="p-4 text-muted-foreground">{row.property}</td>
                  <td className="p-4 text-muted-foreground">{row.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CCTP composition note — always visible, short */}
        <div className="border border-foreground/30 p-6 mb-12 max-w-3xl mx-auto">
          <h3 className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
            External infrastructure, private composition
          </h3>
          <p className="text-muted-foreground text-sm mb-3">
            Z0tz does not operate its own cross-chain bridge anymore. Circle does, via the permissionless
            CCTP V2 <code className="text-foreground">TokenMessengerV2</code> and{" "}
            <code className="text-foreground">MessageTransmitterV2</code> contracts at a known address on every
            supported chain. Z0tz routes the burn and mint through one-time stealth addresses on both sides, so
            Circle&apos;s public events connect two random addresses — never the user&apos;s smart account.
          </p>
          <p className="text-foreground text-sm font-medium">
            Circle CCTP V2 is the bridge. Z0tz is still the privacy.
          </p>
        </div>

        {/* 12-step bridge deep-dive — click title or "see more" to expand */}
        <Expandable
          title="The 12-step private bridge"
          summary="Burn-and-mint routed through a stealth pair. Step-by-step table of what happens on each chain and what each step hides."
          moreLabel="see the 12 steps"
          lessLabel="hide the 12 steps"
        >
          <p className="text-muted-foreground mb-8 text-sm max-w-3xl">
            The hardest cross-chain privacy problem: FHE ciphertext handles are chain-specific and cannot be
            moved, so a bridge must transit through plaintext somewhere. The question is whether that
            plaintext can be linked back to the user. Z0tz answers no by routing Circle CCTP V2 through
            stealth addresses on both chains.
          </p>

          <div className="border border-foreground/30 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/30 bg-background">
                  <th className="text-center p-3 uppercase tracking-wider text-foreground font-bold w-12">#</th>
                  <th className="text-center p-3 uppercase tracking-wider text-foreground font-bold w-16">Chain</th>
                  <th className="text-left p-3 uppercase tracking-wider text-foreground font-bold">Action</th>
                  <th className="text-left p-3 uppercase tracking-wider text-foreground font-bold">What It Hides</th>
                </tr>
              </thead>
              <tbody>
                {bridgeSteps.map((s) => (
                  <tr key={s.step} className="border-b border-foreground/15 last:border-b-0">
                    <td className="p-3 text-center text-foreground font-bold">{s.step}</td>
                    <td className="p-3 text-center text-foreground">{s.chain}</td>
                    <td className="p-3 text-muted-foreground">{s.action}</td>
                    <td className="p-3 text-muted-foreground">{s.hides}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground mt-6 text-sm max-w-3xl">
            On Chain A, the only event involving the user&apos;s smart account is the encrypted transfer in
            step 2 — to a random one-time stealth address. On Chain B, the only event involving the user&apos;s
            smart account is the encrypted credit in step 12 — from the sweeper contract that mixes all users.
            The plaintext window (steps 6–10) sits entirely at one-time stealth addresses with no on-chain
            history before or after the flow. Circle&apos;s MessageSent → MessageReceived event pair connects
            two random addresses, not the user&apos;s accounts.
          </p>

          {/* Real testnet runs */}
          <div className="border border-foreground/30 p-6 mt-8">
            <h4 className="text-sm font-bold uppercase tracking-wider mb-4 text-foreground">
              Real testnet runs (Base Sepolia ↔ Arb Sepolia, CCTP V2 Fast Transfer)
            </h4>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider">Cross-Chain Cash In (8 steps)</div>
                <div className="text-foreground font-bold text-xl mt-1">38.6s</div>
                <div className="text-muted-foreground text-xs">718K gas · $0.010 · ~1.3 bps CCTP fee</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider">Private Bridge (12 steps)</div>
                <div className="text-foreground font-bold text-xl mt-1">64.2s</div>
                <div className="text-muted-foreground text-xs">1.94M gas · $0.024 · ~1.3 bps CCTP fee</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider">Cross-Chain Cash Out (10 steps)</div>
                <div className="text-foreground font-bold text-xl mt-1">52.4s</div>
                <div className="text-muted-foreground text-xs">541K gas · $0.007 · ~0.013 bps fee</div>
              </div>
            </div>
          </div>

          <p className="text-foreground mt-6 text-sm font-medium">
            The privacy gain comes from address unlinkability, not amount confidentiality at the bridge boundary.
          </p>
        </Expandable>
      </div>
    </section>
  )
}
