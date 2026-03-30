'use client'

import { useRef, useEffect } from 'react'
import { IrisChat } from './IrisChat'
import { IrisPreviewPanel } from './IrisPreviewPanel'
import { IrisReadinessBar } from './IrisReadinessBar'
import type { IrisMessage, IrisPreviewData } from './IrisWorkspace'

type Tab = 'chat' | 'preview' | 'plan'

interface IrisMobileTabsProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  messages: IrisMessage[]
  isTyping: boolean
  onSend: (content: string) => void
  readiness: number
  previewData: IrisPreviewData | null
  isBuilding: boolean
}

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'chat',    label: 'Chat',    icon: '💬' },
  { id: 'preview', label: 'Preview', icon: '👁' },
  { id: 'plan',    label: 'Plan',    icon: '📋' },
]

export function IrisMobileTabs({
  activeTab,
  onTabChange,
  messages,
  isTyping,
  onSend,
  readiness,
  previewData,
  isBuilding,
}: IrisMobileTabsProps) {
  const startXRef = useRef<number | null>(null)
  const tabOrder: Tab[] = ['chat', 'preview', 'plan']

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      startXRef.current = e.touches[0].clientX
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (startXRef.current === null) return
      const delta = e.changedTouches[0].clientX - startXRef.current
      const currentIdx = tabOrder.indexOf(activeTab)

      if (Math.abs(delta) > 50) {
        if (delta < 0 && currentIdx < tabOrder.length - 1) {
          onTabChange(tabOrder[currentIdx + 1])
        } else if (delta > 0 && currentIdx > 0) {
          onTabChange(tabOrder[currentIdx - 1])
        }
      }
      startXRef.current = null
    }

    const el = document.querySelector('.iris-mobile-content')
    if (el) {
      el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
      el.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true })
      return () => {
        el.removeEventListener('touchstart', handleTouchStart as EventListener)
        el.removeEventListener('touchend', handleTouchEnd as EventListener)
      }
    }
  }, [activeTab, onTabChange, tabOrder])

  return (
    <div className="iris-mobile">
      {/* Tab content */}
      <div className="iris-mobile-content">
        {activeTab === 'chat' && (
          <IrisChat
            messages={messages}
            isTyping={isTyping}
            onSend={onSend}
            readiness={readiness}
            compact
          />
        )}
        {activeTab === 'preview' && (
          <IrisPreviewPanel
            data={previewData}
            readiness={readiness}
            isBuilding={isBuilding}
          />
        )}
        {activeTab === 'plan' && (
          <div className="iris-mobile-plan">
            <IrisReadinessBar readiness={readiness} />
            <div className="iris-mobile-plan-steps">
              <p className="iris-mobile-plan-hint">
                {readiness === 0
                  ? 'Start chatting to generate your execution plan.'
                  : `Plan is ${readiness}% complete. Keep chatting to refine it.`}
              </p>
              {readiness > 0 && (
                <div className="iris-mobile-plan-timeline">
                  {['Discovery', 'Build', 'Test', 'Launch'].map((step, i) => (
                    <div key={step} className="iris-mobile-plan-step">
                      <div
                        className={`iris-plan-dot${readiness > i * 25 ? ' iris-plan-dot--active' : ''}`}
                      />
                      <span className="iris-plan-step-label">{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <nav className="iris-mobile-tabs" role="tablist" aria-label="Wizard sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`iris-mobile-tab${activeTab === tab.id ? ' iris-mobile-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="iris-tab-icon">{tab.icon}</span>
            <span className="iris-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
