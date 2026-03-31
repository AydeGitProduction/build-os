'use client'
/**
 * MiniSidebar — 64px icon-only rail for Autopilot Mode
 * Icons: Wizard / Preview / Logs + Mode Switch to Dashboard
 *
 * WS4 — Autopilot Mode
 */

import { useRouter } from 'next/navigation'
import { MessageSquare, Eye, Terminal, LayoutDashboard, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId:   string
  activePanel: 'wizard' | 'preview' | 'logs'
  onPanel:     (p: 'wizard' | 'preview' | 'logs') => void
}

export default function MiniSidebar({ projectId, activePanel, onPanel }: Props) {
  const router = useRouter()

  const navItems = [
    { key: 'wizard',  icon: MessageSquare, label: 'Wizard'  },
    { key: 'preview', icon: Eye,           label: 'Preview' },
    { key: 'logs',    icon: Terminal,      label: 'Logs'    },
  ] as const

  return (
    <nav className="flex flex-col w-[64px] border-r border-slate-800 bg-slate-950 py-3 gap-1 items-center">
      {/* Panel nav */}
      {navItems.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onPanel(key)}
          title={label}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors group relative',
            activePanel === key
              ? 'bg-brand-600/20 text-brand-400'
              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300',
          )}
        >
          <Icon className="h-5 w-5" />
          {/* Tooltip */}
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-slate-800 text-xs text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {label}
          </span>
        </button>
      ))}

      <span className="flex-1" />

      {/* Settings */}
      <button
        onClick={() => router.push(`/projects/${projectId}/settings`)}
        title="Settings"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors group relative"
      >
        <Settings className="h-5 w-5" />
        <span className="absolute left-full ml-2 px-2 py-1 rounded bg-slate-800 text-xs text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
          Settings
        </span>
      </button>

      {/* Dashboard switch */}
      <button
        onClick={() => router.push(`/projects/${projectId}`)}
        title="Dashboard Mode"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors group relative"
      >
        <LayoutDashboard className="h-5 w-5" />
        <span className="absolute left-full ml-2 px-2 py-1 rounded bg-slate-800 text-xs text-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
          Dashboard
        </span>
      </button>
    </nav>
  )
}
