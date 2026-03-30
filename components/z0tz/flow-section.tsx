"use client"

const cashInSteps = [
  "Share stealth meta-address",
  "Sender generates one-time address → sends USDC",
  "Scan → sweep → shield (USDC → eUSDC)",
]

const useSteps = [
  "Send eUSDC → amounts hidden on-chain",
  "Paymaster pays gas → zero ETH needed",
]

const cashOutSteps = [
  "Unshield eUSDC → USDC",
  "Send to stealth address → exchange receives, no link to you",
]

export function FlowSection() {
  return (
    <section className="py-24 px-6 bg-secondary">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Private Flow
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Cash In */}
          <div className="border border-foreground/30 p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-6 text-foreground">
              Cash In
            </h3>
            <ol className="space-y-4">
              {cashInSteps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="text-muted-foreground shrink-0">
                    {index + 1}.
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Use */}
          <div className="border border-foreground/30 p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-6 text-foreground">
              Use
            </h3>
            <ol className="space-y-4">
              {useSteps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="text-muted-foreground shrink-0">
                    {index + 4}.
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Cash Out */}
          <div className="border border-foreground/30 p-6">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-6 text-foreground">
              Cash Out
            </h3>
            <ol className="space-y-4">
              {cashOutSteps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="text-muted-foreground shrink-0">
                    {index + 6}.
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
