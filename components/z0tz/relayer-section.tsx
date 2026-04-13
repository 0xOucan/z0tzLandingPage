"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"

const endpoints = [
  { method: "POST", path: "/relay", description: "Submit UserOps" },
  { method: "POST", path: "/bridge", description: "Cross-chain relay" },
  { method: "GET", path: "/health", description: "Status" },
  { method: "GET", path: "/config", description: "Contract addresses" },
]

export function RelayerSection() {
  const { ref, revealed } = useScrollReveal()

  return (
    <section className="py-24 px-6">
      <div ref={ref} className={`section-reveal ${revealed ? "revealed" : ""}`}>
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-8 text-center text-foreground">
          Z0tz Relayer
        </h2>

        <div className="max-w-2xl mx-auto">
          <p className="text-muted-foreground mb-2 text-center">
            The relayer submits UserOps to the blockchain.
          </p>
          <p className="text-muted-foreground mb-12 text-center">
            Users never touch ETH. The paymaster pays gas.
          </p>

          <div className="bg-secondary border border-foreground/30 p-6 mb-8">
            {endpoints.map((endpoint, index) => (
              <div
                key={index}
                className="flex items-center gap-4 py-2 border-b border-foreground/10 last:border-0"
              >
                <span className="text-accent font-bold w-12">
                  {endpoint.method}
                </span>
                <span className="text-foreground font-medium flex-1">
                  {endpoint.path}
                </span>
                <span className="text-muted-foreground text-sm">
                  → {endpoint.description}
                </span>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground mb-8 text-center">
            Self-hosted. Open source. Zero dependencies.
          </p>

          <div className="text-center">
            <a
              href="https://github.com/0xOucan/Z0tzRelayer"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-foreground bg-transparent text-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium transition-all duration-200 hover:bg-foreground hover:text-background inline-block"
            >
              GitHub: Z0tzRelayer
            </a>
          </div>
        </div>
      </div>
      </div>
    </section>
  )
}
