'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Clock, Eye, CheckCircle2 } from 'lucide-react'
import { getAgent } from './agent-identities'

interface ActiveTask {
  id: string
  title: string
  status: string
  agentRole: string
  startedAt?: string
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function elapsedMs(since?: string): number {
  if (!since) return 0
  return Date.now() - new Date(since).getTime()
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ${s % 60}s ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

function ElapsedTimer({ since }: { since?: string }) {
  const [elapsed, setElapsed] = useState(elapsedMs(since))

  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedMs(since)), 1000)
    return () => clearInterval(id)
  }, [since])

  const isLong = elapsed > 3 * 60 * 1000 // > 3 min

  return (
    <span className={`text-[11px] tabular-nums font-medium ${isLong ? 'text-amber-600' : 'text-slate-400'}`}>
      started {formatElapsed(elapsed)}
    </span>
  )
}

// ── Indeterminate progress bar ─────────────────────────────────────────────────
function IndeterminateBar({ color }: { color: string }) {
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-slate-100 mt-2">
      <div
        className={`absolute inset-y-0 w-1/3 rounded-full ${color}`}
        style={{ animation: 'indeterminate 1.5s ease-in-out infinite' }}
      />
    </div>
  )
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; dot: string; bar: string }> = {
  in_progress:     { label: 'Running',       dot: 'bg-amber-400',  bar: 'bg-amber-400' },
  dispatched:      { label: 'Dispatched',    dot: 'bg-blue-400',   bar: 'bg-blue-400' },
  awaiting_review: { label: 'Awaiting QA',   dot: 'bg-purple-400', bar: 'bg-purple-400' },
  in_qa:           { label: 'In QA',         dot: 'bg-purple-500', bar: 'bg-purple-500' },
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function TaskSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
      <div className="h-8 w-8 rounded-lg bg-slate-100 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="h-3 bg-slate-100 rounded w-3/4" />
        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
        <div className="h-0.5 bg-slate-100 rounded-full w-full" />
      </div>
      <div className="h-2.5 bg-slate-100 rounded w-16 mt-1 shrink-0" />
    </div>
  )
}

interface Props {
  projectId: string
}

export default function ActiveWork({ projectId }: Props) {
  const [tasks, setTasks]   = useState<ActiveTask[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status, agent_role, dispatched_at, updated_at')
      .eq('project_id', projectId)
      .in('status', ['in_progress', 'dispatched', 'awaiting_review', 'in_qa'])
      .order('dispatched_at', { ascending: true, nullsFirst: false })
      .limit(20) as any

    if (data) {
      setTasks((data as any[]).map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        agentRole: t.agent_role,
        startedAt: t.dispatched_at || t.updated_at,
      })))
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 8_000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  if (loading) {
    return (
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 3 }).map((_, i) => <TaskSkeleton key={i} />)}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Zap className="h-6 w-6 text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-500">No active tasks</p>
        <p className="text-xs text-slate-400 mt-1">System is idle or waiting for dispatch</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {tasks.map(task => {
        const agent  = getAgent(task.agentRole)
        const status = STATUS_CONFIG[task.status] || { label: task.status, dot: 'bg-slate-400', bar: 'bg-slate-300' }
        const isPulsing = task.status === 'in_progress' || task.status === 'dispatched'

        return (
          <div key={task.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
            {/* Agent avatar */}
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-base shrink-0 mt-0.5 border ${agent.bg} ${agent.ring}`}>
              {agent.emoji}
            </div>

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate leading-snug">{task.title}</p>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[11px] font-semibold ${agent.color}`}>{agent.shortName}</span>
                <span className="text-slate-200 text-[10px]">·</span>

                {/* Status indicator */}
                <span className="flex items-center gap-1">
                  {isPulsing ? (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${status.dot}`} />
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status.dot}`} />
                    </span>
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${status.dot}`} />
                  )}
                  <span className="text-[11px] text-slate-500">{status.label}</span>
                </span>
              </div>

              {/* Indeterminate progress bar */}
              <IndeterminateBar color={status.bar} />
            </div>

            {/* Elapsed time */}
            <div className="flex items-center gap-1 shrink-0 mt-1">
              <Clock className="h-3 w-3 text-slate-300" />
              <ElapsedTimer since={task.startedAt} />
            </div>
          </div>
        )
      })}

      {/* Footer count */}
      <div className="px-4 py-2.5 flex items-center gap-1.5 text-xs text-slate-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-slate-300" />
        <span><span className="font-semibold text-slate-600">{tasks.length}</span> task{tasks.length !== 1 ? 's' : ''} active · refreshes every 8s</span>
      </div>
    </div>
  )
}
