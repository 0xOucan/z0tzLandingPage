"use client"

const chains = [
  { name: "Base Sepolia", status: true },
  { name: "Eth Sepolia", status: true },
  { name: "Arb Sepolia", status: true },
]

const operations = [
  {
    label: "Deploy",
    time: "5.0s",
    note: "gasless",
    detail: "Smart accounts on 3 chains",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xa532b228503a173efa7d71c30a44457210329cd5d4bfa56a801de776273da547" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0x5320128b4275ee4b741bc9718f218f4746107509142e2d2cbb4ccb4ea154d096" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0xcd091ce6f7fee43d8d90fe012f6185fe2cdb3e71e8fc86fed2897c2f3c1093cf" },
    ],
  },
  {
    label: "Faucet",
    time: "6.5s",
    note: "no admin",
    detail: "Mint test USDC permissionless",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xf2670faeb4df3cf2bd292a6d038f75291a1d3bf72d245abf34b73d7287d17685" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0x2259602b0dfc1537129ab6bcab7533e69d633e00752791d02fac6c09ff87b553" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0x3e6bc7332cddcf452a7afc31e1a9d34de5b6558f99584bcc747e5b48ca49d07f" },
    ],
  },
  {
    label: "Shield",
    time: "16.4s",
    note: "USDC\u2192eUSDC",
    detail: "FHE encrypted shielding",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0xb36160e0a4be0eff4678aa039ba44d038368c983dedbe03dac3d52a62885eb69" },
      { chain: "Eth", url: "https://sepolia.etherscan.io/tx/0x19e799c4681828dcba6be667d6a34dacccd06af8726ccd0b899dad597599ab67" },
      { chain: "Arb", url: "https://sepolia.arbiscan.io/tx/0xcf27bccb8fa0daa7033adac7ce3a59a89b2873ef6393f36310332381fda679c2" },
    ],
  },
  {
    label: "FHE Transfer",
    time: "22.1s",
    note: "encrypted",
    detail: "CoFHE SDK confidential transfer",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0x23fe1e7cab7844f79cd90acfefa6a9786b1fc6085fb613233929c26e4123200d" },
    ],
  },
  {
    label: "Unshield",
    time: "5.6s",
    note: "eUSDC\u2192USDC",
    detail: "Decrypt and withdraw",
    txs: [
      { chain: "Base", url: "https://sepolia.basescan.org/tx/0x83ccda075eeb3f5358029f5ec35289f56bbacee93ec2b6c24fe712e5d6f8a922" },
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
          27 verified contracts across 3 chains — 36/36 in 178s
        </p>
      </div>
    </section>
  )
}
