"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function VaultsSection() {
  return (
    <SectionShell
      id="vaults"
      eyebrow="Confidential DeFi"
      title="Tezcatli DeFi vaults"
      intro="The vaults Z0tz routes DeFi through are Tezcatli&apos;s confidential vault primitive — share / asset accounting on FHE-encrypted handles, with a strategy adapter slot for the underlying yield source. Currently wired to Aave V3 USDC on Arbitrum Sepolia. Z0tz&apos;s contribution is the wallet, the stealth routing, the bridge, and the compliance integration; the vault does what it does best."
    >
      <SubBlock heading="Contract surface">
        <KeyValueGrid
          rows={[
            { label: "TezcatliConfidentialVault",        value: "ERC-4626-shaped vault on FHE handles. Tracks user shares as euint64. Calls the compliance gate at deposit (canShield) and withdraw (canUnshield) before moving any value. Period-based fee model." },
            { label: "TezcatliConfidentialVaultFactory", value: "Deploys vault instances per-asset. The factory lives at the registry the wallet reads from on launch — every vault visible in the GUI was registered here." },
            { label: "TezcatliStrategyAdapterAaveV3",    value: "The strategy slot the active vault uses. Pulls idle USDC into Aave V3 aTokens; redeems back to the wrapper&apos;s reserve when withdraws need plaintext liquidity." },
            { label: "TezcatliStrategyRiskPolicy",       value: "Caps maxAllocationBps per strategy so a single adapter can&apos;t swallow the whole vault. Enforced on every deploy call." },
            { label: "TezcatliWrappedToken",             value: "The FHERC-20 wrapper around the underlying ERC-20. The vault accepts ciphertext deposits because the wrapper handles the encrypt-on-the-way-in / decrypt-on-the-way-out boundary." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="Stealth routing — the path money takes">
        <p>
          When the user opens a position the wallet derives a fresh DeFi
          stealth from{" "}
          <span className="text-foreground font-mono">(passkey, originChainId, vaultChainId, vaultAddress, index)</span>.
          The salt packs both chain IDs so the same passkey on two different
          chains derives different keys, and so a position originated from
          Base survives in the wallet&apos;s view as &ldquo;a vault on Arbitrum
          deposited from Base,&rdquo; not as &ldquo;a vault on Arbitrum&rdquo;.
        </p>
        <p>
          The relayer tops the stealth with native gas, the ledger debits to
          it, and the stealth deposits into the vault. The stealth dies after
          one use; future operations on this position derive the next index.
          The vault sees one ephemeral depositor per deposit; it never learns
          the user&apos;s wallet address, and never sees two of the user&apos;s
          deposits as related to each other.
        </p>
      </SubBlock>

      <SubBlock heading="Auto-deploy and auto-redeem">
        <KeyValueGrid
          rows={[
            { label: "On deposit",  value: "After the vault deposit confirms, the wallet calls /api/strategy-deploy. The relayer signs coordinatorDeployToStrategy(adapter, idle, minSharesOut) so the freshly-arrived USDC lands in Aave instead of sitting idle. Idempotent — skips when idle is already below threshold." },
            { label: "On withdraw", value: "Before the vault withdraw, the wallet calls /api/strategy-redeem. The relayer pulls aTokens back into the wrapper&apos;s plaintext reserve, sized from usdc.balanceOf(tzcUSDC) so the redeem covers the user&apos;s exit without redeeming more than necessary. Then the unshield runs against a non-empty idle bucket." },
            { label: "Why coordinator-driven", value: "The user&apos;s ephemeral stealth has no role in the strategy — it&apos;s a one-shot depositor. The relayer is the only party that persists across deposits, so it&apos;s the right place to maintain the vault&apos;s strategy invariants." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="Origin-aware withdraw">
        <p>
          Each open position carries its origin chain in the HKDF salt, so
          when the user clicks Withdraw the wallet knows where the funds came
          from and where they should go back to. A position deposited from
          Base into the Arbitrum vault withdraws to Base by default —
          ledger A → vault on chain B → ephemeral on chain B → CCTP burn → ephemeral on chain A → ledger A.
        </p>
        <p>
          The user can override the destination chain in the modal, but the
          default is &ldquo;put it back where it came from&rdquo; because that
          matches the user&apos;s mental model and minimizes the number of
          ledger entries that hold value at the end of the round trip.
        </p>
      </SubBlock>

      <SubBlock heading="What the GUI shows, and why">
        <KeyValueGrid
          rows={[
            { label: "Withdrawable",  value: "min(net + APY × elapsed, aTokenBalance + wrapperReserve). Capped at what the strategy can actually return without a supplemental redeem. The number you can withdraw right now." },
            { label: "Deposited",     value: "principalDepositedOf — the cumulative principal you put in, less any prior partial withdraws. Plaintext truth from chain." },
            { label: "Yield",         value: "Withdrawable − Deposited. Live, but capped by the recoverable line above so it never claims yield the strategy can&apos;t actually pay out." },
            { label: "APY",           value: "Live Aave V3 supply APY for the underlying asset, fetched from the pool data provider on render." },
            { label: "Origin badge",  value: "from <chain> next to each position card. Names the chain the deposit originated from. Drives the auto-route on Withdraw." },
          ]}
        />
      </SubBlock>
    </SectionShell>
  )
}
