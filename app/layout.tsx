import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
})

export const metadata: Metadata = {
  title: "Z0tz — FHE-Native Private Wallet Stack",
  description:
    "Create private wallets from day one using FHE. No seed phrases. No IP leaks. No traceable flows.",
  openGraph: {
    title: "Z0tz — FHE-Native Private Wallet",
    description: "Privacy stack from identity to execution to payments",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Z0tz — FHE-Native Private Wallet",
    description: "Privacy stack from identity to execution to payments",
  },
}

export const viewport: Viewport = {
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body className="font-mono antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
