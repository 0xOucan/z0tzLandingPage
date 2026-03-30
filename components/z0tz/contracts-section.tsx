"use client"

const contracts = [
  {
    name: "Z0tzTokenV2",
    description: "FHERC20 permissionless shield/unshield",
    eth: "https://sepolia.etherscan.io/address/0x9778E6C26a3d6Af81E44AC1e54C29241967bea16#code",
    arb: "https://sepolia.arbiscan.io/address/0x172b17c101E5cF692a2586E976450B96AD32c292#code",
    base: "https://sepolia.basescan.org/address/0x73D9e7800A85E3935ae36B1A57c715D7379886C7#code",
  },
  {
    name: "Z0tzAccountFactory",
    description: "CREATE2 deterministic deployment",
    eth: "https://sepolia.etherscan.io/address/0xE6eD73e9dB832bFd7e80432E36A4b187999EC3F7#code",
    arb: "https://sepolia.arbiscan.io/address/0xdC2C1240688D7Ec45B91662541D3a1E249a06359#code",
    base: "https://sepolia.basescan.org/address/0x01E543EF0dC63328Ef59250dA4cBc717BBf7bAb3#code",
  },
  {
    name: "Z0tzPaymaster",
    description: "1% fee, approved targets only",
    eth: "https://sepolia.etherscan.io/address/0xfB2Fa879726c9e1101497D4F9B34BdD1ec0c8702#code",
    arb: "https://sepolia.arbiscan.io/address/0x4B038D34809363174a6Fc44715CE8Aafc1f9c55d#code",
    base: "https://sepolia.basescan.org/address/0xd32aD7E3D879458963762B432edEc4D04E77A976#code",
  },
  {
    name: "RecoveryModule",
    description: "Guardian + commitment + delay",
    eth: "https://sepolia.etherscan.io/address/0x7De8bA252E82D45B3dcF460dA2AB28c82d256224#code",
    arb: "https://sepolia.arbiscan.io/address/0xfcdE549693218E4599f5bBA10e89c75396812B2B#code",
    base: "https://sepolia.basescan.org/address/0x2cb622CfcC23E7CC453DD806b9A47FE2416BA2CF#code",
  },
  {
    name: "StealthRegistry",
    description: "ERC-6538 meta-address registry",
    eth: "https://sepolia.etherscan.io/address/0x6aCE85FE5b022f9914B996b2C18Fe884EA34e25B#code",
    arb: "https://sepolia.arbiscan.io/address/0x1AEC0ce9051d629Ede7223bff16fcA6C2f9B93d5#code",
    base: "https://sepolia.basescan.org/address/0x8bdf8e6Fb2bd8D12Af55a3A591579B59cc770000#code",
  },
  {
    name: "StealthAnnouncer",
    description: "ERC-5564 payment announcer",
    eth: "https://sepolia.etherscan.io/address/0x2f1475D68C3d96da1f299b0284834Ebf918866B6#code",
    arb: "https://sepolia.arbiscan.io/address/0x68CC852EFEC957646Bfd87Ec30e74A2bd05Cb29D#code",
    base: "https://sepolia.basescan.org/address/0x4a29829B0A7be53e33990D4a876bE5A2e9b099F9#code",
  },
  {
    name: "StealthSweeper",
    description: "Gasless EIP-191 meta-tx sweep",
    eth: "https://sepolia.etherscan.io/address/0x8BD8dC87AB6938CD083cdF49fD87aFF14E02D00B#code",
    arb: "https://sepolia.arbiscan.io/address/0xEeF66Ad3F70f6cEed8E7123Acc8875F9f1Ea9253#code",
    base: "https://sepolia.basescan.org/address/0xB9E6074aE49D97D4C7c41C6171e3E73FafD80007#code",
  },
  {
    name: "Z0tzBridge",
    description: "Lock-and-mint cross-chain",
    eth: "https://sepolia.etherscan.io/address/0x13Feee76C95060Ca80b3c049243446460154F052#code",
    arb: "https://sepolia.arbiscan.io/address/0xB39452806FC3658b78b06880e89F86980B56C08D#code",
    base: "https://sepolia.basescan.org/address/0xA1df4ED5ce42444df41Ff6AF0AcCccD804851Ee9#code",
  },
  {
    name: "P256Verifier",
    description: "daimo-eth real P-256 verification",
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
          9 contracts deployed &amp; verified on 3 chains — 27 total
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
