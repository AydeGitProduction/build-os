'use client'

/**
 * LiveTaskBoard — wraps TaskBoard with Supabase Realtime.
 * Merges server-fetched tasks with live status updates.
 * Provides dispatch controls and toast notifications.
 */

import { useState, useCallback } from 'react'
import { useRealtimeTasks } from '@/hooks/useRealtimeTasks'
import { useToast } from '@/hooks/useToast'
import ToastContainer from '@/components/ui/ToastContainer'
import TaskBoard from '@/components/tasks/TaskBoard'
import Button from '@/components/ui/Button'
import { Wifi, WifiOff, Zap } from 'lucide-react'
import { snakeToTitle } from '@/lib/utils'

interface Task {
  id: string
  name: string
  slug: string
  description?: string | null
  status: string
  priority: string
  agent_role: string
  task_type?: string | null
  estimated_hours?: number | null
  estimated_cost_usd?: number | null
  actual_cost_usd?: number | null
  feature?: {
    id: string
    name: string
    slug: string
    epic?: { id: string; name: string; slug: string } | null
  } | null
}

interface LiveTaskBoardProps {
  initialTasks: Task[]
  projectId: string
}

export default function LiveTaskBoard({ initialTasks, projectId }: LiveTaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({})
  const toast = useToast()

  // ── Real-time subscription ────────────────────────────────────────────────
  const { taskStatuses, isConnected } = useRealtimeTasks({
    projectId,
    onTaskUpdate: (update) => {
      // Merge real-time status into local task state
      setTasks(prev =>
        prev.map(t =>
          t.id === update.task_id ? { ...t, status: update.new_status } : t
        )
      )

      // Show toast notifications for important transitions
      const taskName = tasks.find(t => t.id === update.task_id)?.name || 'Task'

      if (update.new_status === 'completed') {
        toast.success(`✓ "${taskName}" completed`)
      } else if (update.new_status === 'blocked') {
        toast.error(`⚠ "${taskName}" is blocked`, 8000)
      } else if (update.new_status === 'awaiting_review') {
        toast.info(`"${taskName}" ready for review`)
      } else if (update.new_status === 'in_progress') {
        toast.info(`"${taskName}" now in progress`)
      }
    },
    onBlocker: (taskId) => {
      const taskName = tasks.find(t => t.id === taskId)?.name || 'Task'
      toast.error(`⛔ Blocker created on "${taskName}"`, 10000)
    },
  })

  // Apply any real-time overrides to tasks
  const liveTasks = tasks.map(t => ({
    ...t,
    status: taskStatuses[t.id] || t.status,
  }))

  // ── Dispatch handler ──────────────────────────────────────────────────────
  const handleDispatch = useCallback(async (taskId: string) => {
    setDispatching(prev => ({ ...prev, [taskId]: true }))

    try {
      const res = await fetch('/api/dispatch/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Dispatch failed')
        return
      }

      const task = tasks.find(t => t.id === taskId)
      toast.success(`🚀 "${task?.name}" dispatched`)
    } catch {
      toast.error('Failed to dispatch task')
    } finally {
      setDispatching(prev => ({ ...prev, [taskId]: false }))
    }
  }, [tasks, toast])

  // ── Mock agent run ────────────────────────────────────────────────────────
  const handleMockRun = useCallback(async (taskId: string) => {
    setDispatching(prev => ({ ...prev, [taskId]: true }))

    try {
      const res = await fetch('/api/mock/agent-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, auto_qa: true }),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Mock run failed')
        return
      }

      toast.success(`🤖 Mock run complete — cost $${json.data.cost_usd?.toFixed(4)}`)
    } catch {
      toast.error('Mock run failed')
    } finally {
      setDispatching(prev => ({ ...prev, [taskId]: false }))
    }
  }, [toast])

  // ── Mark task as ready ────────────────────────────────────────────────────
  const handleMarkReady = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    })
    if (!res.ok) {
      const json = await res.json()
      toast.error(json.error || 'Failed to update task')
    }
  }, [toast])

  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div>
      {/* Realtime connection indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-green-600 font-medium">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Connecting…</span>
            </>
          )}
        </div>

        {/* Dev controls */}
        {isDev && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Dev mode
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                // Mock-run all pending tasks
                const pendingTasks = liveTasks.filter(t => ['pending', 'ready', 'in_progress'].includes(t.status))
                for (const t of pendingTasks.slice(0, 3)) {
                  await handleMockRun(t.id)
                }
              }}
              leftIcon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
            >
              Mock run 3 tasks
            </Button>
          </div>
        )}
      </div>

      {/* Task board with enhanced actions */}
      <TaskBoard
        tasks={liveTasks}
        projectId={projectId}
        onDispatch={handleDispatch}
        onMockRun={isDev ? handleMockRun : undefined}
        onMarkReady={handleMarkReady}
        dispatching={dispatching}
      />

      {/* Toast container */}
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  )
}
