'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatRelative } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Clock, ChevronRight } from 'lucide-react'
import { AGENT_IDENTITIES, getAgent } from './agent-identities'

interface AgentStats {
  role: string
  status: 'idle' | 'running' | 'blocked'
  currentTask?: string
  completedCount: number
  lastActivity?: string
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function AgentCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm animate-pulse">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100 shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 bg-slate-100 rounded w-24" />
          <div className="h-2.5 bg-slate-100 rounded w-32" />
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded w-16 mb-3" />
      <div className="h-7 bg-slate-50 rounded w-full mb-3" />
      <div className="flex justify-between">
        <div className="h-2.5 bg-slate-100 rounded w-16" />
        <div className="h-2.5 bg-slate-100 rounded w-14" />
      </div>
    </div>
  )
}

// ── Status indicator ──────────────────────────────────────────────────────────
function StatusPill({ status }: { status: AgentStats['status'] }) {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
        Running
      </span>
    )
  }
  if (status === 'blocked') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <AlertTriangle className="h-3 w-3" />
        Blocked
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      Idle
    </span>
  )
}

interface Props {
  projectId: string
}

export default function AgentRoster({ projectId }: Props) {
  const [agentStats, setAgentStats] = useState<AgentStats[]>([])
  const [loading, setLoading]       = useState(true)
  const supabase = createClient()

  const fetchStats = useCallback(async () => {
    const [taskRes, completedRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('agent_role, status, title, id, updated_at')
        .eq('project_id', projectId)
        .in('status', ['in_progress', 'dispatched', 'blocked', 'awaiting_review', 'in_qa']),
      supabase
        .from('tasks')
        .select('agent_role, completed_at')
        .eq('project_id', projectId)
        .eq('status', 'completed'),
    ])

    const activeTasks: any[]    = (taskRes.data as any) || []
    const completedTasks: any[] = (completedRes.data as any) || []

    const completedByRole: Record<string, number> = {}
    const lastActivityByRole: Record<string, string> = {}
    for (const t of completedTasks) {
      completedByRole[t.agent_role] = (completedByRole[t.agent_role] || 0) + 1
      if (t.completed_at) {
        const prev = lastActivityByRole[t.agent_role]
        if (!prev || new Date(t.completed_at) > new Date(prev)) {
          lastActivityByRole[t.agent_role] = t.completed_at
        }
      }
    }

    const activeByRole: Record<string, { status: AgentStats['status']; task?: string; updatedAt?: string }> = {}
    for (const t of activeTasks) {
      const current = activeByRole[t.agent_role]
      const priority = ['in_progress', 'dispatched', 'in_qa', 'awaiting_review', 'blocked']
      const currentPri = current ? priority.indexOf(current.status === 'running' ? 'in_progress' : 'blocked') : 99
      const thisPri = priority.indexOf(t.status)
      if (!current || thisPri < currentPri) {
        const st: AgentStats['status'] =
          t.status === 'blocked' ? 'blocked' :
          ['in_progress', 'dispatched', 'in_qa', 'awaiting_review'].includes(t.status) ? 'running' : 'idle'
        activeByRole[t.agent_role] = { status: st, task: t.title, updatedAt: t.updated_at }
      }
    }

    setAgentStats(
      AGENT_IDENTITIES.map(a => ({
        role: a.role,
        status: activeByRole[a.role]?.status || 'idle',
        currentTask: activeByRole[a.role]?.task,
        completedCount: completedByRole[a.role] || 0,
        lastActivity: activeByRole[a.role]?.updatedAt || lastActivityByRole[a.role],
      }))
    )
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 12_000)
    return () => clearInterval(interval)
  }, [fetchStats])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 7 }).map((_, i) => <AgentCardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {AGENT_IDENTITIES.map(agent => {
        const stats = agentStats.find(s => s.role === agent.role)!
        const isRunning = stats.status === 'running'
        const isBlocked = stats.status === 'blocked'

        return (
          <Link
            key={agent.role}
            href={`/projects/${projectId}/agents/${agent.role}`}
            className={`group block rounded-xl border bg-white p-4 shadow-sm transition-all duration-200
              hover:shadow-md hover:-translate-y-0.5
              ${isRunning ? 'border-emerald-200 ring-1 ring-emerald-100' :
                isBlocked ? 'border-red-200 ring-1 ring-red-100' :
                'border-slate-200 hover:border-slate-300'
              }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0 ${agent.bg} border ${agent.ring}`}>
                  {agent.emoji}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-tight">{agent.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{agent.description}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-0.5 shrink-0" />
            </div>

            {/* Status */}
            <div className="mb-3">
              <StatusPill status={stats.status} />
            </div>

            {/* Current task */}
            {stats.currentTask ? (
              <p className={`text-xs rounded-lg px-2.5 py-2 truncate mb-3 border ${agent.bg} ${agent.ring} ${agent.color} font-medium`}>
                {stats.currentTask}
              </p>
            ) : (
              <p className="text-xs text-slate-300 rounded-lg px-2.5 py-2 bg-slate-50 mb-3 italic">
                No active task
              </p>
            )}

            {/* Footer stats */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                <span className="font-medium text-slate-600">{stats.completedCount}</span> done
              </span>
              {stats.lastActivity ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelative(stats.lastActivity)}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
