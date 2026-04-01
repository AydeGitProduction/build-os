// src/components/autopilot/tabs/LogsTab.tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Terminal, Circle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug'

interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, string> = {
  info:    'text-blue-400',
  success: 'text-emerald-400',
  warning: 'text-yellow-400',
  error:   'text-red-400',
  debug:   'text-muted-foreground',
}

const LEVEL_DOT: Record<LogLevel, string> = {
  info:    'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-yellow-400',
  error:   'bg-red-400',
  debug:   'bg-zinc-500',
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface LogsTabProps {
  projectId?: string | null
  className?: string
}

export const LogsTab: React.FC<LogsTabProps> = ({ projectId, className }) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch logs from orchestration status / task runs
  const fetchLogs = React.useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/orchestrate/status?project_id=${projectId}`)
      if (!res.ok) throw new Error('Failed to fetch status')
      const data = await res.json()

      // Build synthetic log entries from orchestration state
      const entries: LogEntry[] = []

      if (data.last_tick) {
        entries.push({
          id: 'tick',
          timestamp: data.last_tick,
          level: 'debug',
          message: `Orchestrator tick — run_active: ${data.run_active}, phase: ${data.phase}`,
          source: 'orchestrator',
        })
      }

      if (Array.isArray(data.active_agents) && data.active_agents.length > 0) {
        data.active_agents.forEach((role: string, i: number) => {
          entries.push({
            id: `agent-${i}`,
            timestamp: data.last_tick ?? new Date().toISOString(),
            level: 'info',
            message: `Agent active: ${role}`,
            source: 'dispatch',
          })
        })
      }

      if (data.task_counts) {
        const c = data.task_counts
        entries.push({
          id: 'counts',
          timestamp: data.last_tick ?? new Date().toISOString(),
          level: 'success',
          message: `Tasks — completed: ${c.completed ?? 0}  dispatched: ${c.dispatched ?? 0}  ready: ${c.ready ?? 0}  pending: ${c.pending ?? 0}  failed: ${c.failed ?? 0}`,
          source: 'queue',
        })
      }

      if (data.health_status === 'unhealthy' || data.health_status === 'degraded') {
        entries.push({
          id: 'health',
          timestamp: data.last_tick ?? new Date().toISOString(),
          level: 'warning',
          message: `Health check: ${data.health_status}`,
          source: 'watchdog',
        })
      }

      setLogs(entries)
    } catch {
      setLogs([{
        id: 'error',
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Could not load logs — check orchestration status endpoint',
        source: 'client',
      }])
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  // Initial load + polling every 10s
  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10_000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Activity Logs</span>
          {isLoading && (
            <span className="text-[10px] text-muted-foreground animate-pulse">refreshing…</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3 h-3 accent-primary"
            />
            <span className="text-[11px] text-muted-foreground">Auto-scroll</span>
          </label>
          <button
            onClick={fetchLogs}
            title="Refresh logs"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Log stream */}
      <div className="flex-1 overflow-y-auto font-mono text-xs bg-zinc-950/30">
        {logs.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Terminal className="w-8 h-8 opacity-20" />
            <p className="text-sm">No logs yet</p>
            <p className="text-[11px] opacity-60">
              {projectId ? 'Waiting for agent activity…' : 'No project selected'}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 leading-relaxed">
                {/* Timestamp */}
                <span className="text-zinc-600 shrink-0 w-20 pt-px">
                  {formatTime(entry.timestamp)}
                </span>

                {/* Level dot */}
                <span className="mt-1.5 shrink-0">
                  <Circle className={cn('w-1.5 h-1.5 fill-current', LEVEL_DOT[entry.level])} />
                </span>

                {/* Source badge */}
                {entry.source && (
                  <span className="text-zinc-600 shrink-0 w-20 truncate pt-px">
                    [{entry.source}]
                  </span>
                )}

                {/* Message */}
                <span className={cn('break-all', LEVEL_STYLES[entry.level])}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}
