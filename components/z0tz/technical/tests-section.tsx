"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function TestsSection() {
  return (
    <SectionShell
      id="tests"
      eyebrow="What&apos;s been validated"
      title="Test coverage"
      intro="Z0tz is a testnet proof of concept on Base, Ethereum, and Arbitrum Sepolia. The numbers below are the testing surface that has actually run end-to-end on those chains; nothing here is a plan."
    >
      <SubBlock heading="Contract unit tests">
        <KeyValueGrid
          rows={[
            { label: "Compliance gate",        value: "32 unit tests covering the canShield / canUnshield predicate, the depositor registry append-only invariant, the KYC registry yes/no surface, the two-step admin transfer, and every reason code in the FHEIP-0010 table. All passing in mock-mode against a local Hardhat node." },
            { label: "Ledger primitives",      value: "FHESafeMath solvency-checked increase / decrease tests. ERC-4337 account validateUserOp surface against P-256 signatures. RecoveryModule guardian-set epoch-bound signature replay tests." },
            { label: "Sweeper / wrapper",      value: "FHERC-20 wrapper round-trip tests. Sweep-from-public to encrypted-handle including the gate consult on the way in, with both pass and reject paths exercised." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="End-to-end flow scripts">
        <p>
          Each script lives in <span className="text-foreground font-mono">cli/scripts/</span> and
          runs against the live testnet deployments. They are deterministic,
          fully scripted, and exercise the same code paths the GUI does. A
          green run means the wallet can do that flow today.
        </p>
        <KeyValueGrid
          rows={[
            { label: "Cash-in / cash-out",  value: "Public USDC → encrypted ledger → public USDC, on each chain. Validates sweep, gate consult, wrapper FHE encrypt, ledger debit, decrypt-on-exit." },
            { label: "Internal transfer",   value: "Ledger A → ledger B between two of the same passkey&apos;s ledger IDs. Validates HKDF rotation across slots." },
            { label: "Bridge",              value: "Cross-chain CCTP V2 with both ends ephemeral. Validates the burn / attestation / mint pipeline, post-claim balance polling for RPC fallback lag, and the resync of ledger entries on the destination side." },
            { label: "DeFi roundtrip",      value: "Same-chain deposit and withdraw against the Arbitrum vault. Validates the auto-deploy on deposit, the auto-redeem on withdraw, the smart-fit ledger-entry selection, and the no-cache GUI display contract." },
            { label: "DeFi xroundtrip",     value: "Cross-chain DeFi: deposit from Base into the Arbitrum vault and withdraw back to Base. Validates origin-aware HKDF derivation and the auto-route home." },
            { label: "Run-full-gas-test",   value: "End-to-end pass that exercises every flow back-to-back. Used as the canary before raising any gas budget." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="What the latest end-to-end run looked like">
        <p>
          Cross-chain DeFi roundtrip from Base Sepolia into the Arbitrum
          Sepolia vault, full pass: 89.77 seconds. Smart-fit picked alice@4
          (16.85 USDC) for a 3.5 USDC deposit; CCTP burn + mint completed;
          vault deposited; auto strategy-deploy moved the funds into Aave.
          Resulting display: principal 4.099467 USDC, withdrawable
          ≈ 4.099517 USDC, yield +0.000050 USDC, APY 4.36%. Numbers come
          straight from chain — no local cache, no cost-basis fudge.
        </p>
      </SubBlock>

      <SubBlock heading="Out of scope — and what&apos;s next">
        <KeyValueGrid
          rows={[
            { label: "Pre-existing Z0tz contracts", value: "Z0tzAccount, Z0tzPaymaster, RecoveryModule, Z0tzPrivateLedger, Z0tzPrivateSweeperV2 — covered by their own unit suites; security audit is queued for after the contract surface stops moving." },
            { label: "Tezcatli vault audit",        value: "Pre-deploy audit pass running on the compliance + Tezcatli bundle (9 Solidity files) at MEDIUM-and-above severity floor. Findings written to /audits before any GitHub issues get filed." },
            { label: "Mainnet",                     value: "Not deployed. Z0tz runs only on Base, Ethereum, and Arbitrum Sepolia. The audit gate is in front of any mainnet deploy; no shortcuts." },
          ]}
        />
      </SubBlock>
    </SectionShell>
  )
}
