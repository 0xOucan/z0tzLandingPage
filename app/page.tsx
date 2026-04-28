import { Navbar } from "@/components/z0tz/navbar"
import { HeroSection } from "@/components/z0tz/hero-section"
import { WhySection } from "@/components/z0tz/why-section"
import { ComposabilitySection } from "@/components/z0tz/composability-section"
import { DiagramsSection } from "@/components/z0tz/diagrams-section"
import { TestnetSection } from "@/components/z0tz/testnet-section"
import { DevelopersSection } from "@/components/z0tz/developers-section"
import { HonestSection } from "@/components/z0tz/honest-section"
import { ComplianceSection } from "@/components/z0tz/compliance-section"
import { RoadmapSection } from "@/components/z0tz/roadmap-section"
import { Footer } from "@/components/z0tz/footer"

/**
 * Reading order — hook, frame expectations, show, try, reference.
 *
 *   Hero          → one line, one promise
 *   Why           → what chains leak, what Z0tz gives back
 *   Honest        → what's public, what's private (expectations before architecture)
 *   Compliance    → risk-mitigation posture: gate, KYC supplier, geofencing
 *   Composability → how it fits with existing infra
 *   Diagrams      → see the flows
 *   Testnet       → try it yourself
 *   Developers    → [collapsed] CLI / contracts / relayer API
 *   Roadmap       → what's next
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <WhySection />
      <HonestSection />
      <ComplianceSection />
      <ComposabilitySection />
      <DiagramsSection />
      <TestnetSection />
      <DevelopersSection />
      <RoadmapSection />
      <Footer />
    </main>
  )
}
