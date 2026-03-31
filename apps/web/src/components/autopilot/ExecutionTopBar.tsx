'use client'
/**
 * ExecutionTopBar — fixed 48px bar at top of Autopilot Mode
 * Shows: phase chip, agents, task queue, health indicator, ETA, bottleneck alert
 * All data from AutopilotContext (single 10s poll — no duplicate fetches)
 *
 * WS7 — Execution Top Bar
 */

import { useState } from 'react'
import { useAutopilot } from '@/contexts/AutopilotContext'
import { useRouter } from 'next/navigation'
import { apiPost } from '@/lib/api/client'
import {
  Play, Pause, Square, RefreshCw, AlertTriangle,
  Activity, Cpu, CheckCircle2, Clock, Zap,
  LayoutDashboard, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Phase Chip ───────────────────────────────────────────────────────────────

const PHASE_CONFIG = {
  idle:      { label: 'Idle',      color: 'bg-slate-700 text-slate-300', dot: 'bg-slate-400' },
  planning:  { label: 'Planning',  color: 'bg-violet-900/60 text-violet-300', dot: 'bg-violet-400 animate-pulse' },
  executing: { label: 'Executing', color: 'bg-brand-900/60 text-brand-300', dot: 'bg-brand-400 animate-pulse' },
  reviewing: { label: 'Reviewing', color: 'bg-amber-900/60 text-amber-300', dot: 'bg-amber-400 animate-pulse' },
  complete:  { label: 'Complete',  color: 'bg-emerald-900/60 text-emerald-300', dot: 'bg-emerald-400' },
  paused:    { label: 'Paused',    color: 'bg-slate-700 text-slate-400', dot: 'bg-slate-500' },
  error:     { label: 'Error',     color: 'bg-red-900/60 text-red-300', dot: 'bg-red-400 animate-pulse' },
} as const

function PhaseChip() {
  const { phase } = useAutopilot()
  const cfg = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium', cfg.color)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </div>
  )
}

// ─── Agents Bar ───────────────────────────────────────────────────────────────

function AgentsBar() {
  const { activeAgents } = useAutopilot()
  const [open, setOpen] = useState(false)
  const count = activeAgents.length

  const grouped = activeAgents.reduce<Record<string, number>>((acc, role) => {
    const label = role.replace(/_engineer|_analyst|_manager/, '').replace(/_/g, ' ')
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-700 transition-colors"
      >
        <Cpu className="h-3.5 w-3.5 text-brand-400" />
        <span>{count} agent{count !== 1 ? 's' : ''}</span>
        {count > 0 && <ChevronDown className="h-3 w-3 text-slate-500" />}
      </button>
      {open && count > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-2 space-y-1 animate-fade-in">
          {Object.entries(grouped).map(([role, n]) => (
            <div key={role} className="flex items-center justify-between px-2 py-1 rounded text-xs">
              <span className="text-slate-300 capitalize">{role}</span>
              <span className="text-brand-400 font-mono">×{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Queue Metric ────────────────────────────────────────────────────────

function TaskQueueMetric() {
  const { taskCounts } = useAutopilot()
  const queue = (taskCounts.pending ?? 0) + (taskCounts.ready ?? 0)
  const active = taskCounts.in_progress ?? 0
  const done   = taskCounts.completed ?? 0

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1 text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-slate-200 font-mono">{queue}</span>
        <span>queued</span>
      </div>
      <div className="flex items-center gap-1 text-slate-400">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-amber-300 font-mono">{active}</span>
        <span>active</span>
      </div>
      <div className="flex items-center gap-1 text-slate-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-emerald-300 font-mono">{done}</span>
        <span>done</span>
      </div>
    </div>
  )
}

// ─── Health Indicator ─────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy:  { dot: 'bg-emerald-400', label: 'Healthy', text: 'text-emerald-400' },
  degraded: { dot: 'bg-amber-400 animate-pulse', label: 'Degraded', text: 'text-amber-400' },
  incident: { dot: 'bg-red-400 animate-pulse', label: 'Incident', text: 'text-red-400' },
} as const

function HealthIndicator() {
  const { health } = useAutopilot()
  const cfg = HEALTH_CONFIG[health]
  return (
    <div className="flex items-center gap-1.5" title={`System ${cfg.label}`}>
      <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
      <span className={cn('text-xs font-medium', cfg.text)}>{cfg.label}</span>
    </div>
  )
}

// ─── Blocked Alert ────────────────────────────────────────────────────────────

function BlockedAlert() {
  const { taskCounts } = useAutopilot()
  const blocked = taskCounts.blocked ?? 0
  if (blocked === 0) return null
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-900/40 border border-red-700/40 text-xs text-red-300">
      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
      <span>{blocked} blocked</span>
    </div>
  )
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function ExecutionControls() {
  const { projectId, runActive, phase, refetch } = useAutopilot()
  const [loading, setLoading] = useState(false)

  const activate = async () => {
    setLoading(true)
    await apiPost(`/api/orchestrate/activate`, { project_id: projectId })
    setTimeout(() => { refetch(); setLoading(false) }, 1000)
  }
  const safeStop = async () => {
    setLoading(true)
    await apiPost(`/api/orchestrate/safe-stop`, { project_id: projectId })
    setTimeout(() => { refetch(); setLoading(false) }, 1000)
  }

  const isRunning = runActive || phase === 'executing' || phase === 'planning'

  return (
    <div className="flex items-center gap-1">
      {!isRunning ? (
        <button
          onClick={activate}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </button>
      ) : (
        <button
          onClick={safeStop}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Pause className="h-3.5 w-3.5" />
          Pause
        </button>
      )}
      <button
        onClick={refetch}
        disabled={loading}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-700 transition-colors"
        title="Refresh status"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
      </button>
    </div>
  )
}

// ─── Mode Switch Button ───────────────────────────────────────────────────────

function ToDashboardButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(`/projects/${projectId}`)}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
      title="Switch to Dashboard"
    >
      <LayoutDashboard className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Dashboard</span>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExecutionTopBar({ projectName }: { projectName: string }) {
  const { projectId } = useAutopilot()

  return (
    <header className="flex h-[48px] w-full items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
      {/* Left: project name + phase */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <span className="text-xs font-semibold text-white truncate max-w-[120px]">{projectName}</span>
        <PhaseChip />
      </div>

      {/* Divider */}
      <span className="h-4 w-px bg-slate-700 flex-shrink-0" />

      {/* Center metrics */}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        <AgentsBar />
        <span className="h-4 w-px bg-slate-800 flex-shrink-0" />
        <TaskQueueMetric />
        <span className="h-4 w-px bg-slate-800 flex-shrink-0" />
        <HealthIndicator />
        <BlockedAlert />
      </div>

      {/* Right: controls + mode switch */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ExecutionControls />
        <span className="h-4 w-px bg-slate-700" />
        <ToDashboardButton projectId={projectId} />
      </div>
    </header>
  )
}
