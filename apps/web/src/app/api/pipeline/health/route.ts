/**
 * GET /api/pipeline/health
 *
 * Public monitoring endpoint — no auth required.
 * Returns aggregate task pipeline counts and system health indicators.
 *
 * Query params:
 *   ?task_ids=id1,id2,id3  — also return status for specific task IDs
 *
 * Used by: supervisor monitoring, health checks, CI dashboards
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  const checkedAt = new Date().toISOString()

  // Parse optional task_ids query parameter
  const { searchParams } = new URL(request.url)
  const taskIdsParam = searchParams.get('task_ids')
  const taskIds = taskIdsParam
    ? taskIdsParam.split(',').map(id => id.trim()).filter(Boolean)
    : []

  try {
    // Aggregate task counts by status
    const { data: tasks, error: taskErr } = await admin
      .from('tasks')
      .select('status')

    if (taskErr) {
      return NextResponse.json(
        { error: 'DB query failed', detail: taskErr.message, checked_at: checkedAt },
        { status: 500 }
      )
    }

    const counts: Record<string, number> = {}
    for (const t of tasks ?? []) {
      counts[t.status] = (counts[t.status] || 0) + 1
    }

    const total = Object.values(counts).reduce((s, n) => s + n, 0)

    // Recent task_run activity (last 30 minutes)
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data: recentRuns } = await admin
      .from('task_runs')
      .select('status')
      .gte('started_at', cutoff)

    const recentActivity = (recentRuns ?? []).length

    // DLQ size
    const { count: dlqCount } = await admin
      .from('job_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'dead')

    // Open blockers
    const { count: openBlockers } = await admin
      .from('blockers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')

    const healthy =
      (counts['blocked'] ?? 0) === 0 &&
      (dlqCount ?? 0) === 0 &&
      recentActivity > 0

    // Blocked task details for triage
    const { data: blockedTasks } = await admin
      .from('tasks')
      .select('id, title, status, failure_detail, retry_count, updated_at')
      .eq('status', 'blocked')
      .order('updated_at', { ascending: false })
      .limit(20)

    // Awaiting review tasks
    const { data: awaitingTasks } = await admin
      .from('tasks')
      .select('id, title, status, updated_at')
      .eq('status', 'awaiting_review')
      .order('updated_at', { ascending: false })
      .limit(15)

    // Specific task details if task_ids provided (search by title prefix for short IDs)
    let taskDetails: Array<{
      id: string
      title: string
      status: string
      failure_detail: string | null
      retry_count: number
      updated_at: string
    }> = []

    if (taskIds.length > 0) {
      // Build a title-based OR filter using task IDs as title keyword search
      // Also try casting id to text for prefix matching
      const { data: specificTasks } = await admin
        .from('tasks')
        .select('id, title, status, failure_detail, retry_count, updated_at')
        .or(taskIds.map(id => `title.ilike.%${id}%`).join(','))
        .order('updated_at', { ascending: false })

      taskDetails = (specificTasks ?? []).map(t => ({
        id:             t.id,
        title:          t.title,
        status:         t.status,
        failure_detail: t.failure_detail ?? null,
        retry_count:    t.retry_count ?? 0,
        updated_at:     t.updated_at,
      }))
    }

    const response: Record<string, unknown> = {
      checked_at:      checkedAt,
      healthy,
      task_counts:     counts,
      total_tasks:     total,
      recent_runs_30m: recentActivity,
      dlq_size:        dlqCount ?? 0,
      open_blockers:   openBlockers ?? 0,
      pipeline_status: healthy ? 'ACTIVE' : 'DEGRADED',
      deployed_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
      blocked_tasks:   (blockedTasks ?? []).map(t => ({
        id:             t.id.slice(0, 8),
        title:          t.title.slice(0, 80),
        failure_detail: (t.failure_detail ?? '').slice(0, 150),
        retry_count:    t.retry_count ?? 0,
        updated_at:     t.updated_at,
      })),
      awaiting_review_tasks: (awaitingTasks ?? []).map(t => ({
        id:         t.id.slice(0, 8),
        title:      t.title.slice(0, 80),
        updated_at: t.updated_at,
      })),
    }

    if (taskIds.length > 0) {
      response['task_details'] = taskDetails
    }

    return NextResponse.json({ data: response })
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:      'Internal error',
        detail:     err instanceof Error ? err.message : String(err),
        checked_at: checkedAt,
      },
      { status: 500 }
    )
  }
}
