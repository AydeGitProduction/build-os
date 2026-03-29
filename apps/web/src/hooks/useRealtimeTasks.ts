'use client'

/**
 * useRealtimeTasks
 * Subscribes to Supabase Realtime for task + task_run + blocker changes.
 * Returns the live task list and notifies callers via onTaskUpdate callback.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface TaskUpdate {
  task_id: string
  old_status: string | null
  new_status: string
  task_name?: string
  event: 'status_change' | 'blocker_created' | 'run_completed'
}

interface UseRealtimeTasksOptions {
  projectId: string
  onTaskUpdate?: (update: TaskUpdate) => void
  onBlocker?: (taskId: string) => void
}

/**
 * Returns { taskStatuses } — a map of task_id → current status
 * Driven purely by real-time events (no initial fetch — combine with server data).
 */
export function useRealtimeTasks({
  projectId,
  onTaskUpdate,
  onBlocker,
}: UseRealtimeTasksOptions) {
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [recentUpdates, setRecentUpdates] = useState<TaskUpdate[]>([])
  const [isConnected, setIsConnected] = useState(false)

  const handleTaskChange = useCallback((payload: any) => {
    const { old: oldRecord, new: newRecord } = payload
    if (!newRecord) return

    const oldStatus = oldRecord?.status || null
    const newStatus = newRecord.status
    const taskId    = newRecord.id

    if (oldStatus === newStatus) return // No status change

    const update: TaskUpdate = {
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
      task_name: newRecord.name,
      event: 'status_change',
    }

    setTaskStatuses(prev => ({ ...prev, [taskId]: newStatus }))
    setRecentUpdates(prev => [update, ...prev].slice(0, 20))

    onTaskUpdate?.(update)

    if (newStatus === 'blocked') {
      onBlocker?.(taskId)
    }
  }, [onTaskUpdate, onBlocker])

  const handleTaskRunChange = useCallback((payload: any) => {
    const { new: newRecord } = payload
    if (!newRecord || newRecord.status !== 'completed') return

    const update: TaskUpdate = {
      task_id: newRecord.task_id,
      old_status: null,
      new_status: 'run_completed',
      event: 'run_completed',
    }
    setRecentUpdates(prev => [update, ...prev].slice(0, 20))
    onTaskUpdate?.(update)
  }, [onTaskUpdate])

  useEffect(() => {
    // We need to subscribe at the project level.
    // For tasks, we filter by project_id in the realtime filter.
    const channelName = `buildos:project:${projectId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`,
        },
        handleTaskChange
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_runs',
        },
        handleTaskRunChange
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'blockers',
        },
        (payload) => {
          const newRecord = payload.new as { task_id: string }
          if (newRecord?.task_id) {
            onBlocker?.(newRecord.task_id)
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setIsConnected(false)
    }
  }, [projectId, handleTaskChange, handleTaskRunChange, onBlocker])

  return { taskStatuses, recentUpdates, isConnected }
}
