"use client"

export function MockCashIn() {
  return (
    <div>
      <h1 className="mock-page-title">Cash In</h1>
      <p className="mock-page-subtitle">Receive USDC into your private wallet</p>

      <div className="mock-card" style={{ maxWidth: 500, marginBottom: 24, borderLeft: "3px solid #E63946", background: "rgba(230, 57, 70, 0.06)" }}>
        <p style={{ fontSize: 13, color: "#8A8A8A", margin: 0 }}>
          Send USDC to a stealth address, then sweep into your encrypted balance.
        </p>
      </div>

      <div className="mock-card" style={{ maxWidth: 500 }}>
        <div className="mock-card-title">Your Stealth Address</div>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(245, 245, 245, 0.12)",
          borderRadius: 12,
          padding: "10px 16px",
          marginBottom: 24,
          fontFamily: "inherit",
          fontSize: 14,
          color: "#F5F5F5",
        }}>
          <span>0x8dB4...93Ad</span>
          <button className="mock-btn mock-btn-sm" style={{ marginLeft: 12 }}>Copy</button>
        </div>

        <div className="mock-card-title">Scan for Deposits</div>
        <button className="mock-btn" style={{ marginBottom: 8 }}>Scan Announcements</button>
        <p style={{ fontSize: 11, color: "#8A8A8A", margin: 0 }}>
          After funding the stealth address, click scan to detect and sweep your deposit.
        </p>
      </div>
    </div>
  )
}
