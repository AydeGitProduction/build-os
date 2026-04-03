/**
 * GET /api/pipeline/health
 *
 * Public monitoring endpoint — no auth required.
 * Returns aggregate task pipeline counts and system health indicators.
 * Does NOT expose task details, project names, or user data.
 *
 * Used by: supervisor monitoring, health checks, CI dashboards
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

// Cache for 30 seconds to avoid hammering the DB on repeated health checks
const CACHE_TTL_SECONDS = 30

export const revalidate = CACHE_TTL_SECONDS

export async function GET() {
  const admin = createAdminSupabaseClient()
  const checkedAt = new Date().toISOString()

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

    return NextResponse.json({
      data: {
        checked_at:      checkedAt,
        healthy,
        task_counts:     counts,
        total_tasks:     total,
        recent_runs_30m: recentActivity,
        dlq_size:        dlqCount ?? 0,
        open_blockers:   openBlockers ?? 0,
        pipeline_status: healthy ? 'ACTIVE' : 'DEGRADED',
        // Deployment version info
        deployed_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
        deployed_at:     process.env.VERCEL_GIT_COMMIT_MESSAGE ?? 'unknown',
      },
    })
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
