'use client'
/**
 * AutopilotPreviewPanel — live preview panel in Autopilot Mode right side
 * Tabs: Blueprint / Tasks / Assumptions
 * Real-time polling on active tab data
 * Change highlight animation on new data
 *
 * WS6 — Live Preview (Autopilot context)
 */

import { useState, useEffect, useRef } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { Eye, GitBranch, CheckSquare, Cpu, RefreshCw } from 'lucide-react'

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending:       'bg-slate-700 text-slate-400',
  ready:         'bg-blue-900/60 text-blue-300',
  dispatched:    'bg-violet-900/60 text-violet-300',
  in_progress:   'bg-amber-900/60 text-amber-300',
  awaiting_review: 'bg-indigo-900/60 text-indigo-300',
  in_qa:         'bg-purple-900/60 text-purple-300',
  blocked:       'bg-red-900/60 text-red-300',
  failed:        'bg-red-900/60 text-red-400',
  completed:     'bg-emerald-900/60 text-emerald-300',
  cancelled:     'bg-slate-800 text-slate-600',
}

function StatusChip({ status }: { status: string }) {
  const cls = STATUS_COLOR[status] ?? 'bg-slate-700 text-slate-400'
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-2xs font-medium capitalize', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Blueprint Tab ────────────────────────────────────────────────────────────

interface Blueprint {
  id: string
  summary: string
  goals: string[]
  blueprint_features: { id: string; title: string; priority: string }[]
}

function BlueprintTab({ projectId }: { projectId: string }) {
  const [bp, setBp]         = useState<Blueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const prevId = useRef<string | null>(null)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      // apiGet returns { data: responseBody } — server returns { data: blueprint | null }
      const r = await apiGet<{ data: Blueprint | null }>(`/api/projects/${projectId}/blueprint`)
      if (!mounted) return
      const bp = r.data?.data ?? null   // unwrap server { data: ... } envelope
      if (bp) {
        if (prevId.current && prevId.current !== bp.id) {
          setChanged(true)
          setTimeout(() => setChanged(false), 2000)
        }
        prevId.current = bp.id
        setBp(bp)
      }
      setLoading(false)
    }
    load()
    const t = setInterval(load, 10_000)
    return () => { mounted = false; clearInterval(t) }
  }, [projectId])

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
      <RefreshCw className="h-5 w-5 animate-spin" />
      <span className="text-xs">Loading blueprint…</span>
    </div>
  )
  if (!bp) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <GitBranch className="h-8 w-8 text-slate-700" />
      <p className="text-sm font-medium text-slate-400">No blueprint yet</p>
      <p className="text-xs text-slate-600">Complete the wizard on the left to generate your execution blueprint.</p>
    </div>
  )

  return (
    <div className={cn('p-4 space-y-3 text-sm', changed && 'animate-highlight')}>
      <p className="text-slate-300 text-xs leading-relaxed">{bp.summary}</p>
      {bp.goals?.length > 0 && (
        <div>
          <p className="text-2xs text-slate-500 uppercase font-semibold mb-1">Goals</p>
          <ul className="space-y-1">
            {bp.goals.map((g, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-400">
                <span className="text-brand-500 mt-0.5">•</span>{g}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bp.blueprint_features?.length > 0 && (
        <div>
          <p className="text-2xs text-slate-500 uppercase font-semibold mb-2">Features ({bp.blueprint_features.length})</p>
          <div className="space-y-1">
            {bp.blueprint_features.map(f => (
              <div key={f.id} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/50 text-xs">
                <GitBranch className="h-3 w-3 text-slate-600 flex-shrink-0" />
                <span className="text-slate-300 flex-1 truncate">{f.title}</span>
                <span className={cn('text-2xs px-1.5 rounded',
                  f.priority === 'critical' ? 'text-red-400 bg-red-900/30' :
                  f.priority === 'high'     ? 'text-amber-400 bg-amber-900/30' : 'text-slate-500'
                )}>{f.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab({ projectId }: { projectId: string }) {
  const { tasks, loading } = useTasks({
    projectId,
    status: ['in_progress', 'ready', 'dispatched', 'blocked', 'completed'],
    limit: 60,
    pollingMs: 10_000,
  })

  if (loading && tasks.length === 0) {
    return <div className="p-4 text-xs text-slate-500 animate-pulse">Loading tasks…</div>
  }

  const active   = tasks.filter(t => ['in_progress','dispatched','ready'].includes(t.status))
  const blocked  = tasks.filter(t => t.status === 'blocked')
  const recent   = tasks.filter(t => t.status === 'completed').slice(-10)

  const Section = ({ title, items }: { title: string; items: typeof tasks }) => (
    items.length === 0 ? null : (
      <div className="mb-3">
        <p className="text-2xs text-slate-500 uppercase font-semibold px-3 py-1">{title} ({items.length})</p>
        {items.map(t => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 transition-colors">
            <Cpu className="h-3 w-3 text-slate-600 flex-shrink-0" />
            <span className="flex-1 text-xs text-slate-300 truncate">{t.title}</span>
            <StatusChip status={t.status} />
          </div>
        ))}
      </div>
    )
  )

  return (
    <div className="overflow-y-auto flex-1 py-2">
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-12">
          <CheckSquare className="h-8 w-8 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">No active tasks</p>
          <p className="text-xs text-slate-600">Press Run to start execution and tasks will appear here.</p>
        </div>
      ) : (
        <>
          <Section title="Active" items={active} />
          <Section title="Blocked" items={blocked} />
          <Section title="Recently Completed" items={recent} />
        </>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = 'blueprint' | 'tasks'

export default function AutopilotPreviewPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>('blueprint')

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'blueprint', label: 'Blueprint', icon: GitBranch },
    { key: 'tasks',     label: 'Tasks',     icon: CheckSquare },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <Eye className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-medium text-slate-400 mr-2">Preview</span>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
              tab === key
                ? 'bg-slate-800 text-slate-200'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'blueprint' && <BlueprintTab projectId={projectId} />}
        {tab === 'tasks'     && <TasksTab projectId={projectId} />}
      </div>
    </div>
  )
}
