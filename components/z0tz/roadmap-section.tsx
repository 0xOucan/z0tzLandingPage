"use client"

const phases = [
  { phase: 1, desc: "EOA wallet, FHE transfers, CoFHE SDK", completed: true },
  {
    phase: 2,
    desc: "Steganographic recovery, TOR/NYM routing",
    completed: true,
  },
  { phase: 3, desc: "ERC-4337 smart accounts, P-256 passkeys", completed: true },
  {
    phase: 4,
    desc: "Real EntryPoint, stealth addresses, relayer",
    completed: true,
  },
  { phase: 5, desc: "Cross-chain bridge, 3-chain deployment", completed: true },
  { phase: 6, desc: "CLI gasless tests on Base Sepolia", completed: true },
  {
    phase: 7,
    desc: "CoFHE FHE on all testnets + bridge verified",
    completed: true,
  },
  { phase: 8, desc: "V2: permissionless shield/unshield", completed: true },
  { phase: 9, desc: "36/36 definitive multi-chain demo", completed: true },
  {
    phase: 10,
    desc: "Electron GUI, stealth cash-in/out, CoFHE ERC-1271",
    completed: true,
  },
  {
    phase: 11,
    desc: "Real testnet USDC (zUSDC), hybrid RIP-7212",
    completed: true,
  },
  {
    phase: 12,
    desc: "V5: FHERC20WrappedERC20, 2-phase unshield, PrivateSweeperV2, 39 contracts",
    completed: true,
    current: true,
  },
  {
    phase: 13,
    desc: "Z0tz SDK for Fhenix ecosystem integration",
    completed: false,
  },
  {
    phase: 14,
    desc: "Production deployment, audit, mainnet",
    completed: false,
  },
]

export function RoadmapSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Roadmap
        </h2>

        <div className="max-w-2xl mx-auto">
          {phases.map((item) => (
            <div
              key={item.phase}
              className={`flex gap-4 py-3 border-l-2 pl-6 ${
                item.current
                  ? "border-accent"
                  : item.completed
                    ? "border-foreground/50"
                    : "border-foreground/20"
              }`}
            >
              <span
                className={`shrink-0 ${
                  item.current ? "text-accent font-bold" : "text-foreground"
                }`}
              >
                Phase {item.phase}
              </span>
              <span className="text-foreground">
                {item.completed ? "✓" : item.current ? "→" : ""}
              </span>
              <span
                className={
                  item.current
                    ? "text-accent"
                    : item.completed
                      ? "text-muted-foreground"
                      : "text-foreground"
                }
              >
                {item.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
