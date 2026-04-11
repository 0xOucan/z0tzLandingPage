import { Navbar } from "@/components/z0tz/navbar"
import { HeroSection } from "@/components/z0tz/hero-section"
import { WhySection } from "@/components/z0tz/why-section"
import { PrivacyLayersSection } from "@/components/z0tz/privacy-layers-section"
import { ArchitectureSection } from "@/components/z0tz/architecture-section"
import { FlowSection } from "@/components/z0tz/flow-section"
import { HonestSection } from "@/components/z0tz/honest-section"
import { TestnetSection } from "@/components/z0tz/testnet-section"
import { ContractsSection } from "@/components/z0tz/contracts-section"
import { RelayerSection } from "@/components/z0tz/relayer-section"
import { CLISection } from "@/components/z0tz/cli-section"
import { MarketFitSection } from "@/components/z0tz/market-fit-section"
import { RoadmapSection } from "@/components/z0tz/roadmap-section"
import { Footer } from "@/components/z0tz/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <WhySection />
      <CLISection />
      <PrivacyLayersSection />
      <ArchitectureSection />
      <FlowSection />
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
