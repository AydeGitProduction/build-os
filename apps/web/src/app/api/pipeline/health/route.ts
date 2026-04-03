/**
 * GET /api/pipeline/health
 *
 * Public monitoring endpoint — no auth required.
 * Returns aggregate task pipeline counts and system health indicators.
 *
 * Query params:
 *   ?title_search=text  — search tasks by title (case-insensitive)
 *
 * Used by: supervisor monitoring, health checks, CI dashboards
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

const STATUSES = ['ready', 'dispatched', 'in_progress', 'awaiting_review', 'completed', 'blocked', 'cancelled', 'pending'] as const

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  const checkedAt = new Date().toISOString()

  const { searchParams } = new URL(request.url)
  const titleSearch = searchParams.get('title_search') ?? ''

  try {
    // ── Efficient per-status counts (avoids 1000-row default limit) ──────────
    const counts: Record<string, number> = {}
    let total = 0

    await Promise.all(STATUSES.map(async (status) => {
      const { count } = await admin
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
      counts[status] = count ?? 0
      total += count ?? 0
    }))

    // ── Recent task_run activity (last 30 minutes) ───────────────────────────
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
    const { count: recentActivity } = await admin
      .from('task_runs')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', cutoff)

    // ── DLQ size ─────────────────────────────────────────────────────────────
    const { count: dlqCount } = await admin
      .from('job_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'dead')

    // ── Open blockers ────────────────────────────────────────────────────────
    const { count: openBlockers } = await admin
      .from('blockers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')

    const healthy =
      (counts['blocked'] ?? 0) === 0 &&
      (dlqCount ?? 0) === 0 &&
      (recentActivity ?? 0) > 0

    // ── Blocked task details ─────────────────────────────────────────────────
    const { data: blockedTasks } = await admin
      .from('tasks')
      .select('id, title, status, failure_detail, retry_count, updated_at')
      .eq('status', 'blocked')
      .order('updated_at', { ascending: false })
      .limit(20)

    // ── Awaiting review tasks ────────────────────────────────────────────────
    const { data: awaitingTasks } = await admin
      .from('tasks')
      .select('id, title, status, updated_at')
      .eq('status', 'awaiting_review')
      .order('updated_at', { ascending: false })
      .limit(15)

    // ── Title search (for U1-B or specific task queries) ─────────────────────
    let searchResults: Array<{
      id: string
      title: string
      status: string
      failure_detail: string | null
      retry_count: number
      updated_at: string
    }> = []

    const effectiveSearch = titleSearch || '[U1-B'
    const { data: searchTasks } = await admin
      .from('tasks')
      .select('id, title, status, failure_detail, retry_count, updated_at')
      .ilike('title', `%${effectiveSearch}%`)
      .order('updated_at', { ascending: false })
      .limit(20)

    searchResults = (searchTasks ?? []).map(t => ({
      id:             t.id.slice(0, 8),
      title:          t.title,
      status:         t.status,
      failure_detail: t.failure_detail ?? null,
      retry_count:    t.retry_count ?? 0,
      updated_at:     t.updated_at,
    }))

    return NextResponse.json({
      data: {
        checked_at:      checkedAt,
        healthy,
        task_counts:     counts,
        total_tasks:     total,
        recent_runs_30m: recentActivity ?? 0,
        dlq_size:        dlqCount ?? 0,
        open_blockers:   openBlockers ?? 0,
        pipeline_status: healthy ? 'ACTIVE' : 'DEGRADED',
        deployed_commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'unknown',
        blocked_tasks: (blockedTasks ?? []).map(t => ({
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
        u1b_tasks: searchResults,
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
