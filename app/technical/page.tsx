import type { Metadata } from "next"
import { TechnicalOverview } from "@/components/z0tz/technical/technical-overview"

export const metadata: Metadata = {
  title: "Z0tz — Technical Overview",
  description:
    "How Z0tz is built — wallet stack, CLI, GUI, Tezcatli compliance gate, and Tezcatli confidential vaults.",
}

export default function TechnicalPage() {
  return <TechnicalOverview />
}
