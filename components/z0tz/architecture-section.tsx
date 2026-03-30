"use client"

const architectureFlow = [
  { label: "User (P-256 Passkey)", action: "sign UserOp (offline, free)" },
  { label: "Z0tz CLI / GUI", action: "FHE encrypt → build UserOp" },
  { label: "Z0tz Relayer", action: "submit to chain (pays ETH gas)" },
  { label: "EntryPoint (ERC-4337 v0.8)", action: "validateUserOp (P-256)" },
  { label: "Z0tzAccount (Smart Account)", action: "execute()" },
  { label: "FHERC20 Token", action: "encrypted transfer" },
  { label: "Z0tzPaymaster.postOp()", action: "collects 1% token fee" },
]

export function ArchitectureSection() {
  return (
    <section id="architecture" className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Architecture
        </h2>

        <div className="bg-secondary border border-foreground/30 p-6 md:p-10">
          <div className="space-y-0">
            {architectureFlow.map((step, index) => (
              <div key={index}>
                <div className="flex items-start gap-4">
                  <span className="text-foreground font-bold shrink-0">
                    {step.label}
                  </span>
                </div>
                {index < architectureFlow.length - 1 && (
                  <div className="flex items-center gap-4 py-2">
                    <span className="text-muted-foreground text-lg">↓</span>
                    <span className="text-muted-foreground text-sm">
                      {step.action}
                    </span>
                  </div>
                )}
                {index === architectureFlow.length - 1 && (
                  <div className="flex items-center gap-4 pt-2">
                    <span className="text-muted-foreground text-lg">→</span>
                    <span className="text-muted-foreground text-sm">
                      {step.action}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
