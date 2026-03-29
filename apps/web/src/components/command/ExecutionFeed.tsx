'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import {
  Play, CheckCircle, Shield, ShieldCheck, ShieldX,
  AlertTriangle, Plug, DollarSign, RefreshCw, Filter,
  Zap,
} from 'lucide-react'
import { AGENT_IDENTITIES, getAgent } from './agent-identities'

interface FeedEvent {
  id: string
  type: 'task_started' | 'task_completed' | 'qa_pass' | 'qa_fail' | 'blocker' | 'integration' | 'cost'
  taskTitle?: string
  agentRole?: string
  detail?: string
  score?: number
  ts: string
  isNew?: boolean
}

// ── Time grouping ─────────────────────────────────────────────────────────────
function timeGroup(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60)    return 'Just now'
  if (diff < 300)   return 'Last 5 minutes'
  if (diff < 1800)  return 'Last 30 minutes'
  if (diff < 3600)  return 'Last hour'
  if (diff < 86400) return 'Today'
  return 'Earlier'
}

// ── Event icon + style map ────────────────────────────────────────────────────
function EventBullet({ type }: { type: FeedEvent['type'] }) {
  const configs: Record<FeedEvent['type'], { icon: React.ElementType; iconClass: string; bg: string }> = {
    task_started:  { icon: Play,       iconClass: 'text-blue-500',   bg: 'bg-blue-50 border-blue-100' },
    task_completed:{ icon: CheckCircle,iconClass: 'text-emerald-500',bg: 'bg-emerald-50 border-emerald-100' },
    qa_pass:       { icon: ShieldCheck,iconClass: 'text-emerald-600',bg: 'bg-emerald-50 border-emerald-100' },
    qa_fail:       { icon: ShieldX,   iconClass: 'text-red-500',    bg: 'bg-red-50 border-red-100' },
    blocker:       { icon: AlertTriangle,iconClass:'text-red-500',   bg: 'bg-red-50 border-red-100' },
    integration:   { icon: Plug,       iconClass: 'text-purple-500', bg: 'bg-purple-50 border-purple-100' },
    cost:          { icon: DollarSign, iconClass: 'text-amber-500',  bg: 'bg-amber-50 border-amber-100' },
  }
  const { icon: Icon, iconClass, bg } = configs[type]
  return (
    <div className={`flex h-6 w-6 items-center justify-center rounded-md border shrink-0 ${bg}`}>
      <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
    </div>
  )
}

function eventLabel(ev: FeedEvent): { primary: string; agentLabel?: string } {
  const agent = ev.agentRole ? getAgent(ev.agentRole) : null
  const agentLabel = agent ? agent.shortName : undefined
  const task = ev.taskTitle ? `"${ev.taskTitle}"` : 'a task'

  if (ev.type === 'task_started')   return { primary: `started ${task}`, agentLabel }
  if (ev.type === 'task_completed') return { primary: `completed ${task}`, agentLabel }
  if (ev.type === 'qa_pass')        return { primary: `QA PASS · ${task}${ev.score != null ? ` (${ev.score}/100)` : ''}`, agentLabel }
  if (ev.type === 'qa_fail')        return { primary: `QA FAIL · ${task}`, agentLabel }
  if (ev.type === 'blocker')        return { primary: `Blocked on ${task}`, agentLabel }
  if (ev.type === 'integration')    return { primary: ev.detail || 'Integration event', agentLabel }
  if (ev.type === 'cost')           return { primary: ev.detail || 'Cost event', agentLabel }
  return { primary: ev.detail || 'Event', agentLabel }
}

// ── Filter pill ───────────────────────────────────────────────────────────────
const FILTER_OPTIONS = [
  { value: 'all',                   label: 'All' },
  ...AGENT_IDENTITIES.map(a => ({ value: a.role, label: a.shortName })),
]

interface Props {
  projectId: string
}

export default function ExecutionFeed({ projectId }: Props) {
  const [events, setEvents]           = useState<FeedEvent[]>([])
  const [filter, setFilter]           = useState('all')
  const [showFilter, setShowFilter]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const prevIds = useRef<Set<string>>(new Set())
  const supabase = createClient()

  const fetchEvents = useCallback(async () => {
    const [runsRes, verdictsRes, blockedRes] = await Promise.all([
      supabase
        .from('task_runs')
        .select('id, agent_role, status, started_at, completed_at, task_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(60) as any,
      supabase
        .from('qa_verdicts')
        .select('id, task_id, verdict, score, created_at, reviewed_by_agent')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(30) as any,
      supabase
        .from('tasks')
        .select('id, title, status, agent_role, updated_at')
        .eq('project_id', projectId)
        .eq('status', 'blocked')
        .order('updated_at', { ascending: false })
        .limit(10) as any,
    ])

    const runs: any[]     = (runsRes.data as any) || []
    const verdicts: any[] = (verdictsRes.data as any) || []
    const blocked: any[]  = (blockedRes.data as any) || []

    const taskIds = [...new Set([
      ...runs.map((r: any) => r.task_id),
      ...verdicts.map((v: any) => v.task_id),
    ])]
    const taskMap: Record<string, string> = {}
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title')
        .in('id', taskIds) as any
      for (const t of (tasks as any[] || [])) taskMap[t.id] = t.title
    }

    const feedEvents: FeedEvent[] = []
    const newIds = new Set<string>()

    for (const run of runs) {
      if (run.started_at) {
        const id = `start-${run.id}`
        newIds.add(id)
        feedEvents.push({
          id,
          type: 'task_started',
          agentRole: run.agent_role,
          taskTitle: taskMap[run.task_id],
          ts: run.started_at,
          isNew: !prevIds.current.has(id),
        })
      }
      if (run.status === 'completed' && run.completed_at) {
        const id = `done-${run.id}`
        newIds.add(id)
        feedEvents.push({
          id,
          type: 'task_completed',
          agentRole: run.agent_role,
          taskTitle: taskMap[run.task_id],
          ts: run.completed_at,
          isNew: !prevIds.current.has(id),
        })
      }
    }

    for (const v of verdicts) {
      const id = `qa-${v.id}`
      newIds.add(id)
      feedEvents.push({
        id,
        type: v.verdict === 'pass' ? 'qa_pass' : 'qa_fail',
        agentRole: v.reviewed_by_agent,
        taskTitle: taskMap[v.task_id],
        score: v.score,
        ts: v.created_at,
        isNew: !prevIds.current.has(id),
      })
    }

    for (const t of blocked) {
      const id = `block-${t.id}`
      newIds.add(id)
      feedEvents.push({
        id,
        type: 'blocker',
        agentRole: t.agent_role,
        taskTitle: t.title,
        ts: t.updated_at,
        isNew: !prevIds.current.has(id),
      })
    }

    feedEvents.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    prevIds.current = newIds
    setEvents(feedEvents.slice(0, 80))
    setLastRefresh(new Date())
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 10_000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  const filtered = filter === 'all'
    ? events
    : events.filter(e => e.agentRole === filter)

  // Group by time bucket
  const grouped: { group: string; events: FeedEvent[] }[] = []
  for (const ev of filtered) {
    const g = timeGroup(ev.ts)
    const last = grouped[grouped.length - 1]
    if (!last || last.group !== g) {
      grouped.push({ group: g, events: [ev] })
    } else {
      last.events.push(ev)
    }
  }

  const filterLabel = filter === 'all' ? 'All agents' : (getAgent(filter).shortName)

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-slate-700">Live execution feed</span>
          <span className="text-xs text-slate-400">· {filtered.length} events</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              showFilter
                ? 'bg-brand-50 text-brand-600 border border-brand-200'
                : 'text-slate-500 hover:bg-slate-100 border border-transparent'
            }`}
          >
            <Filter className="h-3 w-3" />
            {filterLabel}
          </button>
          <button
            onClick={fetchEvents}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title={`Refreshed ${formatRelative(lastRefresh.toISOString())}`}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      {showFilter && (
        <div className="mb-3 shrink-0 flex flex-wrap gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setFilter(opt.value); setShowFilter(false) }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                filter === opt.value
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto space-y-0 pr-1" style={{ minHeight: 0 }}>
        {loading && (
          <div className="space-y-2 mt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2.5 animate-pulse">
                <div className="h-6 w-6 rounded-md bg-slate-100 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <div className="h-2.5 bg-slate-100 rounded w-3/4" />
                  <div className="h-2 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Zap className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No events yet</p>
            <p className="text-xs text-slate-300 mt-1">Activity appears as the system executes</p>
          </div>
        )}

        {!loading && grouped.map(({ group, events: groupEvs }) => (
          <div key={group}>
            {/* Time group header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 py-2 bg-white/90 backdrop-blur-sm">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{group}</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

            {/* Events in this group */}
            {groupEvs.map(ev => {
              const { primary, agentLabel } = eventLabel(ev)
              const agent = ev.agentRole ? getAgent(ev.agentRole) : null
              return (
                <div
                  key={ev.id}
                  className={`flex items-start gap-2.5 rounded-lg px-2 py-2 mb-0.5 transition-all duration-300 ${
                    ev.isNew ? 'bg-brand-50/60 animate-none' : 'hover:bg-slate-50'
                  }`}
                >
                  <EventBullet type={ev.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 leading-snug">
                      {agentLabel && agent && (
                        <span className={`font-semibold ${agent.color} mr-1`}>{agentLabel}</span>
                      )}
                      <span className="text-slate-600">{primary}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(ev.ts)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
