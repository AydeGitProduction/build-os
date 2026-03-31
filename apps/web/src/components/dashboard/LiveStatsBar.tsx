'use client'
/**
 * LiveStatsBar — real-time stats bar for Dashboard Mode
 * Polls /api/orchestrate/status every 30s
 * Shows: Total / Completed / In Progress / Blocked / Active Agents
 *
 * WS3 — Dashboard Mode
 */

import { useOrchestration } from '@/hooks/useOrchestration'
import { CheckCircle2, Zap, AlertTriangle, Cpu, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon:    React.ElementType
  label:   string
  value:   number | string
  color?:  string
  bg?:     string
  pulse?:  boolean
}

function StatCard({ icon: Icon, label, value, color = 'text-slate-600', bg = 'bg-slate-100', pulse }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm min-w-0">
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon className={cn('h-4.5 w-4.5', color, pulse && 'animate-pulse')} />
      </div>
      <div className="min-w-0">
        <p className="text-2xs text-slate-500 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  )
}

interface LiveStatsBarProps {
  projectId:   string
  staticTotal: number
}

export default function LiveStatsBar({ projectId, staticTotal }: LiveStatsBarProps) {
  const { status, loading } = useOrchestration({ projectId, pollingMs: 30_000 })

  const { task_counts, active_agents } = status
  const total      = task_counts.total       || staticTotal
  const completed  = task_counts.completed   || 0
  const inProgress = task_counts.in_progress || 0
  const blocked    = task_counts.blocked     || 0
  const agents     = active_agents?.length   || 0

  if (loading && total === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard icon={Activity}     label="Total Tasks"  value={total}      color="text-slate-600"  bg="bg-slate-100" />
      <StatCard icon={CheckCircle2} label="Completed"    value={completed}  color="text-emerald-600" bg="bg-emerald-50" />
      <StatCard icon={Zap}          label="In Progress"  value={inProgress} color="text-amber-600"  bg="bg-amber-50"  pulse={inProgress > 0} />
      <StatCard icon={AlertTriangle} label="Blocked"     value={blocked}    color={blocked > 0 ? 'text-red-600' : 'text-slate-400'} bg={blocked > 0 ? 'bg-red-50' : 'bg-slate-100'} />
      <StatCard icon={Cpu}          label="Agents Active" value={agents}    color="text-brand-600"  bg="bg-brand-50"  pulse={agents > 0} />
    </div>
  )
}
