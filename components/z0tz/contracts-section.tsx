"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * V6.5.2 verified contract addresses. Ledger / Vault / Sweeper form the three
 * primitives introduced in V6.5 — the older one-shot sweeper and wrapper are
 * still listed for reference but the active flow only touches these three.
 * Source-of-truth: contracts/deployments/v6.5-ledger-{chainId}.json.
 */
const contracts = [
  {
    name: "Z0tzPrivateLedger",
    description: "Pseudonymous IDs · spend · rotate · cashout actions",
    eth: "https://sepolia.etherscan.io/address/0xE0333Bc3E574Dcb37414D9D3e576458AfFDE3F93#code",
    arb: "https://sepolia.arbiscan.io/address/0x349F514332127e2a81329E5Cc08bb5BFa07cE35E#code",
    base: "https://sepolia.basescan.org/address/0x1Cb491B7EE9b21478CD41A2CF25937e7262B1a76#code",
  },
  {
    name: "Z0tzPrivateLedgerVault",
    description: "Holds the FHERC20 wrap · shield / unshield entry point",
    eth: "https://sepolia.etherscan.io/address/0x581009dfa2a80e2782920D54F36c81C32d5AcCA2#code",
    arb: "https://sepolia.arbiscan.io/address/0xbBCb656683fea9691BcC267cb98abB6e1E4ccB5B#code",
    base: "https://sepolia.basescan.org/address/0x8cB140197eA7C2B7Ba0825a6280dea85D488ee0a#code",
  },
  {
    name: "Z0tzPrivateSweeperV2 · V6.5.2",
    description: "Multi-sweep sweepNonceV2 · 1% fee · one mint/burn point for the ledger",
    eth: "https://sepolia.etherscan.io/address/0x9A5bFF0bc65f4c187b21a5106ff510246c2FC8D2#code",
    arb: "https://sepolia.arbiscan.io/address/0x8CdE363DEF2a26f9cc2fBb5bE47C019973c89b45#code",
    base: "https://sepolia.basescan.org/address/0xA6692aBcCAC67DB64f7c93AA47fc9516DE7f5fcb#code",
  },
  {
    name: "FHERC20WrappedERC20 (USDC wrap)",
    description: "Fhenix official encrypted ERC-20 wrap · shielded USDC lives here",
    eth: "https://sepolia.etherscan.io/address/0xb2ffb39815B73c1384466a2C61D75da0F819130C#code",
    arb: "https://sepolia.arbiscan.io/address/0x61AD2081D24BfEB86434FB71FeC52c191c7A33d5#code",
    base: "https://sepolia.basescan.org/address/0xc74F97F70A0F9CB29143443e85843bfd22eB1613#code",
  },
  {
    name: "Z0tzPaymaster",
    description: "Sponsors smart-account deploys and chain transitions",
    eth: "https://sepolia.etherscan.io/address/0xeBBb05403B96279a269F26C5F7BFa6BCf39d4cF7#code",
    arb: "https://sepolia.arbiscan.io/address/0x2cb622CfcC23E7CC453DD806b9A47FE2416BA2CF#code",
    base: "https://sepolia.basescan.org/address/0x79a7e7c6bdF5DEC837de87d3043F92381Eb9aE22#code",
  },
  {
    name: "Z0tzAccountFactory",
    description: "CREATE2 · P-256 passkey owner · RIP-7212 on-chain verify",
    eth: "https://sepolia.etherscan.io/address/0x5Fa5dB190ec8978472CD1357de905F961f0518bC#code",
    arb: "https://sepolia.arbiscan.io/address/0x5D40769712F945831e6E338b5e3C628A926520Ae#code",
    base: "https://sepolia.basescan.org/address/0xbD998e232226158B194644B0b72B94C0F0C80C86#code",
  },
  {
    name: "Circle USDC (underlying)",
    description: "Canonical Circle testnet USDC — the permissionless rail the vault wraps",
    eth: "https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    arb: "https://sepolia.arbiscan.io/address/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    base: "https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    name: "CCTP V2 TokenMessenger",
    description: "Circle's permissionless burn/mint bridge — same address on all three chains",
    eth: "https://sepolia.etherscan.io/address/0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    arb: "https://sepolia.arbiscan.io/address/0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    base: "https://sepolia.basescan.org/address/0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  {
    name: "P-256 verifier",
    description: "RIP-7212 native precompile at 0x100 · passkey signatures on chain",
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
          V6.5.2 contracts
        </h2>

        {/* Summary — V6.5 focused */}
        <div className="max-w-3xl mx-auto mb-12">
          <p className="text-center text-muted-foreground text-base md:text-lg mb-8">
            Three primitives do the work in V6.5: a <span className="text-foreground">vault</span> that
            holds the encrypted wrap, a <span className="text-foreground">ledger</span> that maps
            pseudonymous IDs to ciphertext handles, and a <span className="text-foreground">sweeper</span> that
            is the single gate in and out. The rest is plumbing.
          </p>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">3</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Core contracts</div>
            </div>
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">∞</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Sweeps per stealth (V6.5.2)</div>
            </div>
            <div className="border border-foreground/30 p-6">
              <div className="text-4xl font-bold text-foreground">1%</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">Sweeper fee · that&apos;s it</div>
            </div>
          </div>
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
