'use client'

import { useEffect, useRef, useState } from 'react'
import { IrisReadinessBar } from './IrisReadinessBar'
import { IrisAssumptionCards } from './IrisAssumptionCards'
import type { IrisPreviewData } from './IrisWorkspace'

interface IrisPreviewPanelProps {
  data: IrisPreviewData | null
  readiness: number
  isBuilding: boolean
}

type PreviewState = 'EMPTY' | 'BUILDING' | 'PREVIEW'

export function IrisPreviewPanel({ data, readiness, isBuilding }: IrisPreviewPanelProps) {
  const [state, setState] = useState<PreviewState>('EMPTY')
  const [highlightKey, setHighlightKey] = useState(0)
  const prevDataRef = useRef<IrisPreviewData | null>(null)

  useEffect(() => {
    if (isBuilding) {
      setState('BUILDING')
      return
    }
    if (data) {
      if (prevDataRef.current !== null) {
        setHighlightKey((k) => k + 1)
      }
      prevDataRef.current = data
      setState('PREVIEW')
    } else {
      setState('EMPTY')
    }
  }, [data, isBuilding])

  return (
    <div className="iris-pp">
      {state === 'EMPTY' && (
        <div className="iris-pp-empty">
          <div className="iris-pp-empty-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="4 3" />
              <circle cx="20" cy="20" r="8" stroke="#e5e7eb" strokeWidth="2" />
              <circle cx="20" cy="20" r="3" fill="#e5e7eb" />
            </svg>
          </div>
          <p className="iris-pp-empty-title">Blueprint Preview</p>
          <p className="iris-pp-empty-sub">
            Start chatting with IRIS to see your project plan appear here in real time.
          </p>
        </div>
      )}

      {state === 'BUILDING' && (
        <div className="iris-pp-building">
          <div className="iris-pp-building-pulse" />
          <p className="iris-pp-building-text">IRIS is thinking…</p>
          <div className="iris-pp-skeleton">
            <div className="iris-skel iris-skel--title" />
            <div className="iris-skel iris-skel--line" />
            <div className="iris-skel iris-skel--line iris-skel--short" />
            <div className="iris-skel iris-skel--line" />
          </div>
        </div>
      )}

      {state === 'PREVIEW' && data && (
        <div className="iris-pp-content" key={highlightKey}>
          {/* Readiness */}
          <div className="iris-pp-section">
            <IrisReadinessBar readiness={readiness} />
          </div>

          {/* Blueprint header */}
          <div className="iris-pp-section iris-pp-section--highlight">
            <h2 className="iris-pp-project-title">{data.title}</h2>
            <p className="iris-pp-project-desc">{data.description}</p>
          </div>

          {/* Phases */}
          <div className="iris-pp-section">
            <h3 className="iris-pp-section-title">Execution Phases</h3>
            <div className="iris-pp-phases">
              {data.phases.map((phase, i) => (
                <div key={i} className="iris-pp-phase">
                  <div className="iris-pp-phase-num">{i + 1}</div>
                  <div className="iris-pp-phase-info">
                    <span className="iris-pp-phase-label">{phase.label}</span>
                    <span className="iris-pp-phase-dur">{phase.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Assumption cards */}
          {data.assumptions.length > 0 && (
            <IrisAssumptionCards assumptions={data.assumptions} />
          )}
        </div>
      )}
    </div>
  )
}
