"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

interface TerminalLine {
  type: "input" | "output" | "error" | "success"
  text: string
}

const commandResponses: Record<string, TerminalLine[]> = {
  help: [
    { type: "output", text: "Z0tz CLI v6.5.2 — FHE-encrypted ledger wallet" },
    { type: "output", text: "" },
    { type: "output", text: "WALLET" },
    { type: "output", text: "  init                                    Configure network + RPC" },
    { type: "output", text: "  wallet create-passkey                   Create + auto-deploy on 3 chains" },
    { type: "output", text: "  wallet info                             Show wallet + chains deployed" },
    { type: "output", text: "  wallet balance                          Scan ledger balance (gasless)" },
    { type: "output", text: "" },
    { type: "output", text: "CASH IN / CASH OUT (same chain)" },
    { type: "output", text: "  ledger cashin  --amount <n>             Sweep stealth USDC → ledger" },
    { type: "output", text: "  ledger cashout --amount <n> --to <addr> Ledger → ephemeral → target" },
    { type: "output", text: "  tx private-faucet --amount <n>          Testnet: mint USDC to a cash-in stealth" },
    { type: "output", text: "" },
    { type: "output", text: "CROSS-CHAIN (Circle CCTP V2)" },
    { type: "output", text: "  ledger bridge-cashin  --src <c> --dst <c>       Stealth on A → ledger on B" },
    { type: "output", text: "  ledger bridge-cashout --src <c> --dst <c> --to <addr>  Ledger A → target B" },
    { type: "output", text: "  ledger bridge         --src <c> --dst <c>       Self: ledger A → ledger B" },
    { type: "output", text: "" },
    { type: "output", text: "STEALTH ADDRESSES (3 families, all derived from the passkey)" },
    { type: "output", text: "  stealth gen-cashin                      HKDF one-shot inbox · for deposits" },
    { type: "output", text: "  stealth gen-smart --salt <n>            CREATE2 smart account · for DeFi" },
    { type: "output", text: "  stealth gen-eoa   --salt <n>            HKDF EOA · privkey extractable" },
    { type: "output", text: "  stealth list                            List all 3 families across chains" },
    { type: "output", text: "" },
    { type: "output", text: "RECOVERY" },
    { type: "output", text: "  recovery export / import                QR · encrypted ZIP · stego PNG" },
    { type: "output", text: "" },
    { type: "output", text: "Every command is gasless through the paymaster + relayer." },
  ],
  "wallet create-passkey": [
    { type: "output", text: "Generating P-256 passkey..." },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Passkey created (secp256r1)" },
    { type: "output", text: "  Public Key X: 0x7a3f...c4e1" },
    { type: "output", text: "  Public Key Y: 0x91b2...d8f3" },
    { type: "output", text: "" },
    { type: "output", text: "Auto-deploying on all 3 chains..." },
    { type: "success", text: "  ✓ base-sepolia: deployed at 0x742d...4e  (gasless)" },
    { type: "success", text: "  ✓ eth-sepolia:  deployed at 0xaC9C...fA4  (gasless)" },
    { type: "success", text: "  ✓ arb-sepolia:  deployed at 0x4bD4...Ba3  (gasless)" },
    { type: "output", text: "" },
    { type: "success", text: "  Wallet sealed on 3 chains. No seed phrase needed." },
  ],
  "tx faucet --amount 10000000": [
    { type: "output", text: "Minting 10.0 USDC to smart account..." },
    { type: "output", text: "" },
    { type: "output", text: "  Building UserOp → MockERC20.mint()" },
    { type: "output", text: "  Signing with P-256..." },
    { type: "output", text: "  Paymaster: gasless" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Minted 10,000,000 units (10.0 USDC)" },
    { type: "output", text: "  No admin key required. Permissionless." },
  ],
  "ledger cashin --amount 10": [
    { type: "output", text: "Cash in 10 USDC on base-sepolia..." },
    { type: "output", text: "" },
    { type: "output", text: "  Derive cash-in stealth (HKDF index 0) → 0x4Ffe…9388" },
    { type: "output", text: "  Relayer funds stealth with ETH for the sweep tx" },
    { type: "output", text: "  approve(sweeper, 10 USDC)" },
    { type: "output", text: "  privateSweepToLedger(nonce=0, ledgerId=0xf156…89d5, viewer=0xd0E4…C671)" },
    { type: "output", text: "  Vault.creditFromVault → ciphertext handle" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 9.9 USDC credited to your ledger (1% sweeper fee)" },
    { type: "output", text: "  sweepNonceV2 now 1 — next sweep at this stealth uses nonce 1." },
  ],
  "ledger cashout --amount 5 --to 0x9c77...6e45": [
    { type: "output", text: "Cash out 5 USDC on base-sepolia → 0x9c77…6e45" },
    { type: "output", text: "" },
    { type: "output", text: "  Ledger.spend(Cashout, oldId→newId)" },
    { type: "output", text: "  Vault.transferOut → ephemeral stealth 0x2DCB…a0Ea" },
    { type: "output", text: "  Stealth.unshield → FHERC20 two-phase claim" },
    { type: "output", text: "  CoFHE threshold network decrypts" },
    { type: "output", text: "  Stealth.transfer(target, 5 USDC)" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 5.0 USDC delivered to target in ~8s" },
    { type: "output", text: "  Target only sees a random ephemeral — no link to your account." },
  ],
  "ledger bridge-cashin --src 84532 --dst 421614": [
    { type: "output", text: "Cross-chain cash in: base-sepolia → arb-sepolia" },
    { type: "output", text: "" },
    { type: "output", text: "  Detect cash-in stealth #0 on base — 20 USDC" },
    { type: "output", text: "  Fund src stealth ETH + approve CCTP" },
    { type: "output", text: "  CCTP depositForBurn → random ephemeral on arb" },
    { type: "output", text: "  Circle attestation (~6s)" },
    { type: "output", text: "  CCTP receiveMessage on arb → ephemeral holds ~19.999 USDC" },
    { type: "output", text: "  approve(arb sweeper) + privateSweepToLedger" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 19.78 USDC credited to your arb ledger (~45s total)" },
  ],
  "ledger bridge-cashout --src 84532 --dst 421614 --to 0x9c77...6e45": [
    { type: "output", text: "Cross-chain cash out: base ledger → target on arb" },
    { type: "output", text: "" },
    { type: "output", text: "  Ledger.spend(Cashout) on base → ephemeral A" },
    { type: "output", text: "  Unshield + claim on ephemeral A → plaintext USDC" },
    { type: "output", text: "  CCTP burn at ephemeral A → random ephemeral B on arb" },
    { type: "output", text: "  Circle attestation (~6s)" },
    { type: "output", text: "  CCTP receiveMessage on arb → ephemeral B" },
    { type: "output", text: "  ephemeral B.transfer(target, amount)" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Target on arb received USDC from a fresh stealth (~90s)" },
    { type: "output", text: "  No on-chain link between the src smart account and the arb target." },
  ],
  "ledger bridge --src 84532 --dst 421614": [
    { type: "output", text: "Self-bridge: base ledger → arb ledger" },
    { type: "output", text: "" },
    { type: "output", text: "  Ledger.spend on base → ephemeral A" },
    { type: "output", text: "  Unshield + claim → CCTP burn to ephemeral B on arb" },
    { type: "output", text: "  CCTP mint on arb → sweep ephemeral B into arb ledger" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Balance moved from base ledger to arb ledger (~75s)" },
    { type: "output", text: "  Both ends are yours — nothing leaves your passkey's scope." },
  ],
  "tx private-faucet --amount 20": [
    { type: "output", text: "Testnet private faucet: 20 USDC → cash-in stealth" },
    { type: "output", text: "" },
    { type: "output", text: "  Derive cash-in stealth HKDF index 0" },
    { type: "output", text: "  MockUSDC.mint → stealth (plaintext, testnet only)" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 20.0 USDC at stealth · ready to `ledger cashin`" },
  ],
  "stealth list": [
    { type: "output", text: "Stealth families derived from your passkey:" },
    { type: "output", text: "" },
    { type: "output", text: "  CASH-IN (HKDF · disposable inbox)" },
    { type: "output", text: "    #0  0x4Ffe…9388  base-sepolia  20 USDC pending" },
    { type: "output", text: "    #1  0x1b0E…C225  eth-sepolia   —" },
    { type: "output", text: "" },
    { type: "output", text: "  PERMANENT SMART (CREATE2 · ERC-4337 · paymaster)" },
    { type: "output", text: "    salt 1  0x41a7…8b90  base-sepolia  deployed · 5 USDC" },
    { type: "output", text: "    salt 2  0x0b5E…4f29  base-sepolia  deployed · 2.5 USDC" },
    { type: "output", text: "" },
    { type: "output", text: "  PERMANENT EOA (HKDF · privkey extractable)" },
    { type: "output", text: "    salt 1  0x8aF2…7c30  all chains    privkey via `stealth reveal`" },
    { type: "output", text: "" },
    { type: "output", text: "  All three families roll back to the same passkey. No mixing, no custody." },
  ],
  "stealth gen-cashin": [
    { type: "output", text: "Derive fresh cash-in stealth..." },
    { type: "output", text: "" },
    { type: "output", text: "  HKDF(passkey, chainId=84532, \"z0tz-cashin\", index=0)" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 0x4Ffe03d5…629388 on base-sepolia" },
    { type: "output", text: "  Faucet USDC here, then `z0tz ledger cashin`." },
  ],
  "stealth gen-smart --salt 3": [
    { type: "output", text: "Deploy permanent smart-account stealth at salt 3..." },
    { type: "output", text: "" },
    { type: "output", text: "  CREATE2(factory, passkey pubkey, salt=3)" },
    { type: "output", text: "  Paymaster sponsors the deploy UserOp" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 0x3f9A1e…c04B deployed on base-sepolia (gasless)" },
    { type: "output", text: "  Use for DeFi: lending, DEX, yield — pseudonymous positions." },
  ],
  "stealth gen-eoa --salt 3": [
    { type: "output", text: "Derive permanent EOA stealth at salt 3..." },
    { type: "output", text: "" },
    { type: "output", text: "  HKDF(passkey, \"z0tz-eoa\", salt=3) → secp256k1 privkey" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 0x8aF274…eC730 · privkey extractable (PIN-gated)" },
    { type: "output", text: "  Export to MetaMask or any EOA-only protocol." },
  ],
  demo: [
    { type: "output", text: "═══ Z0TZ V6.5.2 SUPER-SCRIPT · April 2026 ═══" },
    { type: "output", text: "" },
    { type: "output", text: "  3 chains: Base Sepolia, Eth Sepolia, Arb Sepolia" },
    { type: "output", text: "  6 bridges (each chain ↔ the other two)" },
    { type: "output", text: "  6 cross-chain cashouts · 3 same-chain cashins" },
    { type: "output", text: "" },
    { type: "success", text: "  Phase 1:  Setup + account deploy ............ 3/3 PASSED" },
    { type: "success", text: "  Phase 2:  Relayer probe (P-256 auth) ........ 3/3 PASSED" },
    { type: "success", text: "  Phase 3:  Stealth funding (faucet) .......... 3/3 PASSED" },
    { type: "success", text: "  Phase 4:  Cash-in × 3 (sweep → ledger) ...... 3/3 PASSED" },
    { type: "success", text: "  Phase 5:  Reveal balance via viewer permit .. 3/3 PASSED" },
    { type: "success", text: "  Phase 6:  Self-bridges × 6 .................. 6/6 PASSED" },
    { type: "success", text: "  Phase 7:  Cross-chain cashouts × 6 .......... 6/6 PASSED" },
    { type: "success", text: "  Phase 8:  Multi-sweep (same stealth × 2) .... 3/3 PASSED" },
    { type: "output", text: "" },
    { type: "success", text: "  ══ V6.5.2 PASSED · 27 flows green on 3 chains ══" },
    { type: "output", text: "" },
    { type: "output", text: "  Cash-in first sweep: 622–668K gas. Second sweep: ~467K." },
    { type: "output", text: "  Cross-chain flows: ~45–90s end-to-end via CCTP V2." },
  ],
  init: [
    { type: "output", text: "Configuring Z0tz..." },
    { type: "output", text: "" },
    { type: "output", text: "  Network: base-sepolia (84532)" },
    { type: "output", text: "  RPC: https://base-sepolia-rpc.publicnode.com" },
    { type: "output", text: "  EntryPoint: 0x4337084D...Ff108" },
    { type: "output", text: "  Relayer: http://localhost:3000" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Config sealed at ~/.config/z0tz/config.json" },
  ],
  "wallet info": [
    { type: "output", text: "Wallet Info:" },
    { type: "output", text: "" },
    { type: "output", text: "  Type: P-256 Passkey (secp256r1)" },
    { type: "output", text: "  Smart Account: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bd4e" },
    { type: "output", text: "  Network: base-sepolia (84532)" },
    { type: "output", text: "  Paymaster: Z0tzPaymaster (gasless)" },
    { type: "output", text: "  No seed phrase. No ETH required." },
  ],
  "wallet balance": [
    { type: "output", text: "Ledger balances (decrypted via viewer permit, gasless):" },
    { type: "output", text: "" },
    { type: "output", text: "  base-sepolia   alice@0   19.78 USDC" },
    { type: "output", text: "  eth-sepolia    alice@0   19.78 USDC" },
    { type: "output", text: "  arb-sepolia    alice@0   19.78 USDC" },
    { type: "output", text: "" },
    { type: "output", text: "  Total encrypted ledger: 59.34 USDC" },
    { type: "output", text: "  Ciphertext handles on chain · plaintext only here." },
  ],
  clear: [],
}

const quickCommands = [
  { label: "help", cmd: "help" },
  { label: "wallet create-passkey", cmd: "wallet create-passkey" },
  { label: "private faucet", cmd: "tx private-faucet --amount 20" },
  { label: "ledger cashin", cmd: "ledger cashin --amount 10" },
  { label: "ledger cashout", cmd: "ledger cashout --amount 5 --to 0x9c77...6e45" },
  { label: "bridge cashin", cmd: "ledger bridge-cashin --src 84532 --dst 421614" },
  { label: "bridge cashout", cmd: "ledger bridge-cashout --src 84532 --dst 421614 --to 0x9c77...6e45" },
  { label: "bridge self", cmd: "ledger bridge --src 84532 --dst 421614" },
  { label: "stealth list", cmd: "stealth list" },
  { label: "gen smart stealth", cmd: "stealth gen-smart --salt 3" },
  { label: "gen EOA stealth", cmd: "stealth gen-eoa --salt 3" },
  { label: "demo (super-script)", cmd: "demo" },
]

export function CLISection() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: "Z0tz CLI v6.5.2 — FHE-encrypted ledger wallet" },
    { type: "output", text: "Type \"help\" for commands or click buttons below." },
    { type: "output", text: "" },
  ])
  const [currentInput, setCurrentInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { ref, revealed } = useScrollReveal()

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [lines, scrollToBottom])

  const typeResponse = useCallback(
    (response: TerminalLine[], command: string) => {
      setIsTyping(true)
      const inputLine: TerminalLine = { type: "input", text: `z0tz ${command}` }
      setLines((prev) => [...prev, inputLine])

      if (command === "clear") {
        setTimeout(() => {
          setLines([
            { type: "output", text: "Z0tz CLI v6.5.2 — FHE-encrypted ledger wallet" },
            { type: "output", text: "" },
          ])
          setIsTyping(false)
        }, 200)
        return
      }

      const queue = [...response]
      const tick = () => {
        const next = queue.shift()
        if (next) {
          setLines((prev) => [...prev, next])
          setTimeout(tick, 60)
        } else {
          setLines((prev) => [...prev, { type: "output", text: "" }])
          setIsTyping(false)
        }
      }
      setTimeout(tick, 60)
    },
    []
  )

  const executeCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim().toLowerCase()
      if (!trimmed || isTyping) return

      setHistory((prev) => [...prev, trimmed])
      setHistoryIndex(-1)
      setCurrentInput("")

      // Exact match first, then prefix match
      const exactKey = Object.keys(commandResponses).find((k) => k === trimmed)
      const prefixKey = Object.keys(commandResponses).find((k) =>
        trimmed.startsWith(k)
      )
      const key = exactKey || prefixKey

      if (key && commandResponses[key]) {
        typeResponse(commandResponses[key], trimmed)
      } else {
        typeResponse(
          [
            { type: "error", text: `Unknown command: ${trimmed}` },
            { type: "output", text: "Type \"help\" for available commands." },
          ],
          trimmed
        )
      }
    },
    [isTyping, typeResponse]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeCommand(currentInput)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (history.length > 0) {
        const newIndex =
          historyIndex === -1
            ? history.length - 1
            : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setCurrentInput(history[newIndex])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1
        if (newIndex >= history.length) {
          setHistoryIndex(-1)
          setCurrentInput("")
        } else {
          setHistoryIndex(newIndex)
          setCurrentInput(history[newIndex])
        }
      }
    }
  }

  return (
    <section id="cli" className="py-24 px-6 bg-secondary">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-4 text-center text-foreground">
          Z0tz CLI
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          Every command is gasless. Users never need ETH. Try it below.
        </p>

        {/* Interactive Terminal */}
        <div className="max-w-3xl mx-auto">
          <div className="border border-foreground/30 bg-background glass-card">
            {/* Terminal bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-foreground/20 bg-secondary">
              <span className="w-3 h-3 border border-foreground/40" />
              <span className="w-3 h-3 border border-foreground/40" />
              <span className="w-3 h-3 border border-foreground/40" />
              <span className="text-muted-foreground text-xs ml-2 uppercase tracking-wider">
                z0tz-terminal
              </span>
            </div>

            {/* Output area */}
            <div
              ref={outputRef}
              className="p-4 h-[420px] overflow-y-auto cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {lines.map((line, i) => (
                <div key={i} className="leading-relaxed whitespace-pre">
                  {line.type === "input" ? (
                    <span>
                      <span className="text-muted-foreground">$ </span>
                      <span className="text-foreground">{line.text}</span>
                    </span>
                  ) : line.type === "error" ? (
                    <span className="text-[var(--blood-red)]">{line.text}</span>
                  ) : line.type === "success" ? (
                    <span className="text-foreground font-medium">
                      {line.text}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{line.text}</span>
                  )}
                  {line.text === "" && <br />}
                </div>
              ))}

              {/* Input line */}
              <div className="flex items-center mt-1">
                <span className="text-muted-foreground mr-2 shrink-0">
                  z0tz &gt;
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isTyping}
                  className="flex-1 bg-transparent text-foreground outline-none caret-foreground font-mono"
                  placeholder={isTyping ? "" : "type a command..."}
                  autoComplete="off"
                  spellCheck={false}
                />
                {!isTyping && (
                  <span className="w-2 h-4 bg-foreground animate-blink shrink-0" />
                )}
              </div>
            </div>
          </div>

          {/* Quick command buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            {quickCommands.map((item) => (
              <button
                key={item.cmd}
                onClick={() => executeCommand(item.cmd)}
                disabled={isTyping}
                className="border border-foreground/30 bg-transparent text-muted-foreground px-3 py-1.5 text-xs uppercase tracking-wider transition-all duration-200 hover:bg-foreground hover:text-background disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center mt-10">
          <a
            href="https://github.com/0xOucan/Z0tz"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background inline-block"
          >
            View on GitHub
          </a>
        </div>
      </div>
      </div>
    </section>
  )
}
