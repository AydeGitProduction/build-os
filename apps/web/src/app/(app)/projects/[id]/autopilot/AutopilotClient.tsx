'use client'
/**
 * AutopilotClient — full-screen execution mode shell.
 * Layout: [MiniSidebar 64px] | [WizardPanel] | [PreviewPanel]
 *         ExecutionTopBar pinned top, LogStream drawer bottom.
 *
 * Fixes applied (P9C-DEBUG):
 * - No outer sidebar (AppShell wraps in fixed inset-0, suppresses app sidebar)
 * - Panels fill available width correctly (flex-1 each)
 * - Smooth fade+slide transitions (200ms) on mobile panel switch
 * - Both panels always mounted on desktop (no unmount flash)
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
import { MessageSquare, Eye, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId:   string
  projectName: string
  userId:      string
}

export default function AutopilotClient({ projectId, projectName, userId }: Props) {
  const [activePanel, setActivePanel] = useState<'wizard' | 'preview' | 'logs'>('wizard')

  return (
    <AutopilotProvider projectId={projectId}>
      {/* h-full fills the fixed inset-0 container provided by AppShell */}
      <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden">

        {/* ── Execution Top Bar ──────────────────────────────────────────────── */}
        <ExecutionTopBar projectName={projectName} />

        {/* ── Main content area ──────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Mini sidebar — 64px icon rail, desktop only */}
          <div className="hidden md:flex flex-shrink-0">
            <MiniSidebar
              projectId={projectId}
              activePanel={activePanel}
              onPanel={setActivePanel}
            />
          </div>

          {/* ── Desktop: both panels always visible, side by side ────────────── */}
          <div className="hidden md:flex flex-1 min-w-0 overflow-hidden">

            {/* Wizard Panel — left, flex-1 */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden border-r border-slate-800 transition-all duration-200 ease-in-out">
              <IrisWorkspace userId={userId} projectId={projectId} />
            </div>

            {/* Preview Panel — right, flex-1 */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden transition-all duration-200 ease-in-out">
              <AutopilotPreviewPanel projectId={projectId} />
            </div>
          </div>

          {/* ── Mobile: single active panel with fade transition ─────────────── */}
          <div className="flex md:hidden flex-1 min-h-0 overflow-hidden">
            <div
              key={activePanel}
              className="flex flex-col flex-1 min-h-0 overflow-hidden animate-fade-in"
            >
              {activePanel === 'wizard'  && <IrisWorkspace userId={userId} projectId={projectId} />}
              {activePanel === 'preview' && <AutopilotPreviewPanel projectId={projectId} />}
              {activePanel === 'logs' && (
                <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-400 text-sm p-4">
                  Expand the Logs drawer at the bottom ↓
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Log Stream — bottom drawer ─────────────────────────────────────── */}
        <LogStream projectId={projectId} />

        {/* ── Mobile bottom tab bar ──────────────────────────────────────────── */}
        <MobileTabBar active={activePanel} onChange={setActivePanel} />
      </div>
    </AutopilotProvider>
  )
}

// ─── Mobile Tab Bar ───────────────────────────────────────────────────────────

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
    <nav
      className="md:hidden flex border-t border-slate-800 bg-slate-950 flex-shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center py-2 gap-1 text-xs font-medium transition-colors duration-200',
            active === key ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </nav>
  )
}
