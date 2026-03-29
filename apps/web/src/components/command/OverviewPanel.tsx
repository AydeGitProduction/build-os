'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import ProgressBar from '@/components/ui/ProgressBar'
import { formatUSD, formatRelative, percentage } from '@/lib/utils'
import {
  CheckCircle, AlertTriangle, DollarSign, Zap, Shield,
  TrendingUp, Clock, Users, XCircle, Circle,
  Rocket, RefreshCw, ChevronRight,
} from 'lucide-react'

// ── Phase 2 Launch Panel ───────────────────────────────────────────────────────
function Phase2Panel({ projectId }: { projectId: string }) {
  const [status, setStatus]   = useState<'idle' | 'loading' | 'seeding' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Check if Phase 2 already seeded
    const supabase = createClient()
    supabase
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .eq('title', 'AI Product Intelligence')
      .limit(1)
      .then(({ data }) => {
        setStatus(data && data.length > 0 ? 'done' : 'idle')
      })
  }, [projectId])

  async function seedPhase2() {
    setStatus('seeding')
    try {
      const res = await fetch(`/api/projects/${projectId}/seed-phase2-roadmap`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setStatus('done')
        setMessage(`Phase 2 seeded: ${json.data.tasks_seeded} tasks across ${json.data.epics_seeded} epics. ${json.data.tasks_ready} tasks ready to dispatch.`)
      } else {
        setStatus(json.data?.code === 'ALREADY_SEEDED' ? 'done' : 'error')
        setMessage(json.error || 'Failed to seed Phase 2')
      }
    } catch {
      setStatus('error')
      setMessage('Network error — please try again')
    }
  }

  if (status === 'loading') return null
  if (status === 'done') return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
      <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-800">Phase 2 Active</p>
        <p className="text-xs text-emerald-600 mt-0.5 truncate">
          {message || 'AI Product Intelligence, Self-Improving Loop, Customer Funnel, Code Generation & Marketplace are in the queue.'}
        </p>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 flex items-start gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shrink-0">
        <Rocket className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-900">Phase 2 Ready to Launch</p>
        <p className="text-xs text-brand-700 mt-1 leading-relaxed">
          55 new tasks across 5 epics: AI Product Intelligence · Self-Improving Loop · Customer Funnel · Code Generation · Platform Marketplace
        </p>
        {status === 'error' && (
          <p className="text-xs text-red-600 mt-1 font-medium">{message}</p>
        )}
      </div>
      <button
        onClick={seedPhase2}
        disabled={status === 'seeding'}
        className="flex items-center gap-1.5 rounded-xl bg-brand-600 text-white text-xs font-semibold px-3.5 py-2 hover:bg-brand-700 disabled:opacity-60 transition-colors shrink-0"
      >
        {status === 'seeding'
          ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Seeding…</>
          : <><Rocket className="h-3.5 w-3.5" />Start Phase 2<ChevronRight className="h-3.5 w-3.5" /></>
        }
      </button>
    </div>
  )
}

interface Props {
  projectId: string
  project: {
    id: string
    name: string
    status: string
    target_date?: string | null
    start_date?: string | null
    updated_at: string
  }
  initialStats: {
    totalTasks: number
    completedTasks: number
    blockedTasks: number
    inProgressTasks: number
    estimatedCost: number
    actualCost: number
  }
}

interface LiveStats {
  totalTasks: number
  completedTasks: number
  blockedTasks: number
  inProgressTasks: number
  pendingTasks: number
  failedTasks: number
  estimatedCost: number
  actualCost: number
  qaPassRate: number
  activeAgents: number
}

function healthScore(completed: number, total: number, blocked: number): number {
  if (total === 0) return 0
  return Math.round((completed / total) * 70 + Math.max(0, 30 - (blocked / Math.max(total, 1)) * 30))
}

function HealthBadge({ score }: { score: number }) {
  const isHealthy = score >= 80
  const isAtRisk  = score >= 60 && score < 80
  const color  = isHealthy ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                 isAtRisk  ? 'bg-amber-50  text-amber-700  border-amber-200'  :
                             'bg-red-50    text-red-700    border-red-200'
  const dot    = isHealthy ? 'bg-emerald-500' : isAtRisk ? 'bg-amber-500' : 'bg-red-500'
  const label  = isHealthy ? 'Healthy' : isAtRisk ? 'At risk' : 'Critical'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label} · {score}
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
  iconBg: string
  pulse?: boolean
  highlight?: boolean
}

function StatCard({ label, value, icon: Icon, iconColor, iconBg, pulse, highlight }: StatCardProps) {
  return (
    <div className={`flex flex-col rounded-xl p-4 border transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 ${
      highlight ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'
    }`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg mb-3 ${iconBg}`}>
        {pulse ? (
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${iconBg.replace('bg-', 'bg-')}`} />
            <Icon className={`h-4 w-4 ${iconColor} relative z-10`} />
          </span>
        ) : (
          <Icon className={`h-4 w-4 ${iconColor}`} />
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-1.5 font-medium">{label}</p>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function OverviewSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 space-y-4">
        <div className="h-4 bg-slate-100 rounded w-48" />
        <div className="h-3 bg-slate-100 rounded w-72" />
        <div className="h-4 bg-slate-100 rounded-full w-full mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}

const STATUS_CONFIG: Record<string, { label: string; pulse: boolean; dot: string }> = {
  building:    { label: 'Building',  pulse: true,  dot: 'bg-amber-500' },
  in_progress: { label: 'Building',  pulse: true,  dot: 'bg-amber-500' },
  qa:          { label: 'In QA',     pulse: true,  dot: 'bg-purple-500' },
  ready:       { label: 'Ready',     pulse: false, dot: 'bg-emerald-500' },
  live:        { label: 'Live',      pulse: true,  dot: 'bg-emerald-500' },
  active:      { label: 'Active',    pulse: true,  dot: 'bg-brand-500' },
  draft:       { label: 'Draft',     pulse: false, dot: 'bg-slate-400' },
}

export default function OverviewPanel({ projectId, project, initialStats }: Props) {
  const [stats, setStats]   = useState<LiveStats>({
    ...initialStats,
    pendingTasks: 0,
    failedTasks:  0,
    qaPassRate:   100,
    activeAgents: 0,
  })
  const [ready, setReady]   = useState(false)
  const supabase = createClient()

  const fetchLive = useCallback(async () => {
    const [taskRes, costRes, agentRes, verdictRes] = await Promise.all([
      supabase.from('tasks').select('status, estimated_cost_usd').eq('project_id', projectId) as any,
      supabase.from('cost_events').select('total_cost_usd').eq('project_id', projectId) as any,
      supabase.from('tasks').select('agent_role').eq('project_id', projectId).eq('status', 'in_progress') as any,
      supabase.from('qa_verdicts').select('verdict').eq('project_id', projectId) as any,
    ])

    const tasks: any[]    = (taskRes.data as any) || []
    const costRows: any[] = (costRes.data as any) || []
    const agents: any[]   = (agentRes.data as any) || []
    const verdicts: any[] = (verdictRes.data as any) || []

    const passCount  = verdicts.filter((v: any) => v.verdict === 'pass').length
    const qaPassRate = verdicts.length > 0 ? Math.round((passCount / verdicts.length) * 100) : 100

    setStats({
      totalTasks:      tasks.length,
      completedTasks:  tasks.filter((t: any) => t.status === 'completed').length,
      blockedTasks:    tasks.filter((t: any) => t.status === 'blocked').length,
      inProgressTasks: tasks.filter((t: any) => ['in_progress', 'dispatched'].includes(t.status)).length,
      pendingTasks:    tasks.filter((t: any) => ['pending', 'ready'].includes(t.status)).length,
      failedTasks:     tasks.filter((t: any) => t.status === 'failed').length,
      estimatedCost:   tasks.reduce((s: number, t: any) => s + (Number(t.estimated_cost_usd) || 0), 0),
      actualCost:      costRows.reduce((s: number, c: any) => s + (Number(c.total_cost_usd) || 0), 0),
      qaPassRate,
      activeAgents:    new Set(agents.map((a: any) => a.agent_role)).size,
    })
    setReady(true)
  }, [projectId])

  useEffect(() => {
    fetchLive()
    const iv = setInterval(fetchLive, 15_000)
    return () => clearInterval(iv)
  }, [fetchLive])

  if (!ready) return <OverviewSkeleton />

  const progress   = percentage(stats.completedTasks, stats.totalTasks)
  const health     = healthScore(stats.completedTasks, stats.totalTasks, stats.blockedTasks)
  const budgetPct  = stats.estimatedCost > 0
    ? Math.min(100, Math.round((stats.actualCost / stats.estimatedCost) * 100))
    : 0
  const statusCfg  = STATUS_CONFIG[project.status] || { label: project.status, pulse: false, dot: 'bg-slate-400' }

  const statCards: StatCardProps[] = [
    {
      label: 'Completed',
      value: `${stats.completedTasks} / ${stats.totalTasks}`,
      icon: CheckCircle,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Active agents',
      value: stats.activeAgents,
      icon: Users,
      iconColor: 'text-brand-600',
      iconBg: 'bg-brand-50',
      pulse: stats.activeAgents > 0,
    },
    {
      label: 'In progress',
      value: stats.inProgressTasks,
      icon: Zap,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50',
    },
    {
      label: 'Pending',
      value: stats.pendingTasks,
      icon: Circle,
      iconColor: 'text-slate-500',
      iconBg: 'bg-slate-100',
    },
    {
      label: 'Blockers',
      value: stats.blockedTasks,
      icon: AlertTriangle,
      iconColor: stats.blockedTasks > 0 ? 'text-red-600' : 'text-slate-400',
      iconBg:    stats.blockedTasks > 0 ? 'bg-red-50'   : 'bg-slate-50',
      highlight: stats.blockedTasks > 0,
    },
    {
      label: 'Cost spent',
      value: formatUSD(stats.actualCost),
      icon: DollarSign,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Status + progress card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            {/* Status line */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                {statusCfg.pulse && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusCfg.dot}`} />
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusCfg.dot}`} />
                  </span>
                )}
                <span className="text-sm font-bold text-slate-800">{statusCfg.label}</span>
              </div>
              <HealthBadge score={health} />
              {stats.qaPassRate < 100 && (
                <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                  QA {stats.qaPassRate}%
                </span>
              )}
            </div>
            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {project.start_date && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Started {new Date(project.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {project.target_date && (
                <span className="flex items-center gap-1 text-slate-500 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  Target {new Date(project.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
              <span>Updated {formatRelative(project.updated_at)}</span>
            </div>
          </div>

          {/* Big progress number */}
          <div className="text-right shrink-0">
            <p className="text-4xl font-black text-slate-900 tabular-nums leading-none">{progress}<span className="text-xl text-slate-400 font-bold">%</span></p>
            <p className="text-xs text-slate-400 mt-1">Complete</p>
          </div>
        </div>

        {/* Progress bar — large */}
        <div className="space-y-2 mb-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span><span className="font-semibold text-slate-700">{stats.completedTasks}</span> of <span className="font-semibold text-slate-700">{stats.totalTasks}</span> tasks completed</span>
            {stats.failedTasks > 0 && (
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <XCircle className="h-3 w-3" />
                {stats.failedTasks} failed
              </span>
            )}
          </div>
          <ProgressBar value={progress} size="lg" color={progress === 100 ? 'green' : 'brand'} />
        </div>

        {/* Budget bar */}
        {stats.estimatedCost > 0 && (
          <div className="mt-4 space-y-1.5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-slate-500">
                <DollarSign className="h-3 w-3" />
                Budget utilization
              </span>
              <span className="text-slate-600 font-semibold">
                {formatUSD(stats.actualCost)}
                <span className="text-slate-400 font-normal"> / {formatUSD(stats.estimatedCost)} est.</span>
              </span>
            </div>
            <ProgressBar value={budgetPct} size="sm" color={budgetPct > 90 ? 'red' : budgetPct > 70 ? 'amber' : 'green'} />
          </div>
        )}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(card => <StatCard key={card.label} {...card} />)}
      </div>

      {/* Phase 2 launch — always visible, smart state */}
      <Phase2Panel projectId={projectId} />
    </div>
  )
}
