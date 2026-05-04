"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function CliSection() {
  return (
    <SectionShell
      id="cli"
      eyebrow="Reference implementation"
      title="CLI"
      intro="The CLI is where every flow gets implemented first. The GUI calls into the same code through Electron IPC; the relayer endpoints share the same gas, bundler, and stealth helpers. If a feature works in the CLI, the GUI is a wiring exercise."
    >
      <SubBlock heading="Why a CLI exists at all">
        <p>
          The CLI is the wallet&apos;s testbed. End-to-end runs of every canonical
          flow live as one-shot scripts: shield, unshield, internal-transfer,
          bridge, defi roundtrip, defi xroundtrip. Each one is a deterministic
          script that exercises the same code paths the GUI does — sign with
          passkey, derive identities, build UserOps, call the bundler, watch
          for receipts.
        </p>
        <p>
          When a behavior changes in the contracts or in CoFHE, the first
          place it gets verified is one of those scripts. Tests in the GUI run
          slower because they touch the renderer; the CLI exercises the same
          surface area in seconds.
        </p>
      </SubBlock>

      <SubBlock heading="What the CLI ships">
        <KeyValueGrid
          rows={[
            { label: "Identity",    value: "Passkey creation, P-256 signing, HKDF derivation for ledger and stealth identities. Recovery export and import (ZIP / QR / steganographic PNG)." },
            { label: "Ledger",      value: "Cash-in (sweep public USDC into the encrypted ledger), cash-out (debit ledger and pay public USDC), reveal (decrypt your own balance through a signed view permit)." },
            { label: "Bridge",      value: "Cross-chain CCTP V2 with both ends ephemeral. Wraps Circle&apos;s burn / attestation / mint with the same passkey-bound signing surface as everything else." },
            { label: "DeFi",        value: "defi vaults (registry listing), defi roundtrip (same-chain deposit + withdraw), defi xroundtrip (cross-chain), defi list (active positions), defi status (live snapshot)." },
            { label: "Bundler",     value: "ERC-4337 UserOp construction, gas estimation, paymaster wiring, fund-stealth pre-flights, post-confirmation polling for RPC fallback lag." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="Module layout">
        <KeyValueGrid
          rows={[
            { label: "core/",     value: "Crypto, gas budgets, bundler, paymaster, defi, defi-flow, bridge. The reusable pieces every flow shares." },
            { label: "ledger/",   value: "HKDF identity derivation. deriveDefiStealth(originChainId, vaultChainId, vaultAddress, index) is what makes origin-aware DeFi withdraws possible." },
            { label: "passkey/",  value: "P-256 sign/verify, encrypted-at-rest passkey storage, recovery flows. The passkey never leaves this module." },
            { label: "scripts/",  value: "End-to-end tests. run-full-gas-test.ts, defi-roundtrip.ts, defi-xroundtrip.ts, bridge-burn-mint.ts. These are how the wallet gets validated end-to-end." },
            { label: "config/",   value: "Per-chain RPC, contract addresses, paymaster, vault registry. Sourced from contracts/deployments/*.json so addresses can&apos;t drift between CLI, GUI, and relayer." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="A representative DeFi roundtrip">
        <p>
          Running <span className="text-foreground font-mono">npx tsx scripts/defi-roundtrip.ts</span> on
          Arbitrum Sepolia does the following: pick the smallest sufficient
          ledger entry (smart-fit, so you don&apos;t waste a 50 USDC slot on a
          3 USDC deposit), derive a fresh DeFi stealth at index{" "}
          <span className="text-foreground font-mono">(highestUsed + 1)</span>,
          ask the relayer to top that stealth up with native gas, debit the
          ledger to the stealth address, ask the compliance gate{" "}
          <span className="text-foreground font-mono">canShield</span>, deposit
          into the Tezcatli vault, trigger{" "}
          <span className="text-foreground font-mono">/api/strategy-deploy</span>{" "}
          so the idle USDC gets routed into Aave, then for the withdraw side
          run the inverse. The whole roundtrip takes under a minute on
          testnet RPCs.
        </p>
      </SubBlock>
    </SectionShell>
  )
}
