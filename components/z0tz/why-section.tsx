"use client"

export function WhySection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-widest mb-16 text-center text-foreground">
          Why Z0tz
        </h2>

        <div className="grid md:grid-cols-2 gap-12 md:gap-24">
          {/* The Problem */}
          <div className="text-muted-foreground">
            <p className="mb-6 text-lg">Most wallets expose everything:</p>
            <ul className="space-y-4">
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Identity</span>
                <span>— addresses linked to real-world accounts</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Behavior</span>
                <span>— transactions visible to anyone</span>
              </li>
              <li className="flex gap-4">
                <span className="text-foreground font-bold">Metadata</span>
                <span>— IP, timing, and patterns tracked</span>
              </li>
            </ul>
          </div>

          {/* The Solution */}
          <div>
            <p className="mb-6 text-lg text-foreground font-medium">
              Z0tz makes privacy the default.
            </p>
            <ul className="space-y-4 text-foreground">
              <li className="flex gap-4">
                <span className="font-bold">Encrypted state</span>
                <span className="text-muted-foreground">— native (FHE)</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Execution</span>
                <span className="text-muted-foreground">— anonymous (TOR / NYM)</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Payments</span>
                <span className="text-muted-foreground">— unlinkable (stealth)</span>
              </li>
              <li className="flex gap-4">
                <span className="font-bold">Gas</span>
                <span className="text-muted-foreground">— invisible (paymaster)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
