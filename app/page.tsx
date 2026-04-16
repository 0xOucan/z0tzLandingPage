import { Navbar } from "@/components/z0tz/navbar"
import { HeroSection } from "@/components/z0tz/hero-section"
import { WhySection } from "@/components/z0tz/why-section"
import { DiagramsSection } from "@/components/z0tz/diagrams-section"
import { CLISection } from "@/components/z0tz/cli-section"
import { HonestSection } from "@/components/z0tz/honest-section"
import { TestnetSection } from "@/components/z0tz/testnet-section"
import { ContractsSection } from "@/components/z0tz/contracts-section"
import { RelayerSection } from "@/components/z0tz/relayer-section"
import { MarketFitSection } from "@/components/z0tz/market-fit-section"
import { RoadmapSection } from "@/components/z0tz/roadmap-section"
import { Footer } from "@/components/z0tz/footer"

/**
 * Reading order — one question answered per scroll scene.
 *
 *   Hero       → what is it / hook
 *   Why        → what problem it solves
 *   Diagrams   → visual tour: flow · stealths · architecture
 *                (replaces the old FlowSection + ArchitectureSection +
 *                 PrivacyLayersSection redundancies)
 *   CLI        → show-don't-tell: what using it looks like
 *   Honest     → where it doesn't (yet) protect — anti-hype
 *   Testnet    → try it yourself
 *   Contracts  → specific addresses per chain
 *   Relayer    → API surface for integrators
 *   Market fit → where it sits in the ecosystem
 *   Roadmap    → what's next
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <WhySection />
      <DiagramsSection />
      <CLISection />
      <HonestSection />
      <TestnetSection />
      <ContractsSection />
      <RelayerSection />
      <MarketFitSection />
      <RoadmapSection />
      <Footer />
    </main>
  )
}
