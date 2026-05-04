"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function GeneralSection() {
  return (
    <SectionShell
      id="general"
      eyebrow="The stack"
      title="General architecture"
      intro="Z0tz is a wallet stack — passkey for identity, ERC-4337 for execution, FHE-encrypted ledger for storage of value, and a relayer that sponsors gas. Every visible transaction goes through a one-time ephemeral address; balances live encrypted under Fhenix CoFHE inside a single ledger contract per chain."
    >
      <SubBlock heading="The four moving pieces">
        <p>
          A user has one passkey (P-256). From it the wallet derives every
          long-lived secret it needs: the ERC-4337 account&apos;s signing key,
          the HKDF identity used to address ledger entries, and the per-flow
          stealth keys the relayer hands money to.
        </p>
        <p>
          A user has one ledger entry per chain — a single confidential
          balance handle living inside <span className="text-foreground font-mono">Z0tzPrivateLedger</span>.
          The ledger never lists who owns what; it only knows that ledger ID{" "}
          <span className="text-foreground font-mono">k</span> currently holds
          some FHE-encrypted amount of FHERC-20-wrapped USDC.
        </p>
        <p>
          A relayer pays gas, runs the ERC-4337 bundler, and coordinates the
          one-shot stealth addresses CCTP and the vaults route through. It has
          no custody — the keys it controls only exist long enough to forward a
          single inbound transfer.
        </p>
        <p>
          A compliance gate sits between every shielded movement and the
          underlying token contracts. The wallet always asks &ldquo;is this
          allowed?&rdquo; before it pays gas; the gate answers yes or no. See
          the Tezcatli compliance section below.
        </p>
      </SubBlock>

      <SubBlock heading="Three chains, one wallet">
        <KeyValueGrid
          rows={[
            { label: "Base Sepolia",     value: "Cash-in / cash-out, ledger, sweepers, paymaster, vault factory." },
            { label: "Ethereum Sepolia", value: "Same primitives. Used as the L1 reference deployment for cross-chain testing." },
            { label: "Arbitrum Sepolia", value: "Same primitives, plus the active Tezcatli vault wired to Aave V3 USDC." },
            { label: "Cross-chain rail", value: "Circle CCTP V2 for USDC. Both ends of every bridge are ephemeral; the wallet never speaks to the bridge from a long-lived address." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="What FHE does, exactly">
        <p>
          Balances are <span className="text-foreground font-mono">euint64</span> ciphertext
          handles inside the ledger. The chain stores a handle pointer; the
          actual ciphertext lives with Fhenix&apos;s threshold network coprocessor.
          Operations like <em>add</em>, <em>subtract</em>, and{" "}
          <em>compare-then-select</em> happen on those handles without revealing
          the value. Decryption is gated by signed permits the user issues from
          their passkey.
        </p>
        <p>
          The wallet uses <span className="text-foreground font-mono">FHESafeMath.tryIncrease</span>{" "}
          and <span className="text-foreground font-mono">tryDecrease</span> for solvency-checked
          updates — preserve-on-failure semantics, so an over-spend leaves the
          balance unchanged and the operation simply doesn&apos;t debit. This is
          how the ledger enforces &ldquo;you can&apos;t spend what you don&apos;t
          have&rdquo; without ever decrypting a balance to compare.
        </p>
      </SubBlock>

      <SubBlock heading="ERC-4337 surface">
        <KeyValueGrid
          rows={[
            { label: "Z0tzAccount",    value: "Each user gets a UUPS account proxy keyed to their passkey public point. Verifies P-256 signatures in validateUserOp; no externally-owned key." },
            { label: "Z0tzPaymaster",  value: "Sponsors gas in USDC. Charges a transfer-size fee, not a gas-cost fee — by design, so flow size doesn&apos;t leak through fee variance." },
            { label: "RecoveryModule", value: "Guardian-set recovery with epoch-bound signatures. Lets a user re-pair a fresh passkey to the same account if the device that holds the old key is lost." },
            { label: "Bundler",        value: "Off-the-shelf. Z0tz operates a private bundler under the relayer; users never pay native ETH." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="The five canonical flows">
        <p>
          Everything the wallet does fits into one of five shapes:{" "}
          <span className="text-foreground">cash-in</span> (public USDC →
          encrypted ledger),{" "}
          <span className="text-foreground">cash-out</span> (encrypted ledger →
          public USDC),{" "}
          <span className="text-foreground">bridge</span> (cross-chain over
          CCTP, both ends ephemeral),{" "}
          <span className="text-foreground">internal transfer</span>{" "}
          (ledger A → ledger B between two of your own ledger IDs), and{" "}
          <span className="text-foreground">DeFi roundtrip</span> (ledger →
          confidential vault → ledger). The history page rebuilds these from
          chain logs; the wallet itself stores nothing locally.
        </p>
      </SubBlock>
    </SectionShell>
  )
}
