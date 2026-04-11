"use client"

interface Phase {
  phase: string
  date?: string
  title: string
  desc: string
  status: "done" | "current" | "pending"
}

// Dates are from the first landmark commit that shipped each phase,
// reconstructed from the git history on the v5-max-privacy / cctp-bridge
// branch. "Pending" phases are work that has not started yet and render
// in gray with no date.
const phases: Phase[] = [
  {
    phase: "1",
    date: "2026-03-25",
    title: "FHE-native CLI wallet",
    desc: "EOA wallet, CoFHE SDK integration, first working confidentialTransfer + shield + unshield via the CLI.",
    status: "done",
  },
  {
    phase: "2",
    date: "2026-03-25",
    title: "Recovery + network privacy scaffolding",
    desc: "LSB steganographic recovery on PNG images, encrypted ZIP backups, TOR / NYM SOCKS5 routing in the CLI transport layer.",
    status: "done",
  },
  {
    phase: "3",
    date: "2026-03-25",
    title: "Smart accounts + paymaster",
    desc: "ERC-4337 smart account contracts, P-256 passkey identity, Z0tzPaymaster with an ERC-20 fee model — first gasless UserOps end-to-end.",
    status: "done",
  },
  {
    phase: "4",
    date: "2026-03-27",
    title: "Real EntryPoint + stealth + relayer",
    desc: "Refactor to the official ERC-4337 v0.8 EntryPoint, ERC-5564/6538 stealth address protocol, standalone Vercel-hosted relayer.",
    status: "done",
  },
  {
    phase: "5",
    date: "2026-03-27",
    title: "Cross-chain bridge + 3-chain deploy",
    desc: "First custom lock-and-mint Z0tzBridge, CLI bridge commands, deployed + etherscan-verified on Base / Eth / Arb Sepolia.",
    status: "done",
  },
  {
    phase: "6",
    date: "2026-03-28",
    title: "Gasless CLI tests on Base Sepolia",
    desc: "13/13 fully gasless test run with the relayer sponsoring every UserOp. First proof that users never need ETH.",
    status: "done",
  },
  {
    phase: "7",
    date: "2026-03-28",
    title: "FHE on 3 testnets + bridge verified",
    desc: "CoFHE encryption + decryption working on all three testnets, cross-chain bridge relay verified end-to-end.",
    status: "done",
  },
  {
    phase: "8",
    date: "2026-03-29",
    title: "V2: permissionless shield/unshield",
    desc: "Refactor tokens to allow any user to shield/unshield without admin permission. Every CLI command now goes through UserOps.",
    status: "done",
  },
  {
    phase: "9",
    date: "2026-03-29",
    title: "36/36 definitive multi-chain demo",
    desc: "Three users, three chains, every capability tested end-to-end with live tx links. Zero admin key, zero ETH in user hands.",
    status: "done",
  },
  {
    phase: "10",
    date: "2026-04-01",
    title: "Electron GUI + CoFHE ERC-1271",
    desc: "Desktop wallet: multichain dashboard, private faucet, stealth cash-in/out pages, encrypted balance reveal via CoFHE permits signed with the P-256 passkey through ERC-1271.",
    status: "done",
  },
  {
    phase: "11",
    date: "2026-04-01",
    title: "Real testnet USDC + native RIP-7212",
    desc: "zUSDC deployed on all 3 chains, dual-token GUI (real USDC vs MockUSDC), native RIP-7212 P-256 precompile replaces the Solidity fallback.",
    status: "done",
  },
  {
    phase: "12",
    date: "2026-04-08",
    title: "V5: FHERC20WrappedERC20 + 2-phase unshield",
    desc: "Migrate to the official Fhenix FHERC20WrappedERC20 standard. Add PrivateSweeperV2 (stealth → wrap → confidentialTransfer) and 2-phase unshield with threshold-network verification. 39 verified contracts across 13 types on 3 chains.",
    status: "done",
  },
  {
    phase: "12.5",
    date: "2026-04-09",
    title: "Cross-chain privacy stack in the GUI",
    desc: "12-step Private Bridge, 10-step Cross-Chain Cash Out, 8-step Cross-Chain Cash In — all wired into the Electron GUI with stealth pairs on both chains and sweeper mixing on the destination.",
    status: "done",
  },
  {
    phase: "12.6",
    date: "2026-04-11",
    title: "Circle CCTP V2 as the bridge layer",
    desc: "Replace the custom Z0tzBridge with permissionless Circle CCTP V2 for real USDC. Stealth pair routing on both chains, ~1.3 bps Fast Transfer fee, ~15s end-to-end for the burn → attestation → mint cycle. Verified on Base Sepolia ↔ Arb Sepolia. MockUSDC stays on Z0tzBridge for dev tests only.",
    status: "current",
  },
  {
    phase: "13",
    title: "Network-layer privacy in the GUI",
    desc: "TOR / NYM SOCKS5 routing integrated into the Electron transport layer, encrypted RPC endpoints, P2P relayer mesh so users can run their own stealth-funding node.",
    status: "pending",
  },
  {
    phase: "14",
    title: "Z0tz SDK for Fhenix ecosystem integration",
    desc: "Publish the wallet + privacy primitives as an npm SDK so any dApp on Fhenix/CoFHE can offer private wallets with one import.",
    status: "pending",
  },
  {
    phase: "15",
    title: "Production audit + mainnet deployment",
    desc: "External security review of all 13 contract types, mainnet deployments, remove the MVP / PoC disclosure.",
    status: "pending",
  },
]

export function RoadmapSection() {
  return (
    <section id="roadmap" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Roadmap
        </h2>
        <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto text-sm">
          How Z0tz got here — reconstructed from the git log. Dates are the first landmark
          commit that shipped each phase. Pending phases are work that hasn&apos;t started yet.
        </p>

        <div className="max-w-3xl mx-auto">
          {phases.map((item) => {
            const isDone = item.status === "done"
            const isCurrent = item.status === "current"
            const isPending = item.status === "pending"

            // Border color per status
            const borderClass = isCurrent
              ? "border-l-2 border-accent"
              : isDone
                ? "border-l-2 border-foreground/50"
                : "border-l-2 border-foreground/10"

            // Text color per status
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
                  <span className={`ml-auto text-xs ${isPending ? "text-foreground/20" : "text-muted-foreground"} tabular-nums`}>
                    {item.date ?? "tbd"}
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
