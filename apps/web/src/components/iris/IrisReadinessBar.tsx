'use client'

interface IrisReadinessBarProps {
  readiness: number
  compact?: boolean
}

export function IrisReadinessBar({ readiness, compact = false }: IrisReadinessBarProps) {
  const color =
    readiness >= 80 ? '#22c55e' : readiness >= 50 ? '#f59e0b' : '#ef4444'

  const label =
    readiness >= 80
      ? 'Ready to execute'
      : readiness >= 50
      ? 'Blueprint building'
      : 'Gathering context'

  const missingText =
    readiness < 50
      ? 'Need: goals, users, scope'
      : readiness < 80
      ? 'Need: timeline, budget'
      : ''

  return (
    <div className={`iris-rb${compact ? ' iris-rb--compact' : ''}`}>
      <div className="iris-rb-header">
        <span className="iris-rb-title">IRIS understands</span>
        <span className="iris-rb-pct" style={{ color }}>{readiness}%</span>
      </div>
      <div className="iris-rb-track">
        <div
          className="iris-rb-fill"
          style={{ width: `${readiness}%`, background: color }}
          role="progressbar"
          aria-valuenow={readiness}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {!compact && (
        <div className="iris-rb-footer">
          <span className="iris-rb-label" style={{ color }}>{label}</span>
          {missingText && <span className="iris-rb-missing">{missingText}</span>}
        </div>
      )}
    </div>
  )
}
