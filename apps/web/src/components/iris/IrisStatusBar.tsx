'use client'

interface IrisStatusBarProps {
  readiness: number
  messageCount: number
}

export function IrisStatusBar({ readiness, messageCount }: IrisStatusBarProps) {
  const readinessColor =
    readiness >= 80 ? '#22c55e' : readiness >= 50 ? '#f59e0b' : '#ef4444'

  const readinessLabel =
    readiness >= 80 ? 'Ready to execute' : readiness >= 50 ? 'Building blueprint' : 'Gathering context'

  return (
    <div className="iris-status-bar">
      {/* Left: Brand + session */}
      <div className="iris-status-left">
        <div className="iris-logo">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="#6366f1" strokeWidth="2" />
            <circle cx="10" cy="10" r="4" fill="#6366f1" />
          </svg>
          <span className="iris-brand">IRIS</span>
        </div>
        <div className="iris-breadcrumb">
          <span className="iris-crumb-sep">/</span>
          <span className="iris-crumb">New Project</span>
          {messageCount > 0 && (
            <>
              <span className="iris-crumb-sep">/</span>
              <span className="iris-crumb muted">
                {messageCount} exchange{messageCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Readiness pill */}
      <div>
        <div
          className="iris-readiness-pill"
          style={{
            background: `color-mix(in srgb, ${readinessColor} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${readinessColor} 30%, transparent)`,
          }}
        >
          <div
            className="iris-readiness-dot"
            style={{ background: readinessColor }}
          />
          <span className="iris-readiness-pct" style={{ color: readinessColor }}>
            {readiness}%
          </span>
          <span className="iris-readiness-label">{readinessLabel}</span>
        </div>
      </div>
    </div>
  )
}
