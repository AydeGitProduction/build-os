'use client'

import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Rocket, ShieldCheck, AlertCircle, ChevronRight, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { Gate, GateStatus, ReleaseCheckResult } from '@/app/api/release/check/route'

interface Props {
  projectId: string
  initialResult: ReleaseCheckResult | null
}

// ── Gate status helpers ────────────────────────────────────────────────────────
const GATE_STATUS_CONFIG: Record<GateStatus, { Icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  pass: { Icon: CheckCircle, color: 'text-green-500',  bg: 'bg-green-50',   border: 'border-green-200',  label: 'Pass'    },
  warn: { Icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Warning' },
  fail: { Icon: XCircle,       color: 'text-red-500',   bg: 'bg-red-50',    border: 'border-red-200',    label: 'Fail'    },
}

function ScoreRing({ score, ready }: { score: number; ready: boolean }) {
  const r  = 54
  const cx = 64
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference

  const color = ready ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center">
      <svg width="128" height="128" className="rotate-[-90deg]">
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        {/* Progress */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-slate-900 leading-none">{score}</span>
        <span className="text-xs text-slate-500 mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

function GateRow({ gate }: { gate: Gate }) {
  const cfg = GATE_STATUS_CONFIG[gate.status]
  const Icon = cfg.Icon

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border} transition-all`}>
      <Icon className={`h-4.5 w-4.5 ${cfg.color} mt-0.5 shrink-0`} style={{ height: '1.125rem', width: '1.125rem' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{gate.label}</p>
          <div className="flex items-center gap-2 shrink-0">
            {gate.blocking && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                blocking
              </span>
            )}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              gate.status === 'pass' ? 'bg-green-100 text-green-700' :
              gate.status === 'warn' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {cfg.label}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-0.5">{gate.message}</p>
        {(gate.value !== undefined || gate.threshold !== undefined) && (
          <p className="text-[10px] text-slate-400 mt-1">
            {gate.value !== undefined && <span>Value: <strong>{gate.value}</strong></span>}
            {gate.threshold !== undefined && <span className="ml-2">Threshold: <strong>{gate.threshold}</strong></span>}
          </p>
        )}
      </div>
    </div>
  )
}

export default function ReleaseReadinessView({ projectId, initialResult }: Props) {
  const [result, setResult]   = useState<ReleaseCheckResult | null>(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/release/check?project_id=${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to run release check')
        return
      }
      setResult(json.data)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // ── Gate groups ──────────────────────────────────────────────────────────
  const blockingGates     = result?.gates.filter(g => g.blocking)  || []
  const nonBlockingGates  = result?.gates.filter(g => !g.blocking) || []
  const failCount         = result?.gates.filter(g => g.status === 'fail').length ?? 0
  const warnCount         = result?.gates.filter(g => g.status === 'warn').length ?? 0
  const passCount         = result?.gates.filter(g => g.status === 'pass').length ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Hero card ── */}
      <div className={`rounded-2xl border p-6 ${
        result?.ready
          ? 'bg-green-50 border-green-200'
          : result
            ? 'bg-white border-slate-200'
            : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-5">
            {result ? (
              <ScoreRing score={result.score} ready={result.ready} />
            ) : (
              <div className="h-32 w-32 flex items-center justify-center rounded-full border-4 border-slate-200">
                <ShieldCheck className="h-10 w-10 text-slate-300" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {result
                  ? result.ready ? 'Ready to Release' : 'Not Ready'
                  : 'Release Readiness'}
              </h2>
              {result ? (
                <p className="text-sm text-slate-600 mt-1">
                  {passCount} / {result.gates.length} gates passed
                  {failCount > 0 && ` · ${failCount} blocking issue${failCount > 1 ? 's' : ''}`}
                  {warnCount > 0 && ` · ${warnCount} warning${warnCount > 1 ? 's' : ''}`}
                </p>
              ) : (
                <p className="text-sm text-slate-500 mt-1">
                  Run a check to evaluate your project against 10 release criteria.
                </p>
              )}
              {result && (
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Checked {new Date(result.checks_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button
              onClick={runCheck}
              loading={loading}
              leftIcon={loading ? undefined : <RefreshCw className="h-4 w-4" />}
              size="sm"
              variant={result ? 'outline' : 'primary'}
            >
              {result ? 'Re-run check' : 'Run release check'}
            </Button>
            {result?.ready && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Rocket className="h-4 w-4" />}
                className="bg-green-600 hover:bg-green-700"
                onClick={() => alert('Release request submitted. (Hook this to your deployment pipeline.)')}
              >
                Request Release
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* ── Warnings banner ── */}
      {result && result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.warnings.length} Warning{result.warnings.length > 1 ? 's' : ''}
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5 ml-5">
              <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* ── Gate lists ── */}
      {result && (
        <>
          {/* Blocking gates */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Blocking Gates ({blockingGates.filter(g => g.status === 'pass').length}/{blockingGates.length} passed)
            </h3>
            <div className="space-y-2">
              {blockingGates.map(gate => <GateRow key={gate.id} gate={gate} />)}
            </div>
          </div>

          {/* Non-blocking gates */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Advisory Gates ({nonBlockingGates.filter(g => g.status === 'pass').length}/{nonBlockingGates.length} passed)
            </h3>
            <div className="space-y-2">
              {nonBlockingGates.map(gate => <GateRow key={gate.id} gate={gate} />)}
            </div>
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {!result && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 mx-auto mb-4">
            <ShieldCheck className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">10-Gate Release Evaluation</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Checks task completion, QA coverage, open blockers, failed tasks,
            agent outputs, integrations, documentation, cost, project settings,
            and test coverage.
          </p>
          <Button onClick={runCheck} className="mt-4" size="sm" leftIcon={<Rocket className="h-4 w-4" />}>
            Run release check
          </Button>
        </div>
      )}
    </div>
  )
}
