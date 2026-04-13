"use client"

import "./mock-gui.css"
import { useState } from "react"
import { MockSidebar } from "@/components/z0tz/mock-gui/mock-sidebar"
import { MockDashboard } from "@/components/z0tz/mock-gui/mock-dashboard"
import { MockSend } from "@/components/z0tz/mock-gui/mock-send"
import { MockBridge } from "@/components/z0tz/mock-gui/mock-bridge"
import { MockShield } from "@/components/z0tz/mock-gui/mock-shield"
import { MockCashIn } from "@/components/z0tz/mock-gui/mock-cashin"
import { MockCashOut } from "@/components/z0tz/mock-gui/mock-cashout"
import { MockHistory } from "@/components/z0tz/mock-gui/mock-history"
import { MockSettings } from "@/components/z0tz/mock-gui/mock-settings"
import { DemoBadge } from "@/components/z0tz/mock-gui/demo-badge"

export default function AppPage() {
  const [page, setPage] = useState("dashboard")
  return (
    <div className="app-shell">
      <MockSidebar activePage={page} onNavigate={setPage} />
      <div className="mock-content">
        {page === "dashboard" && <MockDashboard onNavigate={setPage} />}
        {page === "send" && <MockSend />}
        {page === "bridge" && <MockBridge />}
        {page === "shield" && <MockShield />}
        {page === "cashin" && <MockCashIn />}
        {page === "cashout" && <MockCashOut />}
        {page === "history" && <MockHistory />}
        {page === "settings" && <MockSettings />}
      </div>
      <DemoBadge />
    </div>
  )
}
