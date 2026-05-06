"use client"

import { Expandable } from "./expandable"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

/**
 * V6.5.2 verified contract addresses. Ledger / Vault / Sweeper form the three
 * primitives introduced in V6.5 — the older one-shot sweeper and wrapper are
 * still listed for reference but the active flow only touches these three.
 * Source-of-truth: contracts/deployments/fullstack-{chainId}.json (2026-05-01).
 */
const contracts = [
  {
    name: "Z0tzPrivateLedger",
    description: "Pseudonymous IDs · spend · rotate · cashout actions",
    eth: "https://sepolia.etherscan.io/address/0x60570F2DeA11A09B5c6411A8f48017F50eFc4D6C#code",
    arb: "https://sepolia.arbiscan.io/address/0x1b45Da2D95ad8180D60616b668F44AC8dc457504#code",
    base: "https://sepolia.basescan.org/address/0xD912e777811238F14106F4Fb161230Bb182dAF4e#code",
  },
  {
    name: "Z0tzPrivateLedgerVault",
    description: "Holds the FHERC20 wrap · shield / unshield entry point",
    eth: "https://sepolia.etherscan.io/address/0x763BC9f2F6520E92B4D56622F55F370D3bF1bF3F#code",
    arb: "https://sepolia.arbiscan.io/address/0x2B147275C63aFDF8583A4bce53c49100fE171CAC#code",
    base: "https://sepolia.basescan.org/address/0x308fbdc8aaD5e5Ee470Adb1A89072a31CbDa3829#code",
  },
  {
    name: "Z0tzPrivateSweeperV2 · V6.5.2",
    description: "Multi-sweep sweepNonceV2 · 1% fee · one mint/burn point for the ledger",
    eth: "https://sepolia.etherscan.io/address/0x9BA45877b983a0c704dA37b50cd5e746e66E5F66#code",
    arb: "https://sepolia.arbiscan.io/address/0x0fb0CC4eedfA2f93729cD16Cd2F553A617e56D5A#code",
    base: "https://sepolia.basescan.org/address/0xF1368C62986F1681aEb370E796cdcf8f18635E8c#code",
  },
  {
    name: "FHERC20WrappedERC20 (USDC wrap)",
    description: "Fhenix official encrypted ERC-20 wrap · shielded USDC lives here",
    eth: "https://sepolia.etherscan.io/address/0x9aBE44788694C114DA14abb4765F0B76b162DD6F#code",
    arb: "https://sepolia.arbiscan.io/address/0xF336F0C79A462051d07aD7e795Cc83e9e5E5eB61#code",
    base: "https://sepolia.basescan.org/address/0x9958E68b93a40035Cfc82d801818B8269282e191#code",
  },
  {
    name: "Z0tzPaymaster",
    description: "Sponsors smart-account deploys and chain transitions",
    eth: "https://sepolia.etherscan.io/address/0x4bcb7C436A479909E32Cb699B4901246ECffD064#code",
    arb: "https://sepolia.arbiscan.io/address/0xA0aC4aBa7CD26f72C9D4b3979Fe8555e95E3667A#code",
    base: "https://sepolia.basescan.org/address/0x06251350e80b13B460e7A8e7AAaceEc960c71179#code",
  },
  {
    name: "Z0tzAccountFactory",
    description: "CREATE2 · P-256 passkey owner · RIP-7212 on-chain verify",
    eth: "https://sepolia.etherscan.io/address/0x68f673159Ca6791Fd90a9abc183dcf85caD5B431#code",
    arb: "https://sepolia.arbiscan.io/address/0xeb571Fb31DcB7713bf83CdcF137003c852089eE8#code",
    base: "https://sepolia.basescan.org/address/0xe67471E72647E6088791a0f752628D910Dc4D94b#code",
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

/**
 * Wave 3 — Tezcatli composition: confidential DeFi vaults plus the
 * `Z0tzComplianceGate` (KYC registry + OFAC oracle + depositor registry).
 * Source-of-truth: contracts/deployments/fullstack-{chainId}.json + defi-vaults.json.
 *
 * The Aave V3 strategy adapter is only deployed on arb-sepolia (Aave V3 is not
 * present on the other two testnets); base + eth show the vault skeleton with
 * the strategy slot empty.
 */
const tezcatliContracts = [
  {
    name: "Z0tzComplianceGate",
    description: "FHEIP-0010 predicate · canShield / canUnshield with typed reason codes",
    eth: "https://sepolia.etherscan.io/address/0x8575E390aA8052d32A3208199B2b0f494c943420#code",
    arb: "https://sepolia.arbiscan.io/address/0xe08942c436874411161Fe76E628C91Daf9e2dcd6#code",
    base: "https://sepolia.basescan.org/address/0x850ab4D863ab20c6F5494D337F08887DC9148013#code",
  },
  {
    name: "KYC Registry",
    description: "Yes/no oracle with optional expiry — no PII, no documents on chain",
    eth: "https://sepolia.etherscan.io/address/0x544C8a38b7Ef4fbc5a88D24ea6F798B9dc5A139C#code",
    arb: "https://sepolia.arbiscan.io/address/0xBb7948e571996EBA66f949059dA7ad91868CD0aa#code",
    base: "https://sepolia.basescan.org/address/0xf93CF605Ec9cCFC42e08DCD9598B606feF754873#code",
  },
  {
    name: "OFAC Sanctions Oracle",
    description: "Block-list consulted before the gate's own deny-list",
    eth: "https://sepolia.etherscan.io/address/0x7Bb1370bf477B3FbB15Fa0C69410459991F09f98#code",
    arb: "https://sepolia.arbiscan.io/address/0x27c2209950de1bef0e33C0509542700bB63F74d6#code",
    base: "https://sepolia.basescan.org/address/0x2D3D962e69C38D36729294A55933AFcC108a2d26#code",
  },
  {
    name: "Z0tzDepositorRegistry",
    description: "Append-only audit trail · every screened depositor · used by canUnshield",
    eth: "https://sepolia.etherscan.io/address/0x0596de86a8E9CEFe45b62d6a3610a55eC5f29023#code",
    arb: "https://sepolia.arbiscan.io/address/0xDEB54DB41b77143B3Eb96e12c38411D42DBa6B46#code",
    base: "https://sepolia.basescan.org/address/0xaDdF6aA9df9B99b013a35E44eABD6240ceDC4ba5#code",
  },
  {
    name: "TezcatliConfidentialVault",
    description: "Active vault · share/asset accounting on euint64 handles",
    eth: "https://sepolia.etherscan.io/address/0xA90957B6D8475c09906Cd91735995D222ea78F40#code",
    arb: "https://sepolia.arbiscan.io/address/0x90638B32b20e7BeDdb5AEFD745bF7a86b78a5A78#code",
    base: "https://sepolia.basescan.org/address/0x1Bc118f117dC7D75603ab4CD11B6904Be0df4623#code",
  },
  {
    name: "TezcatliConfidentialVaultFactory",
    description: "Deploys vault instances per asset · registered vaults read from here",
    eth: "https://sepolia.etherscan.io/address/0x4eA32dEb7EB710981C14eb71ff2afCCbC0849FfE#code",
    arb: "https://sepolia.arbiscan.io/address/0xf93CF605Ec9cCFC42e08DCD9598B606feF754873#code",
    base: "https://sepolia.basescan.org/address/0xA9d7BCd5651Ca187D631409812841498e8971b63#code",
  },
  {
    name: "tzcUSDC (TezcatliWrappedToken)",
    description: "FHERC-20 wrapper around USDC · the vault accepts ciphertext deposits via this boundary",
    eth: "https://sepolia.etherscan.io/address/0xa6f051D55Af5AF7F39643064A41ACEC355Aa9A71#code",
    arb: "https://sepolia.arbiscan.io/address/0x14655ba23f11FAaBd310703CAc387a69429cb7C8#code",
    base: "https://sepolia.basescan.org/address/0xeb571Fb31DcB7713bf83CdcF137003c852089eE8#code",
  },
  {
    name: "TezcatliStrategyRiskPolicy",
    description: "Caps maxAllocationBps per strategy · enforced on every deploy call",
    eth: "https://sepolia.etherscan.io/address/0x1b697D1950961d03ed09Bb9D5199a69923F7Ae6C#code",
    arb: "https://sepolia.arbiscan.io/address/0x2D3D962e69C38D36729294A55933AFcC108a2d26#code",
    base: "https://sepolia.basescan.org/address/0xC86B11268A9e617d3Fc17FcE2150ce17132285cc#code",
  },
  {
    name: "TezcatliStrategyAdapterAaveV3",
    description: "Active on arb-sepolia only · pulls idle USDC into Aave V3 aTokens",
    eth: null,
    arb: "https://sepolia.arbiscan.io/address/0xfE573D24eca408B9c5fCf066f66BB57081777A55#code",
    base: null,
  },
]

interface ContractRow {
  name: string
  description: string
  eth: string | null
  arb: string | null
  base: string | null
}

function ContractTable({ rows }: { rows: ContractRow[] }) {
  return (
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
          {rows.map((c) => (
            <tr
              key={c.name}
              className="border-b border-foreground/20 transition-colors hover:bg-foreground/5"
            >
              <td className="p-3 font-medium text-foreground">{c.name}</td>
              <td className="p-3 text-muted-foreground hidden md:table-cell">
                {c.description}
              </td>
              {(["eth", "arb", "base"] as const).map((chain) => (
                <td key={chain} className="p-3 text-center">
                  {c[chain] ? (
                    <a
                      href={c[chain] as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      view
                    </a>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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
          title="V6.5 core contracts"
          summary="Ledger, vault, sweeper, paymaster, account factory, FHERC-20 wrapper, USDC, CCTP, P-256 verifier — across Eth / Arb / Base Sepolia."
          moreLabel="see the V6.5 address list"
          lessLabel="hide the V6.5 address list"
        >
          <ContractTable rows={contracts} />

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

        {/* Tezcatli composition (Wave 3) — compliance + DeFi */}
        <div className="mt-6">
          <Expandable
            title="Tezcatli composition (Wave 3)"
            summary="Confidential DeFi vaults plus the on-chain compliance gate (KYC registry + OFAC oracle + depositor registry). Aave V3 strategy live on Arb Sepolia."
            moreLabel="see the Tezcatli address list"
            lessLabel="hide the Tezcatli address list"
          >
            <ContractTable rows={tezcatliContracts} />

            <p className="text-center text-muted-foreground text-sm mt-6">
              Compliance gate is consulted at every shield / unshield via{" "}
              <span className="text-foreground">eth_call</span> before any gas burns. Default-permissive
              on testnet (<span className="text-foreground">enabled = false</span>); production flips to
              enforced KYC + OFAC with one admin tx. Aave V3 adapter is only on arb-sepolia — base and
              eth ship the vault skeleton with the strategy slot empty.
            </p>
          </Expandable>
        </div>
      </div>
      </div>
    </section>
  )
}
