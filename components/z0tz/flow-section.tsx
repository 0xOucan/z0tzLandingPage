"use client"

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
    what: "Encrypted balance on Chain A becomes encrypted balance on Chain B. Stealth addresses + sweeper mixing on both sides — see the 12-step table below.",
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
  { step: 7, chain: "A", action: "stealthA approves bridge, calls lock(amount, destChainId, stealthB)", hides: "Locked event names a random source and a random dest address" },
  { step: 8, chain: "B", action: "Relayer detects lock, calls mintAndShield → tokens minted to stealthB", hides: "Minted event names stealthB, never the user" },
  { step: 9, chain: "B", action: "Relayer funds stealthB with ETH for the sweep transactions", hides: "Same shared-pool funding as step 3" },
  { step: 10, chain: "B", action: "stealthB approves PrivateSweeperV2", hides: "Approval is from a one-time address" },
  { step: 11, chain: "B", action: "Client encrypts the amount via CoFHE SDK with setAccount(sweeper) for ACL", hides: "Encrypted input is bound to the sweeper, not the user" },
  { step: 12, chain: "B", action: "PrivateSweeperV2.privateSweep — pull from stealthB, wrap, confidentialTransfer to user", hides: "Shielding attributed to sweeper, mixing all users; user gets encrypted balance with no link to stealthB" },
]

export function FlowSection() {
  return (
    <section className="py-24 px-6 bg-secondary">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Private Flows
        </h2>
        <p className="text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
          Z0tz composes the same primitives — FHE encrypted balance, stealth addresses, the PrivateSweeperV2 mixing contract,
          the lock-and-mint bridge, and the gasless paymaster — into five end-to-end flows. Each flow closes a specific privacy
          leak that single-primitive systems leave open.
        </p>

        {/* Flows summary table */}
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

        {/* 12-step bridge breakdown */}
        <h3 className="text-xl md:text-2xl font-bold uppercase tracking-widest mb-3 text-center text-foreground">
          The 12-Step Private Bridge
        </h3>
        <p className="text-center text-muted-foreground mb-8 max-w-3xl mx-auto text-sm">
          The hardest cross-chain privacy problem: FHE ciphertext handles are chain-specific and cannot be moved, so a bridge
          must transit through plaintext somewhere. The question is whether that plaintext can be linked back to the user.
          Z0tz answers no by routing the plaintext window through stealth addresses on both chains.
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

        <p className="text-center text-muted-foreground mt-8 text-sm max-w-3xl mx-auto">
          On Chain A, the only event involving the user is the encrypted transfer in step 2 — to a random address.
          On Chain B, the only event involving the user is the encrypted credit in step 12 — from the sweeper contract.
          The plaintext window (steps 6–8) sits entirely at one-time stealth addresses with no on-chain history.
        </p>
        <p className="text-center text-foreground mt-4 text-sm font-medium">
          Tested on Base Sepolia → Arb Sepolia (and back): 12/12 steps, ~50–60s, ~2.0M total gas, ~$0.026 on L2.
        </p>
      </div>
    </section>
  )
}
