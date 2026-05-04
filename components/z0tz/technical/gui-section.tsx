"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function GuiSection() {
  return (
    <SectionShell
      id="gui"
      eyebrow="Desktop wallet"
      title="GUI"
      intro="An Electron app on top of React and viem. The renderer never holds private keys or RPC credentials — every privileged action goes through a small IPC surface in the main process, where the same CLI helpers do the actual work."
    >
      <SubBlock heading="Process model">
        <p>
          The main process owns the passkey, the relayer URL, and every
          contract-write path. The renderer renders pages and dispatches
          requests over IPC. Two processes; one trust boundary.
        </p>
        <p>
          The preload script exposes a typed bridge — every IPC channel is
          declared in <span className="text-foreground font-mono">src/preload/index.ts</span> and
          handled in{" "}
          <span className="text-foreground font-mono">src/main/ipc-handlers.ts</span>. There is no
          wide-open Node access from the renderer.
        </p>
      </SubBlock>

      <SubBlock heading="Pages">
        <KeyValueGrid
          rows={[
            { label: "Dashboard",          value: "Per-chain encrypted balances, plus a DeFi summary card aggregating live positions. Reads everything from chain on mount." },
            { label: "Cash In / Cash Out", value: "Same-chain or cross-chain (CCTP V2) inbound and outbound transfers between public USDC and your encrypted ledger." },
            { label: "Bridge",             value: "Self-ledger transfers — ledger A → ledger B, both controlled by your passkey, optionally on a different chain." },
            { label: "DeFi",               value: "Lists every active Tezcatli vault position. Withdrawable, deposited, yield, APY. Origin badge on each position. Auto-routes home on withdraw." },
            { label: "Permanent Stealths", value: "Cash-in HKDF inboxes plus permanent CREATE2 smart and EOA addresses for receivers that can&apos;t handle ephemeral targets." },
            { label: "History",            value: "Reconstructs the five canonical flows from chain logs. Nothing persisted locally; rescan is idempotent." },
            { label: "Settings",           value: "Relayer URL override, RPC overrides per chain, recovery export / import." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="No-cache architecture">
        <p>
          The DeFi page reads four numbers per position directly from chain on
          every render: <span className="text-foreground font-mono">principalDepositedOf</span>,
          {" "}<span className="text-foreground font-mono">netPositionSnapshotOf</span>,
          {" "}<span className="text-foreground font-mono">pendingYieldSnapshotOf</span>, and the
          live Aave V3 supply APY. There is no cost-basis cache, no per-position
          state map, no SQLite of historical events. If chain says it,
          renderer shows it.
        </p>
        <p>
          Withdrawable is displayed as <span className="text-foreground">min(net + APY × elapsed, aTokenBalance + wrapperReserve)</span>{" "}
          — capped by what the strategy can actually return without a redeem.
          The cap matters because the live extrapolation drifts ahead of what
          the chain would actually pay out; the displayed number is what you
          could pull <em>right now</em>.
        </p>
        <p>
          Closed positions (zero shares, zero principal) filter out at the
          scanner so the active list stays clean. There&apos;s no separate
          archive; if the user wants history they go to the History page,
          which rebuilds it from logs.
        </p>
      </SubBlock>

      <SubBlock heading="Auto-lock and key handling">
        <KeyValueGrid
          rows={[
            { label: "Auto-lock",     value: "5 minutes idle. Re-unlock requires a passkey gesture, which re-derives every HKDF identity in main-process memory and never touches disk." },
            { label: "Passkey storage", value: "Encrypted at rest with a key wrapped by the OS keychain (libsecret on Linux, Keychain on macOS, DPAPI on Windows)." },
            { label: "Relayer auth",  value: "Every relayer request is signed with the passkey. The relayer verifies the P-256 signature against the on-chain account&apos;s public point before processing." },
            { label: "Recovery",      value: "Export to ZIP, QR, or steganographic PNG. The PNG path embeds the encrypted blob in the LSBs of an ordinary-looking image so the recovery file isn&apos;t obviously a recovery file." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="Distribution">
        <p>
          AppImage and{" "}
          <span className="text-foreground font-mono">.deb</span> on Linux, dmg
          on macOS, NSIS installer on Windows. Built by{" "}
          <span className="text-foreground font-mono">electron-builder</span>{" "}
          out of the same tree the dev workflow uses; no separate &ldquo;release
          build&rdquo; codepath, so what you see in{" "}
          <span className="text-foreground font-mono">npm run dev</span> is what
          ships.
        </p>
      </SubBlock>
    </SectionShell>
  )
}
