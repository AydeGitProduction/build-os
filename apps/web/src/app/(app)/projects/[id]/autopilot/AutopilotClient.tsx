'use client'
/**
 * AutopilotClient — full autopilot mode shell (client component)
 * Layout: [MiniSidebar 64px] | [WizardPanel flex-1] | [PreviewPanel flex-1]
 *         with ExecutionTopBar pinned at top and LogStream drawer at bottom
 *
 * WS4 — Autopilot Mode
 */

import { useState } from 'react'
import { AutopilotProvider } from '@/contexts/AutopilotContext'
import ExecutionTopBar from '@/components/autopilot/ExecutionTopBar'
import MiniSidebar from '@/components/autopilot/MiniSidebar'
import { IrisWorkspace } from '@/components/iris/IrisWorkspace'
import AutopilotPreviewPanel from '@/components/autopilot/AutopilotPreviewPanel'
import LogStream from '@/components/logs/LogStream'

interface Props {
  projectId:   string
  projectName: string
  userId:      string
}

export default function AutopilotClient({ projectId, projectName, userId }: Props) {
  const [activePanel, setActivePanel] = useState<'wizard' | 'preview' | 'logs'>('wizard')
  const [splitRatio, setSplitRatio]   = useState(50) // percent for wizard side

  return (
    <AutopilotProvider projectId={projectId}>
      {/* Full-screen container */}
      <div className="flex flex-col h-screen w-full bg-slate-950 overflow-hidden">

        {/* ── Execution Top Bar ────────────────────────────────────────────── */}
        <ExecutionTopBar projectName={projectName} />

        {/* ── Main content area ────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Mini sidebar (hidden on mobile) */}
          <div className="hidden md:flex flex-shrink-0">
            <MiniSidebar
              projectId={projectId}
              activePanel={activePanel}
              onPanel={setActivePanel}
            />
          </div>

          {/* Split panels (desktop: side by side, mobile: single via tab) */}
          <div className="flex flex-1 min-w-0 overflow-hidden">

            {/* Wizard Panel — left */}
            <div
              className="flex flex-col min-h-0 overflow-hidden border-r border-slate-800 hidden md:flex"
              style={{ width: `${splitRatio}%` }}
            >
              <IrisWorkspace userId={userId} projectId={projectId} />
            </div>

            {/* Preview Panel — right */}
            <div
              className="flex flex-col min-h-0 overflow-hidden hidden md:flex"
              style={{ width: `${100 - splitRatio}%` }}
            >
              <AutopilotPreviewPanel projectId={projectId} />
            </div>

            {/* Mobile: single active panel */}
            <div className="flex flex-col flex-1 md:hidden min-h-0 overflow-hidden">
              {activePanel === 'wizard'  && <IrisWorkspace userId={userId} projectId={projectId} />}
              {activePanel === 'preview' && <AutopilotPreviewPanel projectId={projectId} />}
            </div>
          </div>
        </div>

        {/* ── Log Stream — bottom drawer ───────────────────────────────────── */}
        <LogStream projectId={projectId} />

        {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
        <MobileTabBar active={activePanel} onChange={setActivePanel} />
      </div>
    </AutopilotProvider>
  )
}

// ─── Mobile Tab Bar ───────────────────────────────────────────────────────────

import { MessageSquare, Eye, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

function MobileTabBar({
  active,
  onChange,
}: {
  active: 'wizard' | 'preview' | 'logs'
  onChange: (p: 'wizard' | 'preview' | 'logs') => void
}) {
  const tabs = [
    { key: 'wizard',  label: 'Chat',    icon: MessageSquare },
    { key: 'preview', label: 'Preview', icon: Eye },
    { key: 'logs',    label: 'Logs',    icon: Terminal },
  ] as const

  return (
    <nav className="md:hidden flex border-t border-slate-800 bg-slate-950 flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center py-2 gap-1 text-2xs font-medium transition-colors',
            active === key
              ? 'text-brand-400'
              : 'text-slate-500 hover:text-slate-300'
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </nav>
  )
}
