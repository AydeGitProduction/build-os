'use client'
/**
 * useLogStream — polls /api/supervisor for real-time log entries
 * Accumulates up to maxBuffer entries, applies level/source filters in memory.
 *
 * WS8 — Log Stream
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiGet } from '@/lib/api/client'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id:        string
  timestamp: string
  level:     LogLevel
  source:    string    // agent role or 'system'
  message:   string
  task_id?:  string
  meta?:     Record<string, unknown>
}

interface SupervisorResponse {
  logs?: LogEntry[]
  entries?: LogEntry[]
  data?: LogEntry[]
}

interface UseLogStreamOptions {
  projectId:  string
  pollingMs?: number
  maxBuffer?: number
  enabled?:   boolean
  levelFilter?: LogLevel[]
  sourceFilter?: string
}

export function useLogStream({
  projectId,
  pollingMs   = 3_000,
  maxBuffer   = 1_000,
  enabled     = true,
  levelFilter,
  sourceFilter,
}: UseLogStreamOptions) {
  const [entries, setEntries]     = useState<LogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [connected, setConnected] = useState(false)
  const bufferRef  = useRef<LogEntry[]>([])
  const seenIds    = useRef<Set<string>>(new Set())
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    if (!projectId || !enabled) return
    const result = await apiGet<SupervisorResponse>(
      `/api/supervisor?project_id=${projectId}&limit=50`
    )
    if (result.error) { setConnected(false); setLoading(false); return }

    const raw = result.data?.logs ?? result.data?.entries ?? result.data?.data ?? []
    const newEntries = raw.filter((e: LogEntry) => !seenIds.current.has(e.id))

    if (newEntries.length > 0) {
      for (const e of newEntries) seenIds.current.add(e.id)
      bufferRef.current = [...bufferRef.current, ...newEntries].slice(-maxBuffer)
      setEntries([...bufferRef.current])
    }

    setConnected(true)
    setLoading(false)
  }, [projectId, enabled, maxBuffer])

  useEffect(() => {
    if (!enabled) return
    fetchLogs()
    timerRef.current = setInterval(fetchLogs, pollingMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchLogs, pollingMs, enabled])

  // Apply in-memory filters
  const filtered = entries.filter(e => {
    if (levelFilter && levelFilter.length > 0 && !levelFilter.includes(e.level)) return false
    if (sourceFilter && sourceFilter !== 'all' && e.source !== sourceFilter) return false
    return true
  })

  const clear = useCallback(() => {
    bufferRef.current = []
    seenIds.current.clear()
    setEntries([])
  }, [])

  // Unique sources seen in buffer
  const sources = Array.from(new Set(bufferRef.current.map(e => e.source)))

  return { entries: filtered, allEntries: entries, loading, connected, clear, sources }
}
