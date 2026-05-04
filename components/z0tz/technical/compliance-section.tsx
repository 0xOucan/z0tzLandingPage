"use client"

import { SectionShell, SubBlock, KeyValueGrid } from "./section-shell"

export function ComplianceSection() {
  return (
    <SectionShell
      id="compliance"
      eyebrow="OFAC / AML / KYC"
      title="Tezcatli compliance"
      intro="Z0tz refuses to lend its confidentiality to bad actors. The compliance gate is a contract that vaults, sweepers, and bridges consult before integrating funds. It answers yes or no with a typed reason code — never holds tokens, never has admin authority over funds, never auto-returns or freezes."
    >
      <SubBlock heading="The three primitives">
        <KeyValueGrid
          rows={[
            { label: "Compliance gate", value: "Z0tzComplianceGate. Pure predicate. Exposes canShield(token, depositor, amount) and canUnshield(token, beneficiary, amount). Reverts with a typed reason code (0..7 per FHEIP-0010) if the call would be denied. Default-permissive: an empty deny-list lets everyone through, and the enabled flag defaults to false during bring-up." },
            { label: "KYC registry",    value: "MockZ0tzKycRegistry. A yes/no oracle. Stores only a verification status and an optional expiry per address. No documents, no PII, no biometrics. Off by default — opt-in per integration. Real KYC vendors (Sumsub, Persona, Chainalysis KYT) feed this through a permissioned writer role." },
            { label: "Depositor registry", value: "Z0tzDepositorRegistry. Append-only. Records the on-chain depositor address each time funds enter the shielded boundary. Used by canUnshield to make sure the beneficiary on the way out isn&apos;t a sanctioned counterparty." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="What the gate refuses, and what it does next">
        <p>
          The gate refuses encryption / wrap of flagged USDC at the sweep
          boundary. It refuses DeFi composition and bridges that originate
          from flagged depositors. It refuses to sponsor gas for any operation
          a check denies. When a check rejects, the user sees a typed reason
          (sanctioned origin, KYC required, KYC expired, ...) before any gas
          burns — the wallet does the consult <em>before</em> building the
          UserOp.
        </p>
        <p>
          The gate never holds or freezes flagged funds. There is no admin who
          can release seized assets. There is no compliance custody vault.
          When a sanctioned attempt is rejected, nothing moves; the funds stay
          at the user&apos;s wallet keys, and the wallet shows the reason.
          Optional opt-in: the paymaster can fund a refund of non-OFAC
          rejections back to the depositor.
        </p>
      </SubBlock>

      <SubBlock heading="Default posture">
        <KeyValueGrid
          rows={[
            { label: "AML deny-list", value: "On by default. Empty deny-list ⇒ everyone allowed. Operators add OFAC-listed addresses through a two-step admin flow (Ownable2Step style)." },
            { label: "Geofencing",    value: "On by default at the relayer HTTP layer. Restricted regions return 403 before anything reaches chain. Country list mirrors the published OFAC sanctions set." },
            { label: "KYC",           value: "Off by default. Integrators (dApps, institutions) flip it on for their own users when their flow needs it. Z0tz the wallet never demands KYC from end users." },
          ]}
        />
      </SubBlock>

      <SubBlock heading="Where it sits in the flow">
        <p>
          On deposit: the wallet calls{" "}
          <span className="text-foreground font-mono">canShield(USDC, depositor, amount)</span>{" "}
          before submitting the UserOp. If it reverts, the wallet shows the
          reason and never burns gas. If it passes, the depositor address gets
          appended to the depositor registry, and the FHERC-20 wrap proceeds.
        </p>
        <p>
          On withdraw: <span className="text-foreground font-mono">canUnshield(USDC, beneficiary, amount)</span>{" "}
          runs the inverse — checks that the destination isn&apos;t sanctioned,
          checks that the path of depositors backing this position is clean,
          and only then unshields. Because both the deposit and the withdraw
          consult the gate, a position can&apos;t be opened by a sanctioned
          address and laundered through a clean withdraw, and a clean position
          can&apos;t be exited to a sanctioned address.
        </p>
      </SubBlock>

      <SubBlock heading="Specs">
        <KeyValueGrid
          rows={[
            { label: "FHEIP-0010", value: "Confidential vault compliance gate. Defines the canShield / canUnshield predicate surface, the reason code table, the depositor registry contract, and the integration boundaries vaults must respect." },
            { label: "FHEIP-0011", value: "Confidential vault position snapshots. Defines principalDepositedOf, netPositionSnapshotOf, pendingYieldSnapshotOf — the read surface the GUI&apos;s no-cache rendering relies on." },
            { label: "FHEIP-0012", value: "Compliance-aware cash-in / cash-out. Spec for how the gate is consulted at the wallet boundary (not just at the vault boundary), so flagged USDC never enters the encrypted ledger in the first place." },
          ]}
        />
      </SubBlock>
    </SectionShell>
  )
}
