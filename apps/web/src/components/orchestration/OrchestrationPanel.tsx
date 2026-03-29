'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Cpu, Play, Square, RefreshCw, Zap, AlertTriangle, CheckCircle,
  XCircle, Activity, DollarSign, Clock, ChevronRight, Layers,
  Shield, BarChart3, SkipForward,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import type { OrchestrationStatus, TickResult } from '@/lib/orchestration'

interface Props {
  projectId: string
  initialStatus: OrchestrationStatus
}

// ── Mode badges ───────────────────────────────────────────────────────────────
const MODE_CONFIG = {
  manual:    { label: 'Manual',    color: 'bg-slate-100 text-slate-600', pulse: false },
  semi_auto: { label: 'Semi-Auto', color: 'bg-amber-100 text-amber-700', pulse: false },
  full_auto: { label: 'Full Auto', color: 'bg-green-100 text-green-700',  pulse: true  },
}

// ── Activity ring ─────────────────────────────────────────────────────────────
function ActivityRing({ active, total, healthy }: { active: number; total: number; healthy: boolean }) {
  const r = 40
  const cx = 52
  const circumference = 2 * Math.PI * r
  const pct = total > 0 ? (active / total) : 0
  const offset = circumference - pct * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="104" height="104">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={healthy ? '#22c55e' : '#f59e0b'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75 + offset * 0.25} // subtle ring
          className="rotate-[-90deg] origin-center transition-all duration-500"
          style={{ transformOrigin: `${cx}px ${cx}px` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 leading-none">{active}</span>
        <span className="text-[10px] text-slate-400 mt-0.5">active</span>
      </div>
    </div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({
  label, value, color = 'text-slate-700', icon: Icon
}: { label: string; value: string | number; color?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-[72px]">
      {Icon && <Icon className={`h-4 w-4 mb-1 ${color}`} />}
      <span className={`text-base font-bold leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-400 mt-1 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OrchestrationPanel({ projectId, initialStatus }: Props) {
  const [status, setStatus]         = useState<OrchestrationStatus>(initialStatus)
  const [ticking, setTicking]       = useState(false)
  const [activating, setActivating] = useState(false)
  const [stopping, setStopping]     = useState(false)
  const [lastTick, setLastTick]     = useState<TickResult | null>(null)
  const [tickLog, setTickLog]       = useState<TickResult[]>([])
  const [error, setError]           = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // ── Realtime: refresh status on task changes ──────────────────────────────
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Subscribe to orchestration_runs inserts (new ticks)
    const channel = supabase
      .channel(`orch:${projectId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'orchestration_runs',
        filter: `project_id=eq.${projectId}`,
      }, () => { refreshStatus() })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'tasks',
        filter: `project_id=eq.${projectId}`,
      }, () => { refreshStatus() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [tickLog])

  const refreshStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/orchestrate/status?project_id=${projectId}`)
      const json = await res.json()
      if (json.data) setStatus(json.data)
    } catch { /* silent */ }
  }, [projectId])

  // ── Manual tick ───────────────────────────────────────────────────────────
  const handleTick = useCallback(async () => {
    setTicking(true)
    setError(null)
    try {
      const res  = await fetch(`/api/orchestrate/tick?project_id=${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggered_by: 'manual' }) })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Tick failed'); return }
      const tick = json.data as TickResult
      setLastTick(tick)
      setTickLog(prev => [...prev.slice(-19), tick])
      await refreshStatus()
    } catch { setError('Network error') } finally { setTicking(false) }
  }, [projectId, refreshStatus])

  // ── Activate / deactivate ─────────────────────────────────────────────────
  const handleActivate = useCallback(async (mode: string, autoDispatch: boolean) => {
    setActivating(true)
    setError(null)
    try {
      const res  = await fetch(`/api/orchestrate/activate?project_id=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, auto_dispatch: autoDispatch, safe_stop: false }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Activation failed'); return }
      if (json.data?.tick_result) {
        const tick = json.data.tick_result as TickResult
        setLastTick(tick)
        setTickLog(prev => [...prev.slice(-19), tick])
      }
      await refreshStatus()
    } catch { setError('Network error') } finally { setActivating(false) }
  }, [projectId, refreshStatus])

  // ── Safe stop ─────────────────────────────────────────────────────────────
  const handleSafeStop = useCallback(async () => {
    setStopping(true)
    setError(null)
    try {
      const res  = await fetch(`/api/orchestrate/safe-stop?project_id=${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Safe stop failed'); return }
      await refreshStatus()
    } catch { setError('Network error') } finally { setStopping(false) }
  }, [projectId, refreshStatus])

  const modeConf     = MODE_CONFIG[status.config.orchestration_mode] || MODE_CONFIG.manual
  const isActive     = status.config.auto_dispatch && !status.config.safe_stop
  const totalTasks   = status.active_count + status.ready_count + status.pending_count + status.completed_count + status.failed_count + status.blocked_count

  return (
    <div className="space-y-5">

      {/* ── Hero status card ── */}
      <div className={`rounded-2xl border p-5 ${isActive ? 'bg-green-50 border-green-200' : status.config.safe_stop ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-6 flex-wrap">

          {/* Activity ring */}
          <ActivityRing active={status.active_count} total={Math.max(totalTasks, 1)} healthy={status.loop_healthy} />

          {/* Status summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                {status.config.safe_stop ? 'System Stopped'
                  : isActive ? 'Loop Running'
                  : 'Loop Idle'}
              </h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${modeConf.color}`}>
                {modeConf.pulse && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                {modeConf.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {status.active_count} active · {status.ready_count} queued · {status.pending_count} pending ·
              {' '}{status.completed_count} done · {status.failed_count} failed · {status.total_ticks} ticks
            </p>

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              {status.config.safe_stop ? (
                <Button size="sm" variant="primary" loading={activating} leftIcon={<Play className="h-3.5 w-3.5" />}
                  onClick={() => handleActivate(status.config.orchestration_mode, true)}>
                  Resume
                </Button>
              ) : !isActive ? (
                <>
                  <Button size="sm" variant="primary" loading={activating} leftIcon={<Zap className="h-3.5 w-3.5" />}
                    onClick={() => handleActivate('full_auto', true)}>
                    Activate Full Auto
                  </Button>
                  <Button size="sm" variant="outline" loading={activating}
                    onClick={() => handleActivate('semi_auto', true)}>
                    Semi-Auto
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="danger" loading={stopping} leftIcon={<Square className="h-3.5 w-3.5" />}
                  onClick={handleSafeStop}>
                  Safe Stop
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={ticking} leftIcon={<SkipForward className="h-3.5 w-3.5" />}
                onClick={handleTick}>
                Manual Tick
              </Button>
              <Button size="sm" variant="ghost" leftIcon={<RefreshCw className="h-3 w-3" />} onClick={refreshStatus}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Stat chips */}
          <div className="flex gap-2 flex-wrap shrink-0">
            <StatChip label="Ready" value={status.ready_count} color="text-brand-600" icon={Play} />
            <StatChip label="Completed" value={status.completed_count} color="text-green-600" icon={CheckCircle} />
            <StatChip label="Failed" value={status.failed_count} color={status.failed_count > 0 ? 'text-red-600' : 'text-slate-400'} icon={XCircle} />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* ── Two column: Guardrails + Cost ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Guardrails */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Guardrails
          </h3>
          <div className="space-y-2">
            {[
              {
                label:  'Auto Dispatch',
                ok:     status.config.auto_dispatch,
                value:  status.config.auto_dispatch ? 'Enabled' : 'Disabled',
              },
              {
                label:  'Safe Stop',
                ok:     !status.config.safe_stop,
                value:  status.config.safe_stop ? 'ACTIVE' : 'Off',
                warn:   status.config.safe_stop,
              },
              {
                label:  'Max Parallel Agents',
                ok:     true,
                value:  `${status.active_count} / ${status.config.max_parallel_agents}`,
              },
              {
                label:  'Budget Ceiling',
                ok:     (status.budget_remaining ?? 1) > 0,
                value:  status.config.cost_alert_threshold === null
                  ? 'No limit'
                  : `$${status.budget_remaining?.toFixed(2) ?? '?'} remaining`,
              },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Cost Tracking
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total spent</span>
              <span className="font-semibold text-slate-900">${status.total_cost_usd.toFixed(4)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Budget used</span>
              <span className={`font-medium ${(status.budget_pct_used ?? 0) > 100 ? 'text-red-600' : 'text-slate-700'}`}>
                {status.budget_pct_used !== null ? `${status.budget_pct_used}%` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Ticks completed</span>
              <span className="font-medium text-slate-700">{status.total_ticks}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Last tick</span>
              <span className="text-slate-500">
                {status.last_tick_at
                  ? new Date(status.last_tick_at).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Last tick result ── */}
      {lastTick && (
        <div className={`rounded-xl border p-4 text-xs ${lastTick.guardrail_hit ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2">
            {lastTick.guardrail_hit
              ? <AlertTriangle className="h-4 w-4 text-amber-500" />
              : <Activity className="h-4 w-4 text-green-500" />}
            Last Tick — {new Date(lastTick.tick_at).toLocaleTimeString()}
            <span className="ml-auto text-slate-400 text-[10px] font-normal capitalize">{lastTick.triggered_by}</span>
          </div>
          {lastTick.guardrail_hit ? (
            <p className="text-amber-700">{lastTick.guardrail_reason}</p>
          ) : (
            <div className="flex gap-4">
              <span className="text-slate-600">
                Dispatched: <strong className="text-green-700">{lastTick.dispatched_ids.length}</strong>
              </span>
              <span className="text-slate-600">
                Unlocked: <strong className="text-brand-700">{lastTick.unlocked_ids.length}</strong>
              </span>
              <span className="text-slate-600">
                Queue: <strong>{lastTick.queue_depth}</strong>
              </span>
              <span className="text-slate-600">
                Active: {lastTick.active_before} → <strong>{lastTick.active_after}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Tick history log ── */}
      {tickLog.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Tick History
            </h3>
            <span className="text-[10px] text-slate-400">{tickLog.length} ticks this session</span>
          </div>
          <div ref={logRef} className="max-h-48 overflow-y-auto">
            {tickLog.slice().reverse().map((tick, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 last:border-0 text-xs">
                <span className="text-[10px] text-slate-400 w-16 shrink-0">
                  {new Date(tick.tick_at).toLocaleTimeString()}
                </span>
                {tick.guardrail_hit
                  ? <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                  : <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />}
                <span className="text-slate-600 flex-1 truncate">
                  {tick.guardrail_hit
                    ? `Guardrail: ${tick.guardrail_reason}`
                    : `+${tick.dispatched_ids.length} dispatched · +${tick.unlocked_ids.length} unlocked · ${tick.queue_depth} in queue`}
                </span>
                <span className="text-[10px] text-slate-300 capitalize shrink-0">{tick.triggered_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Configuration panel ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Configuration
        </h3>
        <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Mode</p>
            <p className="font-medium capitalize">{status.config.orchestration_mode.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Max parallel</p>
            <p className="font-medium">{status.config.max_parallel_agents} agents</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Budget ceiling</p>
            <p className="font-medium">
              {status.config.cost_alert_threshold !== null
                ? `$${status.config.cost_alert_threshold.toFixed(2)}`
                : 'Unlimited'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="ghost"
            onClick={() => handleActivate('manual', false)}>
            Switch to Manual
          </Button>
          <Button size="sm" variant="ghost"
            onClick={() => handleActivate('semi_auto', true)}>
            Switch to Semi-Auto
          </Button>
          <Button size="sm" variant="ghost"
            onClick={() => handleActivate('full_auto', true)}>
            Switch to Full Auto
          </Button>
        </div>
      </div>

    </div>
  )
}
