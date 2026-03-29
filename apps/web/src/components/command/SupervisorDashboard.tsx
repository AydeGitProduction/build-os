'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw, Wrench, AlertTriangle, CheckCircle2,
  Activity, Zap, Clock, TrendingUp, AlertCircle,
  ChevronDown, ChevronRight, Play,
} from 'lucide-react'
import type { SystemHealthSnapshot, IncidentClassification, Incident } from '@/lib/supervisor'

interface Props {
  projectId: string
}

type HealthData = {
  snapshot: SystemHealthSnapshot
  classification: IncidentClassification
}

const HEALTH_CONFIG = {
  healthy:  { color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200', icon: ShieldCheck, label: 'Healthy' },
  degraded: { color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200', icon: ShieldAlert, label: 'Degraded' },
  stalled:  { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', icon: ShieldAlert, label: 'Stalled' },
  critical: { color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    icon: ShieldX,     label: 'Critical' },
}

const SEVERITY_CONFIG = {
  critical: { color: 'text-red-700',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700' },
  high:     { color: 'text-orange-700', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
  medium:   { color: 'text-amber-700',  bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700' },
  low:      { color: 'text-slate-600',  bg: 'bg-slate-50',  badge: 'bg-slate-100 text-slate-600' },
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent || 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function IncidentCard({ incident, onFix, fixing }: {
  incident: Incident
  onFix?: () => void
  fixing?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const sev = SEVERITY_CONFIG[incident.severity]

  return (
    <div className={`rounded-xl border ${incident.severity === 'critical' ? 'border-red-200' : 'border-slate-200'} bg-white shadow-sm overflow-hidden`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className={`flex-shrink-0 inline-flex items-center justify-center h-6 px-2 rounded-full text-[11px] font-semibold ${sev.badge}`}>
          {incident.severity.toUpperCase()}
        </span>
        <span className="flex-1 text-sm font-medium text-slate-800">{incident.title}</span>
        <div className="flex items-center gap-2">
          {incident.auto_fix && onFix && (
            <button
              onClick={e => { e.stopPropagation(); onFix() }}
              disabled={fixing}
              className="flex items-center gap-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold px-2.5 py-1 hover:bg-brand-100 disabled:opacity-50 transition-colors"
            >
              {fixing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
              Auto-fix
            </button>
          )}
          {!incident.auto_fix && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Needs human
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">{incident.detail}</p>
          {incident.auto_fix && (
            <div className="mt-3 rounded-lg bg-brand-50 border border-brand-100 p-3">
              <p className="text-xs font-semibold text-brand-700 mb-1">Proposed auto-fix</p>
              <p className="text-xs text-brand-600">{incident.auto_fix.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span>Risk: <strong className="text-slate-700">{incident.auto_fix.estimated_risk}</strong></span>
                <span>Reversible: <strong className="text-slate-700">{incident.auto_fix.reversible ? 'Yes' : 'No'}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SupervisorDashboard({ projectId }: Props) {
  const [data, setData]           = useState<HealthData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [running, setRunning]     = useState(false)
  const [fixing, setFixing]       = useState<Set<string>>(new Set())
  const [lastRun, setLastRun]     = useState<string | null>(null)
  const [fixResults, setFixResults] = useState<{ incident: string; success: boolean; message: string }[]>([])

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/supervisor?project_id=${projectId}`)
      const json = await res.json()
      if (res.ok) setData(json.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => {
    loadSnapshot()
    const interval = setInterval(loadSnapshot, 30_000)
    return () => clearInterval(interval)
  }, [loadSnapshot])

  async function runFullCheck() {
    setRunning(true)
    setFixResults([])
    try {
      const res = await fetch(`/api/supervisor?project_id=${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setData({ snapshot: json.data.snapshot, classification: json.data.classification })
        setLastRun(new Date().toLocaleTimeString())
        const results = (json.data.fixes_applied || []).map((f: any) => ({
          incident: f.incident.title,
          success:  f.result.success,
          message:  f.result.message,
        }))
        setFixResults(results)
      }
    } catch { /* silent */ }
    finally { setRunning(false) }
  }

  async function applyFix(incident: Incident) {
    setFixing(prev => new Set(prev).add(incident.id))
    try {
      const res = await fetch(`/api/supervisor?project_id=${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setData({ snapshot: json.data.snapshot, classification: json.data.classification })
        setLastRun(new Date().toLocaleTimeString())
      }
    } catch { /* silent */ }
    finally {
      setFixing(prev => { const next = new Set(prev); next.delete(incident.id); return next })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      </div>
    )
  }

  const status    = data?.classification.status || 'healthy'
  const hConfig   = HEALTH_CONFIG[status]
  const HealthIcon = hConfig.icon
  const snap      = data?.snapshot
  const incidents = data?.classification.incidents || []
  const autoFix   = data?.classification.auto_fixable || []

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className={`flex items-center justify-between rounded-2xl border ${hConfig.border} ${hConfig.bg} px-5 py-4`}>
        <div className="flex items-center gap-3">
          <HealthIcon className={`h-6 w-6 ${hConfig.color}`} />
          <div>
            <p className={`text-sm font-bold ${hConfig.color}`}>
              System {hConfig.label}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {incidents.length === 0
                ? 'No incidents detected — autonomous loop running normally'
                : `${incidents.length} incident(s) · ${autoFix.length} auto-fixable`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRun && (
            <span className="text-xs text-slate-400 mr-2">Last check: {lastRun}</span>
          )}
          <button
            onClick={runFullCheck}
            disabled={running}
            className="flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Running…' : 'Run check + auto-fix'}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      {snap && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Active Runs"
            value={snap.active_runs}
            sub="dispatched + in_progress"
            accent={snap.active_runs > 0 ? 'text-brand-600' : 'text-slate-400'}
          />
          <StatCard
            label="Stale Runs"
            value={snap.stale_runs}
            sub={`>${Math.round(310/60)}min timeout`}
            accent={snap.stale_runs > 0 ? 'text-orange-600' : 'text-slate-900'}
          />
          <StatCard
            label="Stuck Review"
            value={snap.stuck_awaiting}
            sub="awaiting_review >90s"
            accent={snap.stuck_awaiting > 0 ? 'text-amber-600' : 'text-slate-900'}
          />
          <StatCard
            label="Last Tick"
            value={snap.last_tick_age_seconds > 9000
              ? 'Never'
              : `${Math.round(snap.last_tick_age_seconds / 60)}m ago`}
            sub={snap.orchestration_healthy ? 'Healthy' : 'Overdue'}
            accent={snap.orchestration_healthy ? 'text-green-600' : 'text-red-600'}
          />
        </div>
      )}

      {/* Task counts */}
      {snap && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Task Status Distribution</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(snap.task_counts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([status, count]) => (
              <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{count}</span>
                {status}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fix results */}
      {fixResults.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-xs font-semibold text-brand-700 mb-2 uppercase tracking-wide">Auto-fix Results</p>
          <div className="space-y-1.5">
            {fixResults.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {r.success
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                <div>
                  <span className="font-medium text-slate-700">{r.incident}: </span>
                  <span className="text-slate-500">{r.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incidents */}
      {incidents.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Active Incidents ({incidents.length})
          </p>
          {incidents.map(incident => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onFix={incident.auto_fix ? () => applyFix(incident) : undefined}
              fixing={fixing.has(incident.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-slate-200">
          <ShieldCheck className="h-8 w-8 text-green-400 mb-3" />
          <p className="text-sm font-medium text-slate-700">No incidents</p>
          <p className="text-xs text-slate-400 mt-1">The autonomous loop is running normally</p>
        </div>
      )}

      {/* Supervisor intelligence note */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Supervisor Intelligence</span> — This dashboard
            reflects Claude&apos;s real-time analysis of system health. All classification logic, incident
            policies, and auto-fix safety rules are defined in <code className="text-slate-600 bg-white px-1 py-0.5 rounded">lib/supervisor.ts</code>.
            The UI is the execution layer; Claude is the decision layer.
          </div>
        </div>
      </div>
    </div>
  )
}
