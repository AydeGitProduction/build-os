/**
 * POST /api/admin/task-reset
 *
 * Supervisor-only admin endpoint: force-resets tasks back to `ready`
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
 *     title_pattern: string,        // ilike pattern on task title (e.g. "[U1-B%")
 *     statuses?: string[],          // only reset tasks in these statuses (default: all)
 *     clear_failure_detail?: bool,  // default true
 *     reason?: string               // context hint stored in failure_detail for agent
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

  let body: {
    title_pattern?: string
    statuses?: string[]
    clear_failure_detail?: boolean
    reason?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    title_pattern,
    statuses,
    clear_failure_detail = true,
    reason,
  } = body

  if (!title_pattern) {
    return NextResponse.json({ error: 'title_pattern is required' }, { status: 400 })
  }

  const checkedAt = new Date().toISOString()

  // ── Fetch matching tasks ───────────────────────────────────────────────────
  let query = admin
    .from('tasks')
    .select('id, status, title, retry_count')
    .ilike('title', title_pattern)
    .limit(100)

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses)
  }

  const { data: matchedTasks, error: fetchErr } = await query

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!matchedTasks || matchedTasks.length === 0) {
    return NextResponse.json({
      data: {
        checked_at: checkedAt,
        total: 0,
        reset: 0,
        summary: `No tasks found matching title_pattern: ${title_pattern}`,
        results: [],
      },
    })
  }

  // ── Reset each matched task ───────────────────────────────────────────────
  const results: Array<{
    id: string
    title: string
    old_status: string
    reset: boolean
    error?: string
  }> = []

  for (const task of matchedTasks) {
    try {
      if (task.status === 'ready') {
        results.push({ id: task.id.slice(0, 8), title: task.title.slice(0, 60), old_status: 'ready', reset: false })
        continue
      }

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
        .eq('id', task.id)

      if (updateErr) {
        results.push({
          id: task.id.slice(0, 8),
          title: task.title.slice(0, 60),
          old_status: task.status,
          reset: false,
          error: updateErr.message,
        })
        continue
      }

      // Release any resource lock on this task
      await admin
        .from('resource_locks')
        .delete()
        .eq('resource_id', task.id)
        .eq('resource_type', 'task')

      results.push({
        id: task.id.slice(0, 8),
        title: task.title.slice(0, 60),
        old_status: task.status,
        reset: true,
      })
    } catch (err: unknown) {
      results.push({
        id: task.id.slice(0, 8),
        title: task.title.slice(0, 60),
        old_status: task.status,
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
      total: matchedTasks.length,
      reset: successCount,
      already_ready: alreadyReady,
      failed: results.filter(r => !r.reset && r.old_status !== 'ready').length,
      results,
      summary: `Reset ${successCount}/${matchedTasks.length} tasks to ready (${alreadyReady} already ready)`,
    },
  })
}
