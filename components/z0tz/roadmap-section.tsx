"use client"

interface Milestone {
  phase: string
  title: string
  desc: string
  status: "done" | "current" | "pending"
}

const milestones: Milestone[] = [
  {
    phase: "1",
    title: "FHE-native CLI foundation",
    desc: "Wallet + CoFHE SDK integration, first working confidentialTransfer, shield/unshield, steganographic PNG recovery, encrypted backups.",
    status: "done",
  },
  {
    phase: "2",
    title: "Gasless smart accounts + stealth addresses",
    desc: "ERC-4337 v0.8 smart accounts with P-256 passkey identity, Z0tzPaymaster, standalone relayer, ERC-5564/6538 stealth address protocol.",
    status: "done",
  },
  {
    phase: "3",
    title: "36/36 multi-chain demo",
    desc: "Three users, three chains, every capability verified end-to-end with live tx links. Zero admin key. Zero ETH in user hands. Shipped to Base, Eth, Arb Sepolia.",
    status: "done",
  },
  {
    phase: "4",
    title: "Electron GUI + live encrypted balance reveal",
    desc: "Desktop wallet with multichain dashboard, stealth cash-in/out pages, and the first FHE encrypted-balance reveal via CoFHE permits signed with the P-256 passkey through ERC-1271.",
    status: "done",
  },
  {
    phase: "5",
    title: "V5 maximum privacy stack",
    desc: "Migrate to official Fhenix FHERC20WrappedERC20, add 2-phase unshield with threshold-network verification, PrivateSweeperV2 mixing contract, real testnet USDC support, 39 verified contracts across 13 types on 3 chains.",
    status: "done",
  },
  {
    phase: "6",
    title: "Cross-chain privacy flows",
    desc: "12-step Private Bridge, 10-step Cross-Chain Cash Out, 8-step Cross-Chain Cash In — all integrated into the Electron GUI with stealth pairs on both chains and sweeper mixing on the destination.",
    status: "done",
  },
  {
    phase: "7",
    title: "Circle CCTP V2 as the bridge layer",
    desc: "Replace the custom Z0tz bridge with permissionless Circle CCTP V2 for real USDC. Stealth pair routing on both chains, sub-minute end-to-end flows, ~1.3 bps Fast Transfer fee. External infrastructure, private composition — the bridge is Circle's, the privacy is still Z0tz's.",
    status: "current",
  },
  {
    phase: "8",
    title: "Network-layer privacy",
    desc: "TOR / NYM SOCKS5 routing integrated into the Electron transport layer, encrypted RPC endpoints, P2P relayer mesh so users can run their own stealth-funding node.",
    status: "pending",
  },
  {
    phase: "9",
    title: "Z0tz SDK for the Fhenix ecosystem",
    desc: "Publish the wallet + privacy primitives as an npm SDK so any dApp on Fhenix/CoFHE can offer private wallets with a single import.",
    status: "pending",
  },
  {
    phase: "10",
    title: "Production audit + mainnet",
    desc: "External security review of every contract type, mainnet deployments on Base / Ethereum / Arbitrum, remove the MVP / proof-of-concept disclosure.",
    status: "pending",
  },
]

export function RoadmapSection() {
  return (
    <section id="roadmap" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Roadmap
        </h2>

        <div className="max-w-3xl mx-auto">
          {milestones.map((item) => {
            const isDone = item.status === "done"
            const isCurrent = item.status === "current"
            const isPending = item.status === "pending"

            const borderClass = isCurrent
              ? "border-l-2 border-accent"
              : isDone
                ? "border-l-2 border-foreground/50"
                : "border-l-2 border-foreground/10"

            const phaseClass = isCurrent
              ? "text-accent font-bold"
              : isDone
                ? "text-foreground font-medium"
                : "text-foreground/30"

            const titleClass = isCurrent
              ? "text-accent font-bold"
              : isDone
                ? "text-foreground font-medium"
                : "text-foreground/30"

            const descClass = isCurrent
              ? "text-foreground"
              : isDone
                ? "text-muted-foreground"
                : "text-foreground/25"

            const marker = isDone ? "✓" : isCurrent ? "→" : "○"

            return (
              <div key={item.phase} className={`${borderClass} pl-6 py-4 mb-1`}>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`shrink-0 text-xs uppercase tracking-wider ${phaseClass}`}>
                    Phase {item.phase}
                  </span>
                  <span className={`shrink-0 ${isPending ? "text-foreground/20" : "text-foreground/60"}`}>
                    {marker}
                  </span>
                  <span className={`text-base ${titleClass}`}>
                    {item.title}
                  </span>
                </div>
                <p className={`text-sm mt-1 ${descClass}`}>
                  {item.desc}
                </p>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-12 text-center flex items-center justify-center gap-6 text-xs text-muted-foreground flex-wrap">
          <span><span className="text-foreground/60">✓</span> shipped</span>
          <span><span className="text-accent">→</span> current</span>
          <span><span className="text-foreground/20">○</span> pending</span>
        </div>
      </div>
    </section>
  )
}
