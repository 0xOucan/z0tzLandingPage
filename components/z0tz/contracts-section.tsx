"use client"

const contracts = [
  {
    name: "Z0tzTokenV2",
    description: "FHERC20 permissionless shield/unshield",
    eth: "https://sepolia.etherscan.io/address/0xf8B9C8948326f3ba51C911F5e2D239431fFcBc07#code",
    arb: "https://sepolia.arbiscan.io/address/0x500652de18697316134Cab9571eDF44F06737Be3#code",
    base: "https://sepolia.basescan.org/address/0x7Ad5b056F6E1d3175E1bFD760BfF9a0B39953708#code",
  },
  {
    name: "Z0tzAccountFactory",
    description: "CREATE2, hybrid P-256 (RIP-7212)",
    eth: "https://sepolia.etherscan.io/address/0x7CC57b1a0E3f297aC5756eE8ff61C113fa8705D1#code",
    arb: "https://sepolia.arbiscan.io/address/0x73D9e7800A85E3935ae36B1A57c715D7379886C7#code",
    base: "https://sepolia.basescan.org/address/0x7dA841679F9cCbd0f282BBe62c2f5df1079ffAf5#code",
  },
  {
    name: "Z0tzPaymaster",
    description: "1% fee, approved targets only",
    eth: "https://sepolia.etherscan.io/address/0xeBBb05403B96279a269F26C5F7BFa6BCf39d4cF7#code",
    arb: "https://sepolia.arbiscan.io/address/0x2cb622CfcC23E7CC453DD806b9A47FE2416BA2CF#code",
    base: "https://sepolia.basescan.org/address/0x79a7e7c6bdF5DEC837de87d3043F92381Eb9aE22#code",
  },
  {
    name: "RecoveryModule",
    description: "Guardian + commitment + delay",
    eth: "https://sepolia.etherscan.io/address/0x514a1a4C0be76DDF3b8Ba9C6b616d43A7B1aaA43#code",
    arb: "https://sepolia.arbiscan.io/address/0xE80Da96D8513Da14598a7d928968745ED022e23c#code",
    base: "https://sepolia.basescan.org/address/0x03FA8293291e063ca044A4Da71AFe238C36f2dEa#code",
  },
  {
    name: "StealthRegistry",
    description: "ERC-6538 meta-address registry",
    eth: "https://sepolia.etherscan.io/address/0x401727E22008A28a036ac3a64b5922DaC08C1AA0#code",
    arb: "https://sepolia.arbiscan.io/address/0xd32aD7E3D879458963762B432edEc4D04E77A976#code",
    base: "https://sepolia.basescan.org/address/0xea4d51087DaE6d915807D562892308D0e07677bD#code",
  },
  {
    name: "StealthAnnouncer",
    description: "ERC-5564 payment announcer",
    eth: "https://sepolia.etherscan.io/address/0x7B408bFCF0c68b0C0409Ea0E1e1ec24321292f96#code",
    arb: "https://sepolia.arbiscan.io/address/0x2f0AEF008178E840A447a8332E17e582363582f8#code",
    base: "https://sepolia.basescan.org/address/0x3D6CCa27bFd79A6e628322fa46D555b406CdF796#code",
  },
  {
    name: "StealthSweeper",
    description: "Gasless EIP-191 meta-tx sweep",
    eth: "https://sepolia.etherscan.io/address/0xAfa8c4e6EDF9D2f1ddb4BBEAb200bC866e620eab#code",
    arb: "https://sepolia.arbiscan.io/address/0xDacb38Dfb0F568E76Ccbb19AC7c814dC262f60B0#code",
    base: "https://sepolia.basescan.org/address/0x60Ef000D1C4DDF76AAd882eAdaB38E937E4A5729#code",
  },
  {
    name: "Z0tzBridge",
    description: "Lock-and-mint cross-chain",
    eth: "https://sepolia.etherscan.io/address/0xcC9cC052549b5e57c78a78fAD777Aba8824599e9#code",
    arb: "https://sepolia.arbiscan.io/address/0x8eD185F95d62A60CC3Cf2688FFe3a250b3a8262B#code",
    base: "https://sepolia.basescan.org/address/0x94434cD412056535512dD7f0D39D8e4B03580c5B#code",
  },
  {
    name: "zUSDC (FHERC20)",
    description: "Real testnet USDC → encrypted",
    eth: "https://sepolia.etherscan.io/address/0x88599eBD2A9d869529322Fa628020Ea81708Ff30#code",
    arb: "https://sepolia.arbiscan.io/address/0xA9a33070375969758aE5e663aa47F82C886AffD9#code",
    base: "https://sepolia.basescan.org/address/0x7A80aaedaeE4e99Fd53A010fDf7027A72CC659De#code",
  },
  {
    name: "PrivateSweeper",
    description: "FHE-encrypted stealth sweep",
    eth: "https://sepolia.etherscan.io/address/0x0F525f0989faCeD5f891b13DB646e4A2B3Fad91D#code",
    arb: "https://sepolia.arbiscan.io/address/0x7Ad5b056F6E1d3175E1bFD760BfF9a0B39953708#code",
    base: "https://sepolia.basescan.org/address/0x407eD47868F2C4fcf01d9022B74b441DdfdFba0f#code",
  },
  {
    name: "P256Verifier",
    description: "RIP-7212 native precompile (0x100)",
    eth: "https://sepolia.etherscan.io/address/0xc2b78104907F722DABAc4C69f826a522B2754De4#code",
    arb: "https://sepolia.arbiscan.io/address/0xc2b78104907F722DABAc4C69f826a522B2754De4#code",
    base: "https://sepolia.basescan.org/address/0xc2b78104907F722DABAc4C69f826a522B2754De4#code",
  },
]

export function ContractsSection() {
  return (
    <section id="contracts" className="py-24 px-6 bg-secondary">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Verified Contracts
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          11 contracts deployed &amp; verified on 3 chains — 33 total
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border border-foreground text-sm">
            <thead>
              <tr className="border-b border-foreground">
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground">
                  Contract
                </th>
                <th className="text-left p-3 uppercase tracking-wider font-bold text-foreground hidden md:table-cell">
                  Description
                </th>
                <th className="text-center p-3 uppercase tracking-wider font-bold text-foreground">
                  Eth
                </th>
                <th className="text-center p-3 uppercase tracking-wider font-bold text-foreground">
                  Arb
                </th>
                <th className="text-center p-3 uppercase tracking-wider font-bold text-foreground">
                  Base
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr
                  key={c.name}
                  className="border-b border-foreground/20 transition-colors hover:bg-foreground/5"
                >
                  <td className="p-3 font-medium text-foreground">{c.name}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">
                    {c.description}
                  </td>
                  <td className="p-3 text-center">
                    <a
                      href={c.eth}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      view
                    </a>
                  </td>
                  <td className="p-3 text-center">
                    <a
                      href={c.arb}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      view
                    </a>
                  </td>
                  <td className="p-3 text-center">
                    <a
                      href={c.base}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      view
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-muted-foreground text-sm mt-6">
          EntryPoint v0.8:{" "}
          <a
            href="https://sepolia.basescan.org/address/0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            0x4337084D...Ff108
          </a>{" "}
          — same on all chains
        </p>
      </div>
    </section>
  )
}
