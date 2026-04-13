"use client"

import "./mock-gui.css"
import { useState } from "react"
import { MockSidebar } from "@/components/z0tz/mock-gui/mock-sidebar"
import { MockDashboard } from "@/components/z0tz/mock-gui/mock-dashboard"
import { MockSend } from "@/components/z0tz/mock-gui/mock-send"
import { MockBridge } from "@/components/z0tz/mock-gui/mock-bridge"
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
      </div>
      <DemoBadge />
    </div>
  )
}
