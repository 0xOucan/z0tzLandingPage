"use client"

import { useEffect, useState } from "react"

// ─── Scenarios ─────────────────────────────────────────────────────────────

type NodeKind = "plain" | "stealth" | "ephemeral" | "ledger" | "bridge" | "target"

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
}

const SCENARIOS: Scenario[] = [
  {
    id: "cashin-same",
    title: "Cash in · same chain",
    blurb:
      "Money arrives at a stealth EOA — a throwaway address you never reuse for identity. The sweeper atomically wraps it, takes a 1% fee, and credits your encrypted ledger. From then on the balance is FHE-encrypted on chain.",
    nodes: [
      { ...NODES_POOL.ext, x: 100, y: 180 },
      { ...NODES_POOL.stealth, x: 310, y: 180 },
      { ...NODES_POOL.ledgerA, x: 560, y: 180 },
    ],
    edges: [
      { from: "ext",     to: "stealth", label: "faucet · salary" },
      { from: "stealth", to: "ledgerA", label: "sweep · 1% fee" },
    ],
    pathD: "M 100,180 L 310,180 L 560,180",
  },
  {
    id: "cashin-cross",
    title: "Cash in · cross-chain",
    blurb:
      "Funds landed on chain A but your ledger lives on chain B. Z0tz burns USDC on A via Circle CCTP, mints to a fresh ephemeral on B, then sweeps straight into your encrypted ledger on B. One click, one signature.",
    nodes: [
      { ...NODES_POOL.ext, x: 60, y: 180 },
      { ...NODES_POOL.stealth, x: 250, y: 180, sub: "on chain A" },
      { ...NODES_POOL.bridgeA, x: 460, y: 180 },
      { ...NODES_POOL.ephB, x: 660, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.ledgerB, x: 880, y: 180 },
    ],
    edges: [
      { from: "ext", to: "stealth",   label: "deposit" },
      { from: "stealth", to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",   label: "mint" },
      { from: "ephB", to: "ledgerB",   label: "sweep" },
    ],
    pathD: "M 60,180 L 250,180 L 460,180 L 660,180 L 880,180",
  },
  {
    id: "cashout-same",
    title: "Cash out · same chain",
    blurb:
      "Your encrypted ledger on chain A debits, an ephemeral stealth receives the plaintext USDC, and it forwards to any EOA you name. The ledger balance drops, privately, and the recipient only ever sees the ephemeral address.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 100, y: 180 },
      { ...NODES_POOL.ephA,    x: 370, y: 180 },
      { ...NODES_POOL.target,  x: 620, y: 180, sub: "chain A" },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",   label: "spend" },
      { from: "ephA",    to: "target", label: "forward" },
    ],
    pathD: "M 100,180 L 370,180 L 620,180",
  },
  {
    id: "cashout-cross",
    title: "Cash out · cross-chain",
    blurb:
      "Ledger on chain A debits to an ephemeral, that ephemeral burns via CCTP, a second ephemeral on chain B receives the mint, and the funds forward to a target on chain B. All this in one orchestrated flow.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 40, y: 180 },
      { ...NODES_POOL.ephA,    x: 240, y: 180, label: "Ephemeral A" },
      { ...NODES_POOL.bridgeA, x: 440, y: 180 },
      { ...NODES_POOL.ephB,    x: 640, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.target,  x: 860, y: 180, sub: "chain B" },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",   label: "spend" },
      { from: "ephA",    to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",   label: "mint" },
      { from: "ephB",    to: "target", label: "forward" },
    ],
    pathD: "M 40,180 L 240,180 L 440,180 L 640,180 L 860,180",
  },
  {
    id: "bridge-self",
    title: "Bridge · self ledger",
    blurb:
      "You want your money on chain B instead of chain A. Ledger A debits to an ephemeral, CCTP bridges, the dst ephemeral sweeps into ledger B. Both ends belong to you — nothing leaves your passkey's control.",
    nodes: [
      { ...NODES_POOL.ledgerA, x: 40, y: 180 },
      { ...NODES_POOL.ephA,    x: 240, y: 180, label: "Ephemeral A" },
      { ...NODES_POOL.bridgeA, x: 440, y: 180 },
      { ...NODES_POOL.ephB,    x: 640, y: 180, label: "Ephemeral B" },
      { ...NODES_POOL.ledgerB, x: 860, y: 180 },
    ],
    edges: [
      { from: "ledgerA", to: "ephA",   label: "spend" },
      { from: "ephA",    to: "bridgeA", label: "burn" },
      { from: "bridgeA", to: "ephB",   label: "mint" },
      { from: "ephB",    to: "ledgerB", label: "sweep" },
    ],
    pathD: "M 40,180 L 240,180 L 440,180 L 640,180 L 860,180",
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
    <div className="rounded-none border border-border bg-[var(--surface)] p-4 md:p-6">
      {/* Scenario tabs */}
      <div
        role="tablist"
        aria-label="Flow scenario"
        className="mb-5 flex flex-wrap gap-2"
      >
        {SCENARIOS.map((s, i) => {
          const active = i === idx
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => setIdx(i)}
              className={`font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-2 border transition-colors duration-200 ${
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
        style={{ aspectRatio: "960 / 360" }}
      >
        <svg
          viewBox="0 0 960 360"
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
            // Horizontal line with small indent from node edges so arrows don't overlap
            const x1 = a.x + 60
            const x2 = b.x - 60
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
              n.kind === "ephemeral" ? "rgba(10,10,10,1)" :
              n.kind === "bridge" ? "rgba(10,10,10,1)" :
              "rgba(26,26,26,1)"
            const stroke =
              n.kind === "ledger" ? "rgba(230,57,70,0.7)" :
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
                    x={n.x - 58}
                    y={n.y - 24}
                    width={116}
                    height={48}
                    rx={8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray={dashed ? "4 3" : undefined}
                  />
                )}
                <text
                  x={n.x}
                  y={n.y - 2}
                  textAnchor="middle"
                  className="font-mono"
                  fill="#F5F5F5"
                  fontSize={13}
                  fontWeight={600}
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
                  >
                    {n.sub}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Scenario blurb under the diagram */}
      <div className="mt-5">
        <h3 className="font-mono text-lg font-bold tracking-tight">{scenario.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">{scenario.blurb}</p>
      </div>
    </div>
  )
}
