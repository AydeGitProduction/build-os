/**
 * POST /api/orchestrate/watchdog
 *
 * Global watchdog for stuck task executions — called by the n8n watchdog workflow
 * every 5 minutes. Does NOT require project_id — operates across ALL active projects.
 *
 * Detects and recovers:
 *   1. Tasks stuck in "dispatched" for > 10 minutes (agent never acknowledged)
 *   2. Tasks stuck in "in_progress" for > 15 minutes (agent started but never completed)
 *   3. Task runs stuck in "running" for > 20 minutes (leaked run records)
 *   4. Expired resource locks (> lock TTL)
 *
 * Auth: X-Buildos-Secret header only (internal n8n → server call)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { runRecoveryScan } from '@/lib/task-recovery'

const DISPATCHED_STALE_MINUTES  = 10
const IN_PROGRESS_STALE_MINUTES = 15
const RUN_STALE_MINUTES         = 20

export async function POST(request: NextRequest) {
  // Auth: internal secret only
  const secret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const now = new Date()

  const result = {
    checked_at:          now.toISOString(),
    dispatched_reset:    0,
    in_progress_reset:   0,
    runs_reset:          0,
    locks_cleared:       0,
    projects_ticked:     [] as string[],
    errors:              [] as string[],
  }

  try {
    // ── 1. Reset tasks stuck in "dispatched" ──────────────────────────────────
    const dispatchedCutoff = new Date(now.getTime() - DISPATCHED_STALE_MINUTES * 60_000).toISOString()
    const { data: staleDispatched, error: e1 } = await admin
      .from('tasks')
      .select('id, project_id')
      .eq('status', 'dispatched')
      .lt('dispatched_at', dispatchedCutoff)

    if (e1) {
      result.errors.push(`stale-dispatched query: ${e1.message}`)
    } else if (staleDispatched && staleDispatched.length > 0) {
      const ids = staleDispatched.map((t: any) => t.id)
      await admin
        .from('tasks')
        .update({ status: 'ready', dispatched_at: null })
        .in('id', ids)

      // CRITICAL FIX: Release resource locks for stale-reset tasks.
      // Without this, the next dispatch attempt fails with "Lock not acquired"
      // because the lock is still active (not yet expired) even though the
      // task has been reset to 'ready'. This causes retry_count to increment
      // on every watchdog cycle until the task permanently fails.
      try {
        await admin
          .from('resource_locks')
          .delete()
          .in('resource_id', ids)
          .eq('resource_type', 'task')
      } catch (lockErr: any) {
        result.errors.push(`lock-release for stale-dispatched: ${lockErr.message}`)
      }

      result.dispatched_reset = ids.length

      // Collect affected project IDs for tick
      const projectIds = [...new Set(staleDispatched.map((t: any) => t.project_id))] as string[]
      result.projects_ticked.push(...projectIds.filter(id => !result.projects_ticked.includes(id)))
    }

    // ── 2. Reset tasks stuck in "in_progress" ────────────────────────────────
    const inProgressCutoff = new Date(now.getTime() - IN_PROGRESS_STALE_MINUTES * 60_000).toISOString()
    const { data: staleInProgress, error: e2 } = await admin
      .from('tasks')
      .select('id, project_id')
      .eq('status', 'in_progress')
      .lt('updated_at', inProgressCutoff)

    if (e2) {
      result.errors.push(`stale-in_progress query: ${e2.message}`)
    } else if (staleInProgress && staleInProgress.length > 0) {
      const ids = staleInProgress.map((t: any) => t.id)
      await admin
        .from('tasks')
        .update({ status: 'ready' })
        .in('id', ids)

      result.in_progress_reset = ids.length

      const projectIds = [...new Set(staleInProgress.map((t: any) => t.project_id))] as string[]
      for (const pid of projectIds) {
        if (!result.projects_ticked.includes(pid)) result.projects_ticked.push(pid)
      }
    }

    // ── 3. Reset stale task_runs ──────────────────────────────────────────────
    const runCutoff = new Date(now.getTime() - RUN_STALE_MINUTES * 60_000).toISOString()
    const { data: staleRuns, error: e3 } = await admin
      .from('task_runs')
      .select('id')
      .in('status', ['started', 'running'])
      .lt('started_at', runCutoff)

    if (e3) {
      result.errors.push(`stale-runs query: ${e3.message}`)
    } else if (staleRuns && staleRuns.length > 0) {
      const ids = staleRuns.map((r: any) => r.id)
      await admin
        .from('task_runs')
        .update({
          status: 'failed',
          error_message: `Watchdog: run exceeded ${RUN_STALE_MINUTES}m without completion`,
          completed_at: now.toISOString(),
        })
        .in('id', ids)

      result.runs_reset = ids.length
    }

    // ── 4. Clean expired resource locks ──────────────────────────────────────
    const { data: expiredLocks, error: e4 } = await admin
      .from('resource_locks')
      .select('id')
      .lt('expires_at', now.toISOString())

    if (e4) {
      result.errors.push(`expired-locks query: ${e4.message}`)
    } else if (expiredLocks && expiredLocks.length > 0) {
      const ids = expiredLocks.map((l: any) => l.id)
      await admin.from('resource_locks').delete().in('id', ids)
      result.locks_cleared = ids.length
    }

    // ── 5. Run task-splitting / timeout recovery scan ─────────────────────────
    const recoveryResults: Record<string, any> = {}
    const uniqueProjects = [...new Set([
      ...result.projects_ticked,
      // Also scan all active projects for failed tasks even if no stale tasks this tick
    ])]

    // Get all active projects (not just ones with stale tasks this tick)
    const { data: activeProjects } = await admin
      .from('projects')
      .select('id')
      .in('status', ['active', 'in_progress', 'ready_for_release'])
      .limit(20)

    const allProjectIds = [...new Set([
      ...uniqueProjects,
      ...(activeProjects || []).map((p: any) => p.id),
    ])]

    for (const projectId of allProjectIds) {
      try {
        const recovery = await runRecoveryScan(admin, projectId)
        if (recovery.scanned > 0 || recovery.recovered.length > 0) {
          recoveryResults[projectId] = {
            scanned:   recovery.scanned,
            recovered: recovery.recovered.length,
            strategies: recovery.recovered.reduce((acc: Record<string, number>, r) => {
              acc[r.strategy_applied] = (acc[r.strategy_applied] || 0) + 1
              return acc
            }, {}),
          }
          // Add project to ticked list if we created child tasks
          const hadSplits = recovery.recovered.some(r => r.strategy_applied === 'split_task' && r.success)
          if (hadSplits && !result.projects_ticked.includes(projectId)) {
            result.projects_ticked.push(projectId)
          }
        }
      } catch (recoveryErr: any) {
        result.errors.push(`recovery scan ${projectId}: ${recoveryErr.message}`)
      }
    }

    // ── 6. Fire orchestration tick for affected projects ──────────────────────
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:3000`)

    for (const projectId of result.projects_ticked) {
      fetch(`${appUrl}/api/orchestrate/tick?project_id=${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Buildos-Secret': BUILDOS_SECRET,
        },
        body: JSON.stringify({ triggered_by: 'watchdog' }),
      }).catch(() => {})
    }

    const totalRecovered = Object.values(recoveryResults).reduce((sum: number, r: any) => sum + (r.recovered || 0), 0)

    return NextResponse.json({
      data: {
        ...result,
        recovery: recoveryResults,
        summary: `Watchdog: reset ${result.dispatched_reset} dispatched + ${result.in_progress_reset} in_progress tasks, cleared ${result.locks_cleared} locks, recovered ${totalRecovered} failed tasks, ticked ${result.projects_ticked.length} projects`,
      }
    })

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Watchdog internal error' },
      { status: 500 }
    )
  }
}

// GET — health check / last run summary (no auth required for monitoring)
export async function GET() {
  return NextResponse.json({
    data: {
      status: 'active',
      thresholds: {
        dispatched_stale_minutes:  DISPATCHED_STALE_MINUTES,
        in_progress_stale_minutes: IN_PROGRESS_STALE_MINUTES,
        run_stale_minutes:         RUN_STALE_MINUTES,
      },
      description: 'Global watchdog — detects stuck tasks, runs recovery scan (split/reroute/escalate), clears expired locks, fires ticks',
      recovery_strategies: ['retry_same', 'reroute_worker', 'reduce_scope', 'split_task', 'escalate_manual'],
    }
  })
}
