import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Z0tz — App Preview",
  description: "Interactive preview of the Z0tz FHE-native private wallet",
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
