'use client'
/**
 * useOrchestration — polls /api/orchestrate/status every 10s
 * Provides: phase, active_agents, task counts, health_status, last_tick
 *
 * WS10 — Backend Connection
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api/client'

export type OrchestrationPhase =
  | 'idle' | 'planning' | 'executing' | 'reviewing' | 'complete' | 'paused' | 'error'

export interface OrchestrationStatus {
  project_id:        string
  phase:             OrchestrationPhase
  active_agents:     string[]
  task_counts: {
    pending:     number
    ready:       number
    dispatched:  number
    in_progress: number
    completed:   number
    blocked:     number
    failed:      number
    total:       number
  }
  health_status:     'healthy' | 'degraded' | 'incident'
  last_tick:         string | null
  watchdog_ok:       boolean
  run_active:        boolean
  error_message?:    string
}

const DEFAULT_STATUS: OrchestrationStatus = {
  project_id:    '',
  phase:         'idle',
  active_agents: [],
  task_counts:   { pending: 0, ready: 0, dispatched: 0, in_progress: 0, completed: 0, blocked: 0, failed: 0, total: 0 },
  health_status: 'healthy',
  last_tick:     null,
  watchdog_ok:   true,
  run_active:    false,
}

interface UseOrchestrationOptions {
  projectId: string
  pollingMs?: number
  enabled?: boolean
}

export function useOrchestration({ projectId, pollingMs = 10_000, enabled = true }: UseOrchestrationOptions) {
  const [status, setStatus]   = useState<OrchestrationStatus>(DEFAULT_STATUS)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    if (!projectId || !enabled) return
    const result = await apiGet<OrchestrationStatus>(
      `/api/orchestrate/status?project_id=${projectId}`
    )
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setStatus(result.data)
      setError(null)
    }
    setLoading(false)
  }, [projectId, enabled])

  useEffect(() => {
    if (!enabled) return
    fetch()
    timerRef.current = setInterval(fetch, pollingMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetch, pollingMs, enabled])

  const refetch = useCallback(() => fetch(), [fetch])

  return { status, loading, error, refetch }
}
