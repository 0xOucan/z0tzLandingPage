"use client"

import "./mock-gui.css"
import { useState } from "react"
import { MockSidebar } from "@/components/z0tz/mock-gui/mock-sidebar"
import { MockDashboard } from "@/components/z0tz/mock-gui/mock-dashboard"
import { MockBridge } from "@/components/z0tz/mock-gui/mock-bridge"
import { MockCashIn } from "@/components/z0tz/mock-gui/mock-cashin"
import { MockCashOut } from "@/components/z0tz/mock-gui/mock-cashout"
import { MockHistory } from "@/components/z0tz/mock-gui/mock-history"
import { MockSettings } from "@/components/z0tz/mock-gui/mock-settings"
import { MockPermanentStealths } from "@/components/z0tz/mock-gui/mock-permanent-stealths"
import { MockOnboarding } from "@/components/z0tz/mock-gui/mock-onboarding"
import { DemoBadge } from "@/components/z0tz/mock-gui/demo-badge"

export default function AppPage() {
  const [page, setPage] = useState("dashboard")
  const [unlocked, setUnlocked] = useState(false)

  if (!unlocked) {
    return (
      <>
        <MockOnboarding onUnlocked={() => setUnlocked(true)} />
        <DemoBadge />
      </>
    )
  }

  return (
    <div className="app-shell">
      <MockSidebar
        activePage={page}
        onNavigate={setPage}
        onLock={() => { setUnlocked(false); setPage("dashboard") }}
      />
      <div className="mock-content">
        {page === "dashboard"          && <MockDashboard onNavigate={setPage} />}
        {page === "cashin"             && <MockCashIn />}
        {page === "cashout"            && <MockCashOut />}
        {page === "bridge"             && <MockBridge />}
        {page === "permanentStealths"  && <MockPermanentStealths />}
        {page === "history"            && <MockHistory />}
        {page === "settings"           && <MockSettings />}
      </div>
      <DemoBadge />
    </div>
  )
}
