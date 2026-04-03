/**
 * POST /api/admin/task-reset
 *
 * Supervisor-only admin endpoint: force-resets specific task IDs back to `ready`
 * regardless of current state (bypasses state machine — admin privilege).
 *
 * Use case: tasks that are `completed` but produced no code output due to agent
 * truncation (maxTokens limit), or tasks stuck in `blocked`/`failed` that need a
 * clean retry.
 *
 * Auth: X-Buildos-Secret header (BUILDOS_INTERNAL_SECRET)
 *
 * Body:
 *   {
 *     task_ids: string[],          // full UUIDs or 8-char prefixes
 *     clear_failure_detail?: bool, // default true
 *     reason?: string              // logged in failure_detail as context for agent
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET =
    process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()

  let body: { task_ids?: string[]; clear_failure_detail?: boolean; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { task_ids, clear_failure_detail = true, reason } = body

  if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: 'task_ids array required' }, { status: 400 })
  }

  if (task_ids.length > 50) {
    return NextResponse.json({ error: 'Max 50 task IDs per call' }, { status: 400 })
  }

  const checkedAt = new Date().toISOString()
  const results: Array<{
    id: string
    old_status: string
    reset: boolean
    error?: string
  }> = []

  for (const rawId of task_ids) {
    try {
      // Support both full UUIDs and 8-char prefixes
      const isPrefix = rawId.length === 8
      let taskId: string | null = null

      if (isPrefix) {
        // Look up the full UUID by prefix
        const { data: matches } = await admin
          .from('tasks')
          .select('id, status')
          .ilike('id::text', `${rawId}%`)
          .limit(2)

        if (!matches || matches.length === 0) {
          results.push({ id: rawId, old_status: 'unknown', reset: false, error: 'not found' })
          continue
        }
        if (matches.length > 1) {
          results.push({ id: rawId, old_status: 'ambiguous', reset: false, error: 'prefix matches multiple tasks' })
          continue
        }
        taskId = matches[0].id
      } else {
        taskId = rawId
      }

      // Fetch current task state
      const { data: task } = await admin
        .from('tasks')
        .select('id, status, title')
        .eq('id', taskId)
        .single()

      if (!task) {
        results.push({ id: rawId, old_status: 'unknown', reset: false, error: 'not found' })
        continue
      }

      if (task.status === 'ready') {
        // Already ready — no-op
        results.push({ id: rawId, old_status: 'ready', reset: false })
        continue
      }

      // Build update payload
      const updates: Record<string, unknown> = {
        status: 'ready',
        dispatched_at: null,
        retry_count: 0,
      }

      if (clear_failure_detail) {
        updates.failure_detail = reason
          ? `Supervisor reset (${checkedAt.slice(0, 10)}): ${reason}`
          : null
      }

      const { error: updateErr } = await admin
        .from('tasks')
        .update(updates)
        .eq('id', taskId)

      if (updateErr) {
        results.push({ id: rawId, old_status: task.status, reset: false, error: updateErr.message })
        continue
      }

      // Release any resource lock held on this task
      await admin
        .from('resource_locks')
        .delete()
        .eq('resource_id', taskId)
        .eq('resource_type', 'task')

      results.push({ id: rawId, old_status: task.status, reset: true })
    } catch (err: unknown) {
      results.push({
        id: rawId,
        old_status: 'unknown',
        reset: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const successCount = results.filter(r => r.reset).length
  const alreadyReady = results.filter(r => r.old_status === 'ready').length

  return NextResponse.json({
    data: {
      checked_at: checkedAt,
      total: task_ids.length,
      reset: successCount,
      already_ready: alreadyReady,
      failed: results.filter(r => !r.reset && r.old_status !== 'ready').length,
      results,
      summary: `Reset ${successCount}/${task_ids.length} tasks to ready (${alreadyReady} already ready)`,
    },
  })
}
