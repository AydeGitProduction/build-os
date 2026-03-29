'use client'

import { useState } from 'react'
import { StatusBadge } from '@/components/ui/Badge'
import { formatRelative, formatUSD } from '@/lib/utils'
import {
  CheckCircle, XCircle, Clock, Shield, FileText,
  Zap, TrendingUp, Code, AlertCircle, ShieldCheck, ShieldX,
} from 'lucide-react'
import { getAgent } from './agent-identities'

// ── Output icon map ────────────────────────────────────────────────────────────
const OUTPUT_ICONS: Record<string, React.ElementType> = {
  code:       Code,
  document:   FileText,
  test:       Shield,
  schema:     Zap,
  qa_verdict: Shield,
  review:     AlertCircle,
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Run {
  id: string
  status: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
  tokens_input?: number
  tokens_output?: number
  model_used?: string
  cost_usd?: number
  error_message?: string
  task_id: string
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  completed_at?: string
  created_at: string
  actual_cost_usd?: number
  estimated_cost_usd?: number
}

interface Verdict {
  id: string
  task_id: string
  verdict: string
  score?: number
  created_at: string
}

interface Output {
  id: string
  output_type: string
  is_valid: boolean
  created_at: string
  task_id: string
}

interface Stats {
  totalTasks: number
  completedTasks: number
  successRate: number
  avgDurationMs: number
}

interface InitialData {
  agentRole: string
  displayName: string
  runs: Run[]
  tasks: Task[]
  verdicts: Verdict[]
  outputs: Output[]
  stats: Stats
}

interface Props {
  projectId: string
  initialData: InitialData
}

type Tab = 'tasks' | 'runs' | 'outputs' | 'qa'

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}

// ── Stat mini card ─────────────────────────────────────────────────────────────
interface StatMiniProps {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

function StatMini({ label, value, icon: Icon, iconColor, iconBg }: StatMiniProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:border-slate-200 hover:bg-white transition-all">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} shrink-0`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div>
        <p className="text-base font-bold text-slate-900 leading-none tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Run status icon ────────────────────────────────────────────────────────────
function RunIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle className="h-4 w-4 text-emerald-500" />
  if (status === 'failed' || status === 'timed_out') return <XCircle className="h-4 w-4 text-red-500" />
  return <Clock className="h-4 w-4 text-amber-400" />
}

export default function AgentDetailView({ projectId, initialData }: Props) {
  const { agentRole, runs, tasks, verdicts, outputs, stats } = initialData
  const [tab, setTab] = useState<Tab>('tasks')

  const agent = getAgent(agentRole)

  const statCards: StatMiniProps[] = [
    {
      label: 'Tasks done',
      value: `${stats.completedTasks}/${stats.totalTasks}`,
      icon: CheckCircle,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Success rate',
      value: `${stats.successRate}%`,
      icon: TrendingUp,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
    },
    {
      label: 'Avg run time',
      value: stats.avgDurationMs > 0 ? `${Math.round(stats.avgDurationMs / 1000)}s` : '—',
      icon: Clock,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-50',
    },
    {
      label: 'Outputs',
      value: outputs.length,
      icon: FileText,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-50',
    },
  ]

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tasks',   label: `Tasks (${tasks.length})` },
    { id: 'runs',    label: `Runs (${runs.length})` },
    { id: 'outputs', label: `Outputs (${outputs.length})` },
    { id: 'qa',      label: `QA (${verdicts.length})` },
  ]

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* ── Agent hero card ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar */}
          <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl border-2 ${agent.bg} ${agent.ring} shadow-sm shrink-0`}>
            {agent.emoji}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{agent.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{agent.description}</p>
            <p className="text-xs font-mono text-slate-300 mt-1">{agentRole}</p>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(s => <StatMini key={s.label} {...s} />)}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              tab === t.id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tasks tab ──────────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {tasks.length === 0 ? (
            <EmptyState message="No tasks assigned yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={task.status} />
                      {task.actual_cost_usd != null && task.actual_cost_usd > 0 && (
                        <span className="text-xs text-slate-400">{formatUSD(task.actual_cost_usd)}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatRelative(task.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Runs tab ───────────────────────────────────────────────────────── */}
      {tab === 'runs' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {runs.length === 0 ? (
            <EmptyState message="No runs recorded yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {runs.map(run => (
                <div key={run.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <RunIcon status={run.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700 capitalize">{run.status.replace(/_/g, ' ')}</span>
                      {run.duration_ms != null && (
                        <span className="text-xs text-slate-400">{(run.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      {run.model_used && (
                        <span className="text-[10px] font-mono text-slate-300 bg-slate-50 border border-slate-100 rounded px-1 py-0.5">{run.model_used}</span>
                      )}
                    </div>
                    {run.error_message && (
                      <p className="text-xs text-red-500 truncate mt-0.5">{run.error_message}</p>
                    )}
                    {run.cost_usd != null && run.cost_usd > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatUSD(run.cost_usd, 4)}
                        {(run.tokens_input || 0) + (run.tokens_output || 0) > 0 && (
                          <span> · {((run.tokens_input || 0) + (run.tokens_output || 0)).toLocaleString()} tokens</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {run.started_at ? formatRelative(run.started_at) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Outputs tab ────────────────────────────────────────────────────── */}
      {tab === 'outputs' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {outputs.length === 0 ? (
            <EmptyState message="No outputs produced yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {outputs.map(out => {
                const Icon = OUTPUT_ICONS[out.output_type] || FileText
                return (
                  <div key={out.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${agent.bg} ${agent.ring}`}>
                      <Icon className={`h-3.5 w-3.5 ${agent.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 capitalize">
                          {out.output_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 border ${
                          out.is_valid
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-red-700 bg-red-50 border-red-200'
                        }`}>
                          {out.is_valid ? 'valid' : 'invalid'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatRelative(out.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── QA tab ─────────────────────────────────────────────────────────── */}
      {tab === 'qa' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {verdicts.length === 0 ? (
            <EmptyState message="No QA verdicts yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {verdicts.map(v => {
                const isPass = v.verdict === 'pass'
                return (
                  <div key={v.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    {isPass
                      ? <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                      : <ShieldX className="h-5 w-5 text-red-500 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase ${isPass ? 'text-emerald-600' : 'text-red-600'}`}>
                          {v.verdict}
                        </span>
                        {v.score != null && (
                          <span className="text-xs text-slate-400">
                            Score: <span className="font-semibold text-slate-600">{v.score}</span>/100
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatRelative(v.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
