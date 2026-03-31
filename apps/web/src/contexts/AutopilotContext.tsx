'use client'
/**
 * AutopilotContext — shared state for Autopilot Mode
 * Single source of truth: phase, active_agents, task_counts, health
 * All autopilot sub-components consume this via useAutopilot()
 *
 * WS4 — Autopilot Mode Layout
 */

import { createContext, useContext, useMemo } from 'react'
import { useOrchestration, type OrchestrationStatus, type OrchestrationPhase } from '@/hooks/useOrchestration'

interface AutopilotContextValue {
  projectId:     string
  status:        OrchestrationStatus
  phase:         OrchestrationPhase
  activeAgents:  string[]
  health:        'healthy' | 'degraded' | 'incident'
  runActive:     boolean
  taskCounts: {
    pending:     number
    ready:       number
    dispatched:  number
    in_progress: number
    completed:   number
    blocked:     number
    failed:      number
    total:       number
  }
  loading:  boolean
  error:    string | null
  refetch:  () => void
}

const AutopilotContext = createContext<AutopilotContextValue | null>(null)

export function AutopilotProvider({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  const { status, loading, error, refetch } = useOrchestration({
    projectId,
    pollingMs: 10_000,
  })

  const value = useMemo<AutopilotContextValue>(() => ({
    projectId,
    status,
    phase:        status.phase,
    activeAgents: status.active_agents ?? [],
    health:       status.health_status ?? 'healthy',
    runActive:    status.run_active ?? false,
    taskCounts:   status.task_counts ?? {
      pending: 0, ready: 0, dispatched: 0,
      in_progress: 0, completed: 0, blocked: 0, failed: 0, total: 0,
    },
    loading,
    error,
    refetch,
  }), [projectId, status, loading, error, refetch])

  return (
    <AutopilotContext.Provider value={value}>
      {children}
    </AutopilotContext.Provider>
  )
}

export function useAutopilot(): AutopilotContextValue {
  const ctx = useContext(AutopilotContext)
  if (!ctx) throw new Error('useAutopilot must be used inside <AutopilotProvider>')
  return ctx
}
