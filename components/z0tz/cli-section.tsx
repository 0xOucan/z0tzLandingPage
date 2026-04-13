"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"

interface TerminalLine {
  type: "input" | "output" | "error" | "success"
  text: string
}

const commandResponses: Record<string, TerminalLine[]> = {
  help: [
    { type: "output", text: "Z0tz CLI — FHE-Native Private Wallet Stack" },
    { type: "output", text: "" },
    { type: "output", text: "COMMANDS:" },
    { type: "output", text: "  init                                    Configure network" },
    { type: "output", text: "  wallet create-passkey                   Create + auto-deploy on 3 chains" },
    { type: "output", text: "  wallet info                             Show wallet details" },
    { type: "output", text: "  wallet balance                          Check balances" },
    { type: "output", text: "  tx private-faucet --amount <n>          Mint → stealth → encrypted" },
    { type: "output", text: "  tx shield --amount <n>                  USDC → zUSDC (encrypted)" },
    { type: "output", text: "  tx send-aa --to <addr> --amount <n>     FHE transfer" },
    { type: "output", text: "  tx unshield-v5 --amount <n>             2-phase unshield" },
    { type: "output", text: "  tx claim --ct-hash <h> ...              Claim with TN signature" },
    { type: "output", text: "" },
    { type: "output", text: "CROSS-CHAIN (Circle CCTP V2 by default):" },
    { type: "output", text: "  bridge private --amount <n> --dest-chain <id>" },
    { type: "output", text: "  bridge cashout --amount <n> --dest-chain <id> --to <addr>" },
    { type: "output", text: "  bridge cashin --src-chain <id>" },
    { type: "output", text: "  bridge cctp --src-chain <c> --dest-chain <c> ...    low-level" },
    { type: "output", text: "" },
    { type: "output", text: "STEALTH + RECOVERY:" },
    { type: "output", text: "  stealth init / meta-address / generate" },
    { type: "output", text: "  recovery export / import (PNG or encrypted ZIP)" },
    { type: "output", text: "" },
    { type: "output", text: "Every command is gasless. Users never need ETH." },
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
  "tx shield --amount 5000": [
    { type: "output", text: "Shielding 5000 USDC → eUSDC..." },
    { type: "output", text: "" },
    { type: "output", text: "  Step 1: approve(Z0tzTokenV2, 5000)" },
    { type: "output", text: "  Step 2: shield(5000)" },
    { type: "output", text: "  FHE encryption via CoFHE SDK..." },
    { type: "output", text: "  TFHE ciphertext generated" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Shielded. Balance is now encrypted on-chain." },
    { type: "output", text: "  Only you can decrypt. Observers see ciphertext." },
  ],
  "tx send-aa --to 0x742d...4e --amount 100": [
    { type: "output", text: "FHE encrypted transfer → 0x742d...4e" },
    { type: "output", text: "" },
    { type: "output", text: "  Encrypting amount with CoFHE SDK..." },
    { type: "output", text: "  TFHE input: euint64 (ZK proof attached)" },
    { type: "output", text: "  Building UserOp → confidentialTransfer()" },
    { type: "output", text: "  Paymaster: gasless" },
    { type: "output", text: "  Submitting to relayer..." },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Transfer executed. Amount hidden on-chain." },
    { type: "output", text: "  Neither sender balance nor amount is visible." },
  ],
  "tx private-faucet --amount 10000000": [
    { type: "output", text: "Private faucet: mint → shield into FHERC20WrappedERC20..." },
    { type: "output", text: "" },
    { type: "output", text: "  Step 1: mint MockUSDC to smart account" },
    { type: "output", text: "  Step 2: approve WrappedToken" },
    { type: "output", text: "  Step 3: shield → encrypted FHERC20 balance" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ 10M minted + shielded. Balance encrypted." },
    { type: "output", text: "  No plaintext balance ever visible on-chain." },
  ],
  "tx unshield-v5 --amount 100": [
    { type: "output", text: "V5 Unshield (2-phase, step 1)..." },
    { type: "output", text: "" },
    { type: "output", text: "  Building UserOp → unshield(self, 100)" },
    { type: "output", text: "  Burns encrypted → FHE.allowPublic → claim created" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Claim created. Awaiting threshold network decryption." },
    { type: "output", text: "  Next: z0tz tx claim --ct-hash <h> --amount 100 --signature <sig>" },
  ],
  "tx unshield --amount 100": [
    { type: "output", text: "Unshielding 100 eUSDC → USDC (V4 legacy)..." },
    { type: "output", text: "" },
    { type: "output", text: "  Building UserOp → unshield(100)" },
    { type: "output", text: "  Decrypting FHE balance..." },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Unshielded. 100 USDC available as ERC-20." },
  ],
  "bridge private --amount 5 --dest-chain 421614": [
    { type: "output", text: "Private Bridge (12 steps): base-sepolia → arb-sepolia, 5 USDC" },
    { type: "output", text: "  token: usdc  →  Circle CCTP V2 Fast Transfer" },
    { type: "output", text: "" },
    { type: "output", text: "  [1/12] Generate stealthA + stealthB from random seeds" },
    { type: "output", text: "  [2/12] Encrypted transfer: account → stealthA (FHE)" },
    { type: "output", text: "  [3/12] Fund stealthA with ETH (relayer pool)" },
    { type: "output", text: "  [4/12] stealthA unshield → FHE.allowPublic → claim" },
    { type: "output", text: "  [5/12] CoFHE threshold network decrypts burn" },
    { type: "output", text: "  [6/12] stealthA claimUnshielded → plaintext USDC" },
    { type: "output", text: "  [7/12] CCTP depositForBurn → mintRecipient=stealthB" },
    { type: "output", text: "  [8/12] Circle attestation... complete in 5.8s" },
    { type: "output", text: "  [9/12] Fund stealthB with ETH (relayer pool)" },
    { type: "output", text: "  [10/12] CCTP receiveMessage → mint at stealthB" },
    { type: "output", text: "  [11/12] Approve sweeper + CoFHE encrypt" },
    { type: "output", text: "  [12/12] PrivateSweeperV2 → encrypted balance on arb" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Done in 64.2s, 1.94M gas, $0.024 on L2" },
    { type: "output", text: "  Circle is the bridge. Z0tz is still the privacy." },
  ],
  "bridge cashout --amount 0.5 --dest-chain 421614 --to 0xfbf9": [
    { type: "output", text: "Cross-Chain Cash Out (10 steps): base-sepolia → arb-sepolia" },
    { type: "output", text: "  amount: 0.5 USDC  target: 0xfBf9fcB0...e1B2" },
    { type: "output", text: "" },
    { type: "output", text: "  [1-6] Source side: encrypted transfer → stealthA → unshield → claim" },
    { type: "output", text: "  [7] CCTP burn at stealthA → mintRecipient=stealthB on arb" },
    { type: "output", text: "  [8] Circle attestation complete" },
    { type: "output", text: "  [9] Fund stealthB + receiveMessage → plaintext at stealthB" },
    { type: "output", text: "  [10] stealthB.transfer(target, amount)" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Target received USDC from a random stealth on arb" },
    { type: "output", text: "  52.4s, 541K gas, $0.007 on L2 — no link to your smart account" },
  ],
  "bridge cashin --src-chain 84532": [
    { type: "output", text: "Cross-Chain Cash In (8 steps): base-sepolia → current chain" },
    { type: "output", text: "" },
    { type: "output", text: "  [1] Scanning stealth announcements on source chain..." },
    { type: "output", text: "  [2] Found stealth 0x38033A01... with 20 USDC" },
    { type: "output", text: "  [3] CCTP burn at stealthA → mintRecipient=stealthB" },
    { type: "output", text: "  [4] Circle attestation complete" },
    { type: "output", text: "  [5] Fund stealthB + receiveMessage → USDC at stealthB" },
    { type: "output", text: "  [6] Approve sweeper + CoFHE encrypt (sweeper as ACL)" },
    { type: "output", text: "  [7] PrivateSweeperV2 → encrypted balance on dest" },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Done in 38.6s, 718K gas, $0.010 on L2" },
    { type: "output", text: "  Someone paid your stealth on chain A. You have private funds on chain B." },
  ],
  "stealth init": [
    { type: "output", text: "Initializing stealth address system..." },
    { type: "output", text: "" },
    { type: "output", text: "  Generating spending key (secp256k1)..." },
    { type: "output", text: "  Generating viewing key (secp256k1)..." },
    { type: "output", text: "  Registering meta-address on-chain..." },
    { type: "output", text: "" },
    { type: "success", text: "  ✓ Stealth keys sealed." },
    { type: "output", text: "  Share your meta-address to receive private payments." },
  ],
  "stealth meta-address": [
    { type: "output", text: "Your stealth meta-address:" },
    { type: "output", text: "" },
    { type: "success", text: "  st:eth:0x04a3f7...b2c1d804e9...f3a7" },
    { type: "output", text: "" },
    { type: "output", text: "  Share this with senders. They generate a one-time" },
    { type: "output", text: "  address from it. No link between you and the payment." },
  ],
  demo: [
    { type: "output", text: "═══ Z0TZ V5 DEFINITIVE 3-ACTOR MULTI-CHAIN TEST ═══" },
    { type: "output", text: "" },
    { type: "output", text: "  3 users: Alice (Base), Bob (Eth), Charlie (Arb)" },
    { type: "output", text: "  3 chains: Base Sepolia, Eth Sepolia, Arb Sepolia" },
    { type: "output", text: "  V5: FHERC20WrappedERC20 | 2-phase unshield | 39 contracts" },
    { type: "output", text: "" },
    { type: "success", text: "  Phase 1:  Onboarding ........... 3/3 PASSED" },
    { type: "success", text: "  Phase 2:  Deploy ............... 3/3 PASSED" },
    { type: "success", text: "  Phase 3:  Private Faucet ....... 3/3 PASSED" },
    { type: "success", text: "  Phase 4:  Balance (ERC-1271) ... 3/3 PASSED" },
    { type: "success", text: "  Phase 5:  FHE Transfer ......... 6/6 PASSED" },
    { type: "success", text: "  Phase 6:  Unshield V5 (2-phase). 2/2 PASSED" },
    { type: "success", text: "  Phase 7:  Stealth .............. 6/6 PASSED" },
    { type: "success", text: "  Phase 8:  Cross-Stealth ........ 3/3 PASSED" },
    { type: "success", text: "  Phase 9:  Bridge ............... 3/3 PASSED" },
    { type: "success", text: "  Phase 10: Final Balances ...... 3/3 PASSED" },
    { type: "output", text: "" },
    { type: "success", text: "  ══ V5 PASSED — Maximum privacy from identity to execution ══" },
    { type: "output", text: "" },
    { type: "output", text: "  FHERC20WrappedERC20 wraps assets. 2-phase unshield closes the privacy gap." },
    { type: "output", text: "  Fhenix encrypts computation. Z0tz encrypts the user." },
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
    { type: "output", text: "Balances:" },
    { type: "output", text: "" },
    { type: "output", text: "  USDC (ERC-20):  5,000.00" },
    { type: "output", text: "  eUSDC (FHE):    [encrypted — only you can view]" },
    { type: "output", text: "  ETH:            0.000 (not needed)" },
  ],
  clear: [],
}

const quickCommands = [
  { label: "help", cmd: "help" },
  { label: "wallet create-passkey", cmd: "wallet create-passkey" },
  { label: "private-faucet", cmd: "tx private-faucet --amount 10000000" },
  { label: "tx shield", cmd: "tx shield --amount 5000" },
  { label: "tx send-aa", cmd: "tx send-aa --to 0x742d...4e --amount 100" },
  { label: "unshield-v5", cmd: "tx unshield-v5 --amount 100" },
  { label: "bridge private (CCTP)", cmd: "bridge private --amount 5 --dest-chain 421614" },
  { label: "bridge cashout (CCTP)", cmd: "bridge cashout --amount 0.5 --dest-chain 421614 --to 0xfbf9" },
  { label: "bridge cashin (CCTP)", cmd: "bridge cashin --src-chain 84532" },
  { label: "stealth init", cmd: "stealth init" },
  { label: "demo", cmd: "demo" },
]

export function CLISection() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", text: "Z0tz CLI v5.0.0 — FHE-Native Private Wallet (FHERC20WrappedERC20)" },
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
            { type: "output", text: "Z0tz CLI v5.0.0 — FHE-Native Private Wallet (FHERC20WrappedERC20)" },
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
