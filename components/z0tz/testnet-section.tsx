"use client"

const chains = [
  { name: "Base Sepolia", status: true },
  { name: "Eth Sepolia", status: true },
  { name: "Arb Sepolia", status: true },
]

const operations = [
  {
    label: "Deploy",
    time: "3.7s",
    note: "$0.004",
    detail: "309K gas, RIP-7212 P-256",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xd9872afd689dbbe7760656f211c5a19d21821fe32bb5d7801fc6308dad26ca6d" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0xc8a1a7790b6a4efa6fe17239ccc558b64d41cb9ff4bfc8b81b7663716d7d89a5" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0xb250c00829edf2a922a18fd70e1cbf93be1e2b3384e28e3be6921c1e84cb1b4a" },
    ],
  },
  {
    label: "Faucet",
    time: "4.8s",
    note: "$0.002",
    detail: "137K gas, permissionless",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0x66cc949660443254b3a27d2a030a7597b0c709ae2b20e91271894b364ef1f99b" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0xe2b6aac2e4a642cfa9ed65f22ecd62d1b919c7cf2d039e69c855d15c20e33a3f" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0x411a7f639604a3ef9703943006e0e740192a40970784c9a449001f4d3efb27f0" },
    ],
  },
  {
    label: "Shield",
    time: "7.7s",
    note: "$0.006",
    detail: "467K gas, USDC\u2192eUSDC",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0x96fb6ffdd5d6e3cb90a471c9dc57ace4d7b5de4c04d47fcdbb7eb425d1e487ab" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0x3cc6abd51c042ac29bfc8157cb7dcca6733b67df53150a9b3f587da570d4e955" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0xb1a1f4c21dfdbb562cf7c8f396a84a8dff1a69ae53b38990a6a12069582f4db9" },
    ],
  },
  {
    label: "FHE Transfer",
    time: "16.5s",
    note: "$0.002",
    detail: "134K gas, CoFHE encrypted",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xf55e717ddaa2bf824f734d9a504ae9cdae31c265e5b698fe8a7569b5f62c0dc2" },
    ],
  },
  {
    label: "Unshield",
    time: "3.8s",
    note: "$0.005",
    detail: "418K gas, eUSDC\u2192USDC",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xe939f452b6624985129727951d0e7a0f5699216c5966fb829c9353c7d749f90a" },
    ],
  },
  {
    label: "Bridge",
    time: "9.9s",
    note: "cross-chain",
    detail: "Lock-and-mint via relayer",
    txs: [
      { chain: "Lock", url: "https://sepolia.basescan.org/tx/0xdde683f25242b239caf40d51c0e2bbcb634395a178fe3ee49cbee72fbc69d2a4" },
      { chain: "Mint", url: "https://sepolia.etherscan.io/tx/0xda5436c36db32a430e11bfac2cb238f35f89056b147c650e8855404691c77a19" },
    ],
  },
]

export function TestnetSection() {
  return (
    <section id="testnet" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Verified on 3 Testnets
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          36/36 operations passed — 3 users, 3 chains, zero admin key
        </p>

        {/* Chain Status */}
        <div className="flex flex-wrap justify-center gap-6 mb-16">
          {chains.map((chain) => (
            <div
              key={chain.name}
              className="flex items-center gap-2 border border-foreground/30 px-6 py-3"
            >
              <span className="text-foreground font-medium">{chain.name}</span>
              <span className="text-foreground font-bold">
                {chain.status ? "\u2713" : "\u2717"}
              </span>
            </div>
          ))}
        </div>

        {/* Operations Table */}
        <div className="overflow-x-auto">
          <table className="w-full border border-foreground text-sm">
            <thead>
              <tr className="border-b border-foreground">
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  Operation
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  Time
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground hidden md:table-cell">
                  Details
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody>
              {operations.map((op) => (
                <tr
                  key={op.label}
                  className="border-b border-foreground/20 transition-colors hover:bg-foreground/5"
                >
                  <td className="p-3 font-medium text-foreground">
                    {op.label}
                    <span className="text-muted-foreground text-xs ml-2">
                      {op.note}
                    </span>
                  </td>
                  <td className="p-3 text-foreground font-bold text-lg">
                    {op.time}
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">
                    {op.detail}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {op.txs.map((tx) => (
                        <a
                          key={tx.chain}
                          href={tx.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:underline text-xs border border-foreground/30 px-2 py-1 transition-colors hover:bg-foreground hover:text-background"
                        >
                          {tx.chain}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-muted-foreground mt-8">
          27 verified contracts across 3 chains — 36/36 in 143.7s — ~$0.06 total on L2
        </p>
      </div>
    </section>
  )
}
