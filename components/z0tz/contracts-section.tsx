"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const contracts = [
  {
    name: "Z0tzTokenV2",
    description: "FHERC20 permissionless shield/unshield",
    eth: "https://sepolia.etherscan.io/address/0xB5922Ac6a84Ef02Ee5BB792583FB4fe346F05641#code",
    arb: "https://sepolia.arbiscan.io/address/0x3A6D283C7Af367b82eE557D0cC6D5222D7918a2B#code",
    base: "https://sepolia.basescan.org/address/0x064669C42879f2e8E42712E294E758c97902DB41#code",
  },
  {
    name: "Z0tzAccountFactory",
    description: "CREATE2, P-256 (RIP-7212 precompile)",
    eth: "https://sepolia.etherscan.io/address/0x5Fa5dB190ec8978472CD1357de905F961f0518bC#code",
    arb: "https://sepolia.arbiscan.io/address/0x5D40769712F945831e6E338b5e3C628A926520Ae#code",
    base: "https://sepolia.basescan.org/address/0xbD998e232226158B194644B0b72B94C0F0C80C86#code",
  },
  {
    name: "Z0tzPaymaster",
    description: "1% fee, approved targets only",
    eth: "https://sepolia.etherscan.io/address/0x629CE4D5384541100805C7915c0f358a9C507092#code",
    arb: "https://sepolia.arbiscan.io/address/0x77A1beda9d0690843345954e6EA33FafddcCC60b#code",
    base: "https://sepolia.basescan.org/address/0xb3A00685844c89526E820f4Ce8704994317f10ce#code",
  },
  {
    name: "RecoveryModule",
    description: "Guardian + commitment + delay",
    eth: "https://sepolia.etherscan.io/address/0x25533FF42195c0e045B73ddf913C9d26152200ec#code",
    arb: "https://sepolia.arbiscan.io/address/0xC2796d8F72fedD9315e10D47153E7172bD277345#code",
    base: "https://sepolia.basescan.org/address/0x901Ba2F21fFFc4BE041c5FFD99d50C856e375291#code",
  },
  {
    name: "StealthRegistry",
    description: "ERC-6538 meta-address registry",
    eth: "https://sepolia.etherscan.io/address/0xFc6E42a755D2FaEBaDb7801b367Fcb22BB2e2bD0#code",
    arb: "https://sepolia.arbiscan.io/address/0x89e363515F1122787F49CfAcC836e57408cD76A8#code",
    base: "https://sepolia.basescan.org/address/0x234A86B51418F6a271d3DDC108A07726AEAc2876#code",
  },
  {
    name: "StealthAnnouncer",
    description: "ERC-5564 payment announcer",
    eth: "https://sepolia.etherscan.io/address/0xbbde18842026363f3a98ef70B15e7EE926F56080#code",
    arb: "https://sepolia.arbiscan.io/address/0xc99D34A2D7143b2eC1d12E353fC5d7570ac79A8f#code",
    base: "https://sepolia.basescan.org/address/0xa32a039C519FA313ef1A005Db93c996e3777F904#code",
  },
  {
    name: "StealthSweeper",
    description: "Gasless EIP-191 meta-tx sweep",
    eth: "https://sepolia.etherscan.io/address/0x4fa04CF4086c191406d12c85B00a04Fd7D9cBbd8#code",
    arb: "https://sepolia.arbiscan.io/address/0xEf139Bb03531AeAab895453d895C3fa687Ed5240#code",
    base: "https://sepolia.basescan.org/address/0xDDF4540b37146FabC420d6a76FCd1cDAba4bFBeD#code",
  },
  {
    name: "Z0tzBridge",
    description: "Legacy lock-and-mint (MockUSDC dev only)",
    eth: "https://sepolia.etherscan.io/address/0x70b82CFBE39BDf0E29F6072D625f04b757A79e70#code",
    arb: "https://sepolia.arbiscan.io/address/0xA524a05beB1158E8bbB321d55971B8c52188777f#code",
    base: "https://sepolia.basescan.org/address/0xF4C06541DDE43845469472D0F5e512723d85769A#code",
  },
  {
    name: "WrappedUSDC (V6)",
    description: "FHERC20WrappedERC20 + 2-phase unshield",
    eth: "https://sepolia.etherscan.io/address/0xb2ffb39815B73c1384466a2C61D75da0F819130C#code",
    arb: "https://sepolia.arbiscan.io/address/0x61AD2081D24BfEB86434FB71FeC52c191c7A33d5#code",
    base: "https://sepolia.basescan.org/address/0xc74F97F70A0F9CB29143443e85843bfd22eB1613#code",
  },
  {
    name: "WrappedMock (V6)",
    description: "FHERC20WrappedERC20 over MockUSDC (dev)",
    eth: "https://sepolia.etherscan.io/address/0x7D1ED1D945Af0D0a02dad04a4d88738aafF1d1df#code",
    arb: "https://sepolia.arbiscan.io/address/0xE8Ccc4E058fbeE6888Df4B748a55f280f33DC86D#code",
    base: "https://sepolia.basescan.org/address/0x9be379AF43c8825132B3F65E717079D8833335F7#code",
  },
  {
    name: "PrivateSweeperV2",
    description: "FHE-encrypted stealth sweep + mixing",
    eth: "https://sepolia.etherscan.io/address/0x43C7A087c394e66178eD7c864724d30d75339c51#code",
    arb: "https://sepolia.arbiscan.io/address/0x2F87e53CA285e5C2bde4239CE390786db90D5dc6#code",
    base: "https://sepolia.basescan.org/address/0x9f3b7A9Cd6d801F746B1F43AeCbD1753318e6958#code",
  },
  {
    name: "MockUSDC (feeToken)",
    description: "Public-mint MockERC20 used as paymaster fee token",
    eth: "https://sepolia.etherscan.io/address/0xb259F8D770c02EFA62347F82335CB5b7DB91567E#code",
    arb: "https://sepolia.arbiscan.io/address/0xA6611C57a0F60920e024b40a6E759c8cA37fC3f2#code",
    base: "https://sepolia.basescan.org/address/0xcE808361050A504276179214672fb4C5bE19957e#code",
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
  const { ref, revealed } = useScrollReveal()

  return (
    <section id="contracts" className="py-24 px-6 bg-secondary">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Verified Contracts
        </h2>

        {/* Summary card — always visible */}
        <div className="max-w-3xl mx-auto mb-12">
          <div className="grid grid-cols-3 gap-6 text-center mb-8">
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">39</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Verified contracts</div>
            </div>
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">13</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Contract types</div>
            </div>
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">3</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Testnets</div>
            </div>
          </div>
          <p className="text-center text-muted-foreground text-sm">
            V6 deployment — every Z0tz contract type deployed and etherscan-verified on Base
            Sepolia, Ethereum Sepolia, and Arbitrum Sepolia. Circle CCTP V2 (
            <code className="text-foreground">TokenMessengerV2</code>,{" "}
            <code className="text-foreground">MessageTransmitterV2</code>) serves as the bridge
            layer for real USDC at known canonical addresses.
          </p>
        </div>

        {/* Full contract list — expandable */}
        <Expandable
          title="All contract addresses across three chains"
          summary="Click any row to open the verified source on its chain explorer."
          moreLabel="see the full address list"
          lessLabel="hide the address list"
        >
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
            — same on all chains. Circle CCTP V2 TokenMessengerV2 / MessageTransmitterV2 — canonical
            addresses from Circle, same on all supported chains.
          </p>
        </Expandable>
      </div>
      </div>
    </section>
  )
}
