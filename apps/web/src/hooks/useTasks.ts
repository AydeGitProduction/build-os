'use client'
/**
 * useTasks — fetches project tasks with optional status filter, polling
 *
 * WS10 — Backend Connection
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api/client'

export interface Task {
  id:                  string
  title:               string
  description:         string
  status:              string
  priority:            string
  agent_role:          string
  task_type:           string
  estimated_cost_usd:  number | null
  actual_cost_usd:     number | null
  order_index:         number
  created_at:          string
  updated_at:          string
  feature_id:          string
  context_payload?:    Record<string, unknown>
}

interface TasksResponse {
  data: Task[]
  count?: number
}

interface UseTasksOptions {
  projectId:  string
  status?:    string | string[]
  limit?:     number
  pollingMs?: number
  enabled?:   boolean
}

export function useTasks({
  projectId,
  status,
  limit = 50,
  pollingMs = 15_000,
  enabled = true,
}: UseTasksOptions) {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (status) {
      const s = Array.isArray(status) ? status.join(',') : status
      params.set('status', s)
    }
    return `/api/projects/${projectId}/tasks?${params}`
  }, [projectId, status, limit])

  const fetch = useCallback(async () => {
    if (!projectId || !enabled) return
    const result = await apiGet<TasksResponse>(buildUrl())
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setTasks(result.data.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [projectId, enabled, buildUrl])

  useEffect(() => {
    if (!enabled) return
    fetch()
    timerRef.current = setInterval(fetch, pollingMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetch, pollingMs, enabled])

  const refetch = useCallback(() => fetch(), [fetch])

  // Derived counts
  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return { tasks, loading, error, refetch, counts }
}
