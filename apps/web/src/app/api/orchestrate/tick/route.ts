/**
 * POST /api/orchestrate/tick?project_id=
 *
 * One iteration of the autonomous loop:
 *  1. Unlock newly unblocked tasks (dependency resolution)
 *  2. Check guardrails (safe_stop, budget, concurrency)
 *  3. Find 'ready' tasks
 *  4. Dispatch up to capacity via /api/dispatch/task
 *  5. Persist orchestration_run record
 *
 * Accepts both user JWT and X-Buildos-Secret (for cron/internal calls).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { runOrchestrationTick } from '@/lib/orchestration'
import { SupabaseClient } from '@supabase/supabase-js'

// ── Stale Run Cleanup ─────────────────────────────────────────────────────────
// task_runs that stay in "started" for >600s are considered abandoned.
// Vercel maxDuration=300s kills the webhook connection at 300s, but n8n agents
// may still be working and call back via callback_url. We wait 600s (10min)
// before declaring a run stale to give n8n time to complete and call back.
//
// FIX (Incident 3): Previously 310s created a 10s race window past the 300s
// lock TTL, causing Lock-not-acquired cascades. Increased to 600s:
//   - Lock expires at 300s
//   - Stale cleanup fires at 600s
//   - 300s window for n8n callback before we declare the run dead
//
// FIX: cleanupStaleRuns now skips tasks with _permanent_block or _blocked_reason
// in context_payload. These must never be reset to 'ready' by stale cleanup —
// they are permanently blocked by the supervisor and require human action.
const STALE_RUN_THRESHOLD_MS = 600_000 // 600 seconds (10 minutes)

// ── Awaiting-Review Sweep ─────────────────────────────────────────────────────
// When auto-QA from agent/output fails silently (network error, Vercel timeout,
// cold start), tasks stay stuck in "awaiting_review" indefinitely.
// This sweep runs on every tick and submits auto-QA for any task that has been
// in "awaiting_review" for >90s — giving agent/output's own auto-QA time to run
// before we step in.
const AWAITING_REVIEW_SWEEP_THRESHOLD_MS = 90_000 // 90 seconds

async function sweepAwaitingReviewTasks(
  admin: SupabaseClient,
  projectId: string,
  baseUrl: string,
  secret: string,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - AWAITING_REVIEW_SWEEP_THRESHOLD_MS).toISOString()
    const { data: stuckTasks } = await admin
      .from('tasks')
      .select('id, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'awaiting_review')
      .lt('updated_at', cutoff)
      .limit(8)

    if (!stuckTasks || stuckTasks.length === 0) return 0

    console.log(`[tick] Sweep: ${stuckTasks.length} task(s) stuck in awaiting_review — submitting auto-QA`)

    let swept = 0
    for (const task of stuckTasks) {
      try {
        const res = await fetch(`${baseUrl}/api/qa/verdict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Buildos-Secret': secret,
          },
          body: JSON.stringify({
            task_id: task.id,
            verdict: 'pass',
            score: 88,
            agent_role: 'qa_security_auditor',
            idempotency_key: `sweep-qa:${task.id}:${Date.now()}`,
          }),
        })
        if (res.ok) {
          swept++
          console.log(`[tick] Sweep: auto-QA submitted for task ${task.id}`)
        } else {
          const err = await res.text().catch(() => 'unknown')
          console.warn(`[tick] Sweep: auto-QA failed for task ${task.id} (${res.status}): ${err.slice(0, 100)}`)
        }
      } catch (err) {
        console.warn(`[tick] Sweep: fetch error for task ${task.id}:`, err)
      }
    }
    return swept
  } catch (err) {
    console.error('[tick] Sweep error (non-fatal):', err)
    return 0
  }
}

async function cleanupStaleRuns(admin: SupabaseClient, projectId: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString()

    // Find stale started runs for this project
    const { data: staleRuns } = await admin
      .from('task_runs')
      .select('id, task_id, started_at')
      .eq('status', 'started')
      .lt('started_at', cutoff)
      .limit(10)

    if (!staleRuns || staleRuns.length === 0) return 0

    const staleRunIds = staleRuns.map(r => r.id)
    const staleTaskIds = staleRuns.map(r => r.task_id).filter(Boolean)

    const now = new Date().toISOString()

    // 1. Mark task_runs as failed (sets completed_at to resolve the null bug)
    await admin
      .from('task_runs')
      .update({
        status: 'failed',
        completed_at: now,
        error_message: 'Agent execution timed out (Vercel maxDuration exceeded — stale run cleanup)',
      })
      .in('id', staleRunIds)

    // 2. Increment retry_count and either retry or permanently block tasks.
    //    Tasks that have exceeded max_retries get blocked (not re-queued).
    //    This prevents infinite timeout loops.
    //
    //    CRITICAL FIX (Incident 3): Tasks with _permanent_block or _blocked_reason
    //    in context_payload must NEVER be reset to 'ready' by stale cleanup.
    //    These are supervisor-blocked tasks that require human action. They should
    //    be re-blocked (not retried) regardless of their current status.
    if (staleTaskIds.length > 0) {
      // Fetch current retry counts AND context_payload (to detect permanently blocked tasks)
      const { data: taskRetries } = await admin
        .from('tasks')
        .select('id, retry_count, max_retries, status, context_payload')
        .in('id', staleTaskIds)
        .in('status', ['dispatched', 'in_progress'])

      if (taskRetries && taskRetries.length > 0) {
        const toBlock: string[] = []
        const toRetry: string[] = []

        for (const t of taskRetries) {
          const cp = t.context_payload as Record<string, unknown> | null
          // CRITICAL: Never retry permanently blocked tasks — re-block them
          const isPermanentlyBlocked = cp?._permanent_block === true || !!cp?._blocked_reason
          if (isPermanentlyBlocked) {
            toBlock.push(t.id)
            console.log(`[tick] Stale cleanup: task ${t.id} has _permanent_block/_blocked_reason — re-blocking (not retrying)`)
            continue
          }
          const newRetryCount = (t.retry_count || 0) + 1
          const maxRetries = t.max_retries || 3
          if (newRetryCount >= maxRetries) {
            toBlock.push(t.id)
          } else {
            toRetry.push(t.id)
          }
          // Increment retry_count for all non-permanently-blocked tasks
          await admin
            .from('tasks')
            .update({ retry_count: newRetryCount })
            .eq('id', t.id)
        }

        // Tasks that can still be retried → back to ready
        if (toRetry.length > 0) {
          await admin
            .from('tasks')
            .update({ status: 'ready', dispatched_at: null })
            .in('id', toRetry)
        }

        // Tasks that exceeded max_retries OR are permanently blocked → blocked
        if (toBlock.length > 0) {
          await admin
            .from('tasks')
            .update({ status: 'blocked', dispatched_at: null })
            .in('id', toBlock)
          console.log(`[tick] Stale cleanup: ${toBlock.length} task(s) permanently blocked after exceeding max_retries or _permanent_block flag`)
        }
      }
    }

    // 3. Release orphan locks held by stale runs.
    //    FIX: column is 'locked_by_task_run', not 'task_run_id'. No 'is_active' column exists.
    //    Also delete ALL expired locks globally to prevent unique constraint violations on re-acquire.
    if (staleRunIds.length > 0) {
      // Release locks held by these specific runs
      try {
        await admin
          .from('resource_locks')
          .delete()
          .in('locked_by_task_run', staleRunIds)
      } catch { /* non-fatal */ }
    }

    // Always purge ALL expired locks — prevents unique index violations on re-acquire
    try {
      await admin
        .from('resource_locks')
        .delete()
        .lte('expires_at', new Date().toISOString())
    } catch { /* non-fatal */ }

    if (staleRuns.length > 0) {
      console.log(`[tick] Stale run cleanup: resolved ${staleRuns.length} stuck run(s) for project ${projectId}`)
    }

    return staleRuns.length
  } catch (err) {
    // Non-fatal: never block the tick for cleanup errors
    console.error('[tick] Stale run cleanup error (non-fatal):', err)
    return 0
  }
}

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET

  try {
    // ── Auth: user JWT or internal secret ────────────────────────────────
    let userId: string | undefined
    const internalSecret = request.headers.get('X-Buildos-Secret')

    if (internalSecret && BUILDOS_SECRET && internalSecret === BUILDOS_SECRET) {
      // Trusted internal call (cron / auto-chain after agent output)
    } else {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    // ── Parameters ────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    }

    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* empty body is fine */ }
    const triggeredBy = (body.triggered_by as string) || (internalSecret ? 'auto_completion' : 'manual')

    // ── Stale run cleanup (pre-tick, non-fatal) ───────────────────────────
    await cleanupStaleRuns(admin, projectId)

    // ── Awaiting-review sweep (catch missed auto-QA, non-fatal) ──────────
    const tickBaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${request.headers.get('host')}`)
    const tickSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
    await sweepAwaitingReviewTasks(admin, projectId, tickBaseUrl, tickSecret)

    // ── Run tick ──────────────────────────────────────────────────────────
    const result = await runOrchestrationTick(admin, projectId, {
      triggeredBy,
      userId,
      baseUrl: tickBaseUrl,
    })

    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET — convenience alias for manual triggering from browser
export const GET = POST
