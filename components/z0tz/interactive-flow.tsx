"use client"

import { useEffect, useState } from "react"

// ─── Scenarios ─────────────────────────────────────────────────────────────

type NodeKind = "plain" | "stealth" | "ephemeral" | "ledger" | "bridge" | "target" | "vault" | "gate"

interface Node {
  id: string
  label: string
  sub?: string
  x: number
  y: number
  kind: NodeKind
}

interface Edge {
  from: string
  to: string
  label?: string
  curve?: "straight" | "up" | "down"
}

interface Scenario {
  id: string
  title: string
  blurb: string
  nodes: Node[]
  edges: Edge[]
  pathD: string // SVG path for the animated dot traversal
}

// Fixed grid (960×360). All scenarios share coordinates so the animation
// feels like a layered story instead of a jarring re-layout.
const NODES_POOL: Record<string, Node> = {
  ext:     { id: "ext",     label: "Faucet · CEX",   sub: "external",        x: 80,  y: 180, kind: "plain" },
  stealth: { id: "stealth", label: "Stealth EOA",    sub: "cash-in inbox",   x: 260, y: 180, kind: "stealth" },
  ledgerA: { id: "ledgerA", label: "Encrypted ledger", sub: "chain A",       x: 480, y: 180, kind: "ledger" },
  ledgerB: { id: "ledgerB", label: "Encrypted ledger", sub: "chain B",       x: 760, y: 180, kind: "ledger" },
  ephA:    { id: "ephA",    label: "Ephemeral",      sub: "one-shot",        x: 370, y: 180, kind: "ephemeral" },
  ephB:    { id: "ephB",    label: "Ephemeral",      sub: "one-shot",        x: 600, y: 180, kind: "ephemeral" },
  bridgeA: { id: "bridgeA", label: "CCTP",           sub: "V2 burn",         x: 480, y: 180, kind: "bridge" },
  target:  { id: "target",  label: "Target EOA",     sub: "any address",     x: 880, y: 180, kind: "target" },
  vaultA:  { id: "vaultA",  label: "Vault A",        sub: "confidential",    x: 480, y: 180, kind: "vault" },
  vaultB:  { id: "vaultB",  label: "Vault B",        sub: "confidential",    x: 880, y: 180, kind: "vault" },
  ledgerOut: { id: "ledgerOut", label: "Encrypted ledger", sub: "chain A",   x: 750, y: 180, kind: "ledger" },
  gate:    { id: "gate",    label: "AML gate",       sub: "deny-list",       x: 480, y: 180, kind: "gate" },
  hold:    { id: "hold",    label: "Funds stay",     sub: "your EOA, your keys", x: 750, y: 180, kind: "target" },
  extFlag: { id: "extFlag", label: "Flagged sender", sub: "OFAC / sanctioned", x: 210, y: 180, kind: "plain" },
}

const SCENARIOS: Scenario[] = [
  // Every scenario is laid out symmetrically around the viewBox midpoint
  // (480) so switching tabs doesn't pull the composition left or right.
  // 3-node scenarios: 210 · 480 · 750 (270px gap). 5-node: 80 · 280 · 480 ·
  // 680 · 880 (200px gap).
  {
    id: "cashin-same",
    title: "Cash in · same chain",
    blurb:
      "A payer sends to a disposable stealth. The sweeper wraps it (1% fee) and credits your encrypted ledger. The payer never sees your wallet.",
    nodes: [
      { ...NODES_POOL.ext,     x: 210, y: 180 },
      { ...NODES_POOL.stealth, x: 480, y: 180 },
      { ...NODES_POOL.ledgerA, x: 750, y: 180 },
    ],
    edges: [
      { from: "ext",     to: "stealth", label: "faucet · salary" },
      { from: "stealth", to: "ledgerA", label: "sweep · 1% fee" },
    ],
    pathD: "M 210,180 L 480,180 L 750,180",
  },
  {
    id: "cashin-cross",
    title: "Cash in · cross-chain",
    blurb:
      "Payer lands on chain A; your ledger lives on chain B. CCTP burns on A, mints to an ephemeral on B, sweeps into your ledger. Two chains, one signature.",
    nodes: [
      { ...NODES_POOL.ext,     x: 80,  y: 180 },
      { ...NODES_POOL.stealth, x: 280, y: 180, sub: "on chain A" },
      { ...NODES_POOL.bridgeA, x: 480, y: 180 },
      { ...NODES_POOL.ephB,    x: 680, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.ledgerB, x: 880, y: 180 },
    ],
    edges: [
      { from: "ext",     to: "stealth", label: "deposit" },
      { from: "stealth", to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",    label: "mint" },
      { from: "ephB",    to: "ledgerB", label: "sweep" },
    ],
    pathD: "M 80,180 L 280,180 L 480,180 L 680,180 L 880,180",
  },
  {
    id: "cashout-same",
    title: "Cash out · same chain",
    blurb:
      "Ledger debits to an ephemeral; the ephemeral forwards to any address. Recipient sees a one-time sender — no history, no balance.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 210, y: 180 },
      { ...NODES_POOL.ephA,    x: 480, y: 180 },
      { ...NODES_POOL.target,  x: 750, y: 180, sub: "chain A" },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",   label: "spend" },
      { from: "ephA",    to: "target", label: "forward" },
    ],
    pathD: "M 210,180 L 480,180 L 750,180",
  },
  {
    id: "cashout-cross",
    title: "Cash out · cross-chain",
    blurb:
      "Ledger A → ephemeral A → CCTP burn → ephemeral B → target on B. The bridge connects two random addresses; neither is yours.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 80,  y: 180 },
      { ...NODES_POOL.ephA,    x: 280, y: 180, label: "Ephemeral A" },
      { ...NODES_POOL.bridgeA, x: 480, y: 180 },
      { ...NODES_POOL.ephB,    x: 680, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.target,  x: 880, y: 180, sub: "chain B" },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",    label: "spend" },
      { from: "ephA",    to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",    label: "mint" },
      { from: "ephB",    to: "target",  label: "forward" },
    ],
    pathD: "M 80,180 L 280,180 L 480,180 L 680,180 L 880,180",
  },
  {
    id: "bridge-self",
    title: "Bridge · self ledger",
    blurb:
      "Move your own funds between chains. Ledger A → ephemeral A → CCTP → ephemeral B → ledger B. Both ends belong to the same passkey.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 80,  y: 180 },
      { ...NODES_POOL.ephA,    x: 280, y: 180, label: "Ephemeral A" },
      { ...NODES_POOL.bridgeA, x: 480, y: 180 },
      { ...NODES_POOL.ephB,    x: 680, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.ledgerB, x: 880, y: 180 },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",    label: "spend" },
      { from: "ephA",    to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",    label: "mint" },
      { from: "ephB",    to: "ledgerB", label: "sweep" },
    ],
    pathD: "M 80,180 L 280,180 L 480,180 L 680,180 L 880,180",
  },
  {
    id: "defi-same",
    title: "DeFi · same chain",
    blurb:
      "Deposit confidential balance into a same-chain vault. Yield accrues under your pseudonymous ledger ID; withdraw decrypts back into the ledger. The vault never sees your wallet.",
    nodes: [
      { ...NODES_POOL.ledgerA,  x: 210, y: 180 },
      { ...NODES_POOL.vaultA,   x: 480, y: 180 },
      { ...NODES_POOL.ledgerOut, x: 750, y: 180 },
    ],
    edges: [
      { from: "ledgerA",  to: "vaultA",    label: "deposit · confidential" },
      { from: "vaultA",   to: "ledgerOut", label: "withdraw + yield" },
    ],
    pathD: "M 210,180 L 480,180 L 750,180",
  },
  {
    id: "defi-cross",
    title: "DeFi · cross-chain",
    blurb:
      "Move encrypted balance from chain A to a vault on chain B in one signature. CCTP burns on A, an ephemeral on B forwards into the vault. Two chains, one yield position, never your address on either.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 80,  y: 180 },
      { ...NODES_POOL.ephA,    x: 280, y: 180, label: "Ephemeral A" },
      { ...NODES_POOL.bridgeA, x: 480, y: 180 },
      { ...NODES_POOL.ephB,    x: 680, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.vaultB,  x: 880, y: 180 },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",    label: "spend" },
      { from: "ephA",    to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",    label: "mint" },
      { from: "ephB",    to: "vaultB",  label: "deposit" },
    ],
    pathD: "M 80,180 L 280,180 L 480,180 L 680,180 L 880,180",
  },
  {
    id: "compliance-refuse",
    title: "Compliance · refused at sweep",
    blurb:
      "When the depositor is on the AML deny-list, the gate refuses the sweep. Z0tz never holds the funds — they remain at your stealth EOA, your keys still work, and the privacy stack stays unused for this value. Refuse to integrate, never custody.",
    nodes: [
      { ...NODES_POOL.extFlag, x: 80,  y: 180 },
      { ...NODES_POOL.stealth, x: 320, y: 180 },
      { ...NODES_POOL.gate,    x: 560, y: 180 },
      { ...NODES_POOL.hold,    x: 800, y: 180 },
    ],
    edges: [
      { from: "extFlag", to: "stealth", label: "deposit (flagged)" },
      { from: "stealth", to: "gate",    label: "sweep request" },
      { from: "gate",    to: "hold",    label: "refused · ComplianceRejected" },
    ],
    pathD: "M 80,180 L 320,180 L 560,180 L 800,180",
  },
]

// ─── Component ─────────────────────────────────────────────────────────────

export function InteractiveFlow() {
  const [idx, setIdx] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(m.matches)
    const onChange = () => setReducedMotion(m.matches)
    m.addEventListener("change", onChange)
    return () => m.removeEventListener("change", onChange)
  }, [])

  const scenario = SCENARIOS[idx]
  const nodeById = Object.fromEntries(scenario.nodes.map(n => [n.id, n]))

  return (
    <div>
      {/* Scenario tabs — wraps to multiple lines on narrow screens so users
          never have to horizontally scroll. With 8 scenarios the row also
          wraps at typical desktop widths. Tighter padding + slightly smaller
          font keeps the row compact. */}
      <div
        role="tablist"
        aria-label="Flow scenario"
        className="mb-4 flex flex-wrap justify-center gap-2 px-2"
      >
        {SCENARIOS.map((s, i) => {
          const active = i === idx
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => setIdx(i)}
              className={`font-mono text-xs md:text-sm uppercase tracking-[0.1em] whitespace-nowrap px-3 py-2 md:px-4 md:py-2.5 border transition-colors duration-200 ${
                active
                  ? "border-[var(--bright-red)] text-[var(--bright-red)] bg-[var(--accent-glow)]"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {s.title}
            </button>
          )
        })}
      </div>

      {/* Diagram */}
      <div
        className="relative w-full"
        style={{ aspectRatio: "1040 / 400" }}
      >
        <svg
          viewBox="-40 -20 1040 400"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-labelledby={`flow-title-${scenario.id}`}
        >
          <title id={`flow-title-${scenario.id}`}>{`${scenario.title}: ${scenario.blurb}`}</title>
          <defs>
            <marker id="flow-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#E63946" />
            </marker>
            <marker id="flow-arr-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#4a4a4a" />
            </marker>
          </defs>

          {/* Edges */}
          {scenario.edges.map((e, i) => {
            const a = nodeById[e.from]
            const b = nodeById[e.to]
            if (!a || !b) return null
            // Rect half-width is 70; stop arrow 4px short of the node edge
            const x1 = a.x + 74
            const x2 = b.x - 74
            const yMid = (a.y + b.y) / 2
            const midX = (x1 + x2) / 2
            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                <line
                  x1={x1}
                  y1={a.y}
                  x2={x2}
                  y2={b.y}
                  stroke="#E63946"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  markerEnd="url(#flow-arr)"
                />
                {e.label && (
                  <text
                    x={midX}
                    y={yMid - 10}
                    textAnchor="middle"
                    fill="#8A8A8A"
                    className="font-mono"
                    fontSize={11}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Animated flow dot along scenario.pathD */}
          {!reducedMotion && (
            <circle r={5} fill="#E63946">
              <animateMotion dur="3.6s" repeatCount="indefinite" path={scenario.pathD} />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1" dur="3.6s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Nodes — rendered on top of edges */}
          {scenario.nodes.map((n) => {
            const isHovered = hovered === n.id
            const fill =
              n.kind === "ledger" ? "rgba(230,57,70,0.14)" :
              n.kind === "vault" ? "rgba(230,57,70,0.22)" :
              n.kind === "gate" ? "rgba(245,158,11,0.18)" :
              n.kind === "ephemeral" ? "rgba(10,10,10,1)" :
              n.kind === "bridge" ? "rgba(10,10,10,1)" :
              "rgba(26,26,26,1)"
            const stroke =
              n.kind === "ledger" ? "rgba(230,57,70,0.7)" :
              n.kind === "vault" ? "rgba(230,57,70,0.9)" :
              n.kind === "gate" ? "rgba(245,158,11,0.9)" :
              n.kind === "ephemeral" ? "rgba(245,245,245,0.18)" :
              n.kind === "bridge" ? "rgba(245,245,245,0.35)" :
              "rgba(245,245,245,0.25)"
            const dashed = n.kind === "ephemeral"
            const isCircle = n.kind === "bridge"
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "default", transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)" }}
                transform={isHovered ? `translate(0,-2)` : undefined}
              >
                {isCircle ? (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={42}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                  />
                ) : (
                  <rect
                    x={n.x - 70}
                    y={n.y - 26}
                    width={140}
                    height={52}
                    rx={8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray={dashed ? "4 3" : undefined}
                  />
                )}
                <text
                  x={n.x}
                  y={n.y - 3}
                  textAnchor="middle"
                  className="font-mono"
                  fill="#F5F5F5"
                  fontSize={12}
                  fontWeight={600}
                  lengthAdjust="spacingAndGlyphs"
                  textLength={Math.min(128, (n.label?.length ?? 0) * 7.5)}
                >
                  {n.label}
                </text>
                {n.sub && (
                  <text
                    x={n.x}
                    y={n.y + 13}
                    textAnchor="middle"
                    className="font-mono"
                    fill="#8A8A8A"
                    fontSize={10}
                    lengthAdjust="spacingAndGlyphs"
                    textLength={Math.min(128, (n.sub?.length ?? 0) * 6)}
                  >
                    {n.sub}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Blurb under the diagram — hugs the SVG bottom */}
      <div className="mx-auto -mt-14 max-w-2xl text-center">
        <p className="text-sm text-muted-foreground md:text-base">{scenario.blurb}</p>
      </div>
    </div>
  )
}
