/**
 * Build OS — Autonomous Orchestration Engine
 *
 * This module implements the self-executing loop:
 *   detect ready tasks → check guardrails → dispatch → agent runs →
 *   unlock dependencies → detect new ready tasks → repeat
 *
 * All mutations go through existing Phase 2.5 contracts.
 * No RLS bypass. All side effects audited.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/execution'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestrationConfig {
  auto_dispatch:          boolean
  max_parallel_agents:    number
  cost_alert_threshold:   number | null  // null = no limit
  safe_stop:              boolean
  orchestration_mode:     'manual' | 'semi_auto' | 'full_auto'
}

export interface GuardrailResult {
  allowed:          boolean
  reason?:          string
  budget_remaining: number | null
  active_count:     number
  capacity:         number
}

export interface TickResult {
  project_id:        string
  tick_at:           string
  triggered_by:      string
  dispatched_ids:    string[]
  unlocked_ids:      string[]
  guardrail_hit:     boolean
  guardrail_reason?: string
  queue_depth:       number
  active_before:     number
  active_after:      number
  orchestration_run_id?: string
}

export interface OrchestrationStatus {
  project_id:         string
  config:             OrchestrationConfig
  active_count:       number
  ready_count:        number
  pending_count:      number
  completed_count:    number
  failed_count:       number
  blocked_count:      number
  total_cost_usd:     number
  budget_remaining:   number | null
  budget_pct_used:    number | null
  last_tick_at:       string | null
  total_ticks:        number
  loop_healthy:       boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getOrchestrationConfig(
  admin: SupabaseClient,
  projectId: string
): Promise<OrchestrationConfig> {
  const { data } = await admin
    .from('project_settings')
    .select('auto_dispatch, max_parallel_agents, cost_alert_threshold_usd, safe_stop, orchestration_mode')
    .eq('project_id', projectId)
    .single()

  return {
    auto_dispatch:        data?.auto_dispatch        ?? true,
    max_parallel_agents:  data?.max_parallel_agents  ?? 3,
    cost_alert_threshold: data?.cost_alert_threshold_usd ?? null,
    safe_stop:            data?.safe_stop            ?? false,
    orchestration_mode:   data?.orchestration_mode   ?? 'manual',
  }
}

export async function setOrchestrationConfig(
  admin: SupabaseClient,
  projectId: string,
  patch: Partial<{
    auto_dispatch:          boolean
    max_parallel_agents:    number
    cost_alert_threshold_usd: number | null
    safe_stop:              boolean
    orchestration_mode:     string
  }>
) {
  const { data: existing } = await admin
    .from('project_settings')
    .select('id')
    .eq('project_id', projectId)
    .single()

  if (existing) {
    await admin.from('project_settings').update(patch).eq('project_id', projectId)
  } else {
    await admin.from('project_settings').insert({ project_id: projectId, ...patch })
  }
}

// ── Queue inspection ──────────────────────────────────────────────────────────

export async function getTaskCounts(admin: SupabaseClient, projectId: string) {
  const { data: counts } = await admin
    .from('tasks')
    .select('status')
    .eq('project_id', projectId)

  const tally: Record<string, number> = {}
  for (const row of (counts || [])) {
    tally[row.status] = (tally[row.status] || 0) + 1
  }
  return tally
}

/**
 * Find tasks that are 'ready' (can be dispatched now).
 * Excludes tasks that are already dispatched / in_progress (already running).
 * Returns up to `limit` tasks, ordered by priority then order_index.
 */
export async function findReadyTasks(
  admin: SupabaseClient,
  projectId: string,
  limit = 10
): Promise<Array<{ id: string; title: string; agent_role: string; priority: string; order_index: number }>> {
  const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

  const { data } = await admin
    .from('tasks')
    .select('id, title, agent_role, priority, order_index')
    .eq('project_id', projectId)
    .eq('status', 'ready')
    .order('order_index', { ascending: true })
    .limit(50) // fetch more, sort in memory by priority

  if (!data) return []

  return data
    .sort((a: any, b: any) => {
      const pa = PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3
      const pb = PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3
      if (pa !== pb) return pa - pb
      return a.order_index - b.order_index
    })
    .slice(0, limit) as any
}

/**
 * Find pending tasks that can be unlocked because their prerequisites are met.
 * Uses the buildos_find_unlockable_tasks() DB function from migration 014.
 */
export async function findUnlockableTasks(
  admin: SupabaseClient,
  projectId: string
): Promise<Array<{ task_id: string; unlock_reason: string }>> {
  const { data, error } = await admin.rpc('buildos_find_unlockable_tasks', {
    p_project_id: projectId,
  })
  if (error || !data) return []
  return data as Array<{ task_id: string; unlock_reason: string }>
}

/**
 * BUG-3 FIX — Root-task unlock pass.
 *
 * buildos_find_unlockable_tasks() (migration 014) has two unlock paths:
 *   Path 1: order_index > 0, no explicit deps — uses sibling order model
 *   Path 2: tasks that have explicit task_dependencies entries, all deps completed
 *
 * Neither path handles "root tasks" — tasks with order_index = 0 AND no entries
 * in task_dependencies.  These tasks have no prerequisites by definition and
 * should be immediately runnable, but the DB function skips them entirely.
 *
 * This function finds those root tasks so runDependencyUnlock can unlock them.
 */
async function findRootTaskIds(
  admin: SupabaseClient,
  projectId: string,
  excludeIds: string[] = []
): Promise<string[]> {
  // Fetch all pending tasks with order_index = 0
  const { data: candidates } = await admin
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .eq('order_index', 0)

  if (!candidates || candidates.length === 0) return []

  const candidateIds = candidates.map((t: any) => t.id as string)
  const newCandidates = candidateIds.filter(id => !excludeIds.includes(id))
  if (newCandidates.length === 0) return []

  // Exclude any that have explicit task_dependencies entries (they need dep-tracking)
  const { data: depsExist } = await admin
    .from('task_dependencies')
    .select('task_id')
    .in('task_id', newCandidates)

  const withDeps = new Set((depsExist || []).map((d: any) => d.task_id as string))
  const rootIds = newCandidates.filter(id => !withDeps.has(id))

  if (rootIds.length > 0) {
    console.log(
      `[orchestration] BUG-3 root-task pass: ${rootIds.length} unlockable root task(s) found for project ${projectId}`
    )
  }
  return rootIds
}

/**
 * Mark a set of tasks as 'ready' (pending → ready transition).
 * Returns IDs actually updated.
 */
export async function unlockTasks(
  admin: SupabaseClient,
  projectId: string,
  taskIds: string[]
): Promise<string[]> {
  if (taskIds.length === 0) return []

  const { data, error } = await admin
    .from('tasks')
    .update({ status: 'ready' })
    .in('id', taskIds)
    .eq('status', 'pending')         // Only unlock truly pending tasks
    .eq('project_id', projectId)     // Scoped
    .select('id')

  if (error || !data) return []
  return data.map((r: any) => r.id)
}

/**
 * Full dependency unlock pass: find all unlockable tasks and mark them ready.
 * Called after any task completes. Also checks if features/epics are now complete.
 *
 * Combines two unlock sources:
 *   1. buildos_find_unlockable_tasks() DB function (order-index model + explicit deps)
 *   2. BUG-3 root-task pass for order_index=0, no-deps tasks the DB function misses
 */
export async function runDependencyUnlock(
  admin: SupabaseClient,
  projectId: string,
  completedTaskId?: string
): Promise<string[]> {
  // 1. Find all tasks that can be unlocked via the DB function
  const unlockable = await findUnlockableTasks(admin, projectId)
  const idsFromDb = unlockable.map(u => u.task_id)

  // 2. BUG-3 FIX: supplementary root-task pass for order_index=0, no-deps tasks
  //    that the DB function (migration 014) excludes due to `AND t.order_index > 0`.
  const rootIds = await findRootTaskIds(admin, projectId, idsFromDb)

  const idsToUnlock = [...new Set([...idsFromDb, ...rootIds])]

  // 3. Unlock them
  const unlocked = await unlockTasks(admin, projectId, idsToUnlock)

  // 4. Check if any features/epics are now complete (all tasks done)
  if (completedTaskId) {
    await syncFeatureAndEpicStatus(admin, projectId, completedTaskId)
  }

  return unlocked
}

/**
 * After a task completes, check if its parent feature (and epic) are now complete.
 */
async function syncFeatureAndEpicStatus(
  admin: SupabaseClient,
  projectId: string,
  completedTaskId: string
) {
  // Get the task's feature_id
  const { data: task } = await admin
    .from('tasks')
    .select('feature_id')
    .eq('id', completedTaskId)
    .single()

  if (!task) return

  // Check if all non-cancelled tasks in this feature are completed
  const { data: featureTasks } = await admin
    .from('tasks')
    .select('id, status')
    .eq('feature_id', task.feature_id)

  const allDone = (featureTasks || []).every(
    (t: any) => t.status === 'completed' || t.status === 'cancelled'
  )

  if (allDone && featureTasks && featureTasks.length > 0) {
    await admin
      .from('features')
      .update({ status: 'completed' })
      .eq('id', task.feature_id)
      .neq('status', 'completed')

    // Now check if all features in the parent epic are completed
    const { data: feature } = await admin
      .from('features')
      .select('epic_id')
      .eq('id', task.feature_id)
      .single()

    if (feature) {
      const { data: epicFeatures } = await admin
        .from('features')
        .select('id, status')
        .eq('epic_id', feature.epic_id)

      const epicDone = (epicFeatures || []).every(
        (f: any) => f.status === 'completed' || f.status === 'cancelled'
      )

      if (epicDone && epicFeatures && epicFeatures.length > 0) {
        await admin
          .from('epics')
          .update({ status: 'completed' })
          .eq('id', feature.epic_id)
          .neq('status', 'completed')
      }
    }
  }
}

// ── Guardrails ────────────────────────────────────────────────────────────────

/**
 * Check if it is safe to dispatch more tasks.
 * Returns { allowed: false, reason } if any guardrail is tripped.
 */
export async function checkGuardrails(
  admin: SupabaseClient,
  projectId: string,
  config: OrchestrationConfig
): Promise<GuardrailResult> {
  // Safe-stop beats everything
  if (config.safe_stop) {
    return {
      allowed:          false,
      reason:           'safe_stop is enabled — system paused',
      budget_remaining: null,
      active_count:     0,
      capacity:         0,
    }
  }

  // Auto dispatch must be on
  if (!config.auto_dispatch) {
    return {
      allowed:          false,
      reason:           'auto_dispatch is disabled',
      budget_remaining: null,
      active_count:     0,
      capacity:         0,
    }
  }

  // Count active tasks (dispatched + in_progress + awaiting_review + in_qa)
  const { count: activeCount } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('status', ['dispatched', 'in_progress', 'awaiting_review', 'in_qa'])

  const active   = activeCount ?? 0
  const capacity = Math.max(0, config.max_parallel_agents - active)

  if (capacity === 0) {
    return {
      allowed:          false,
      reason:           `max_parallel_agents (${config.max_parallel_agents}) reached — ${active} active`,
      budget_remaining: null,
      active_count:     active,
      capacity:         0,
    }
  }

  // Budget check
  let budgetRemaining: number | null = null
  if (config.cost_alert_threshold !== null) {
    const { data: costModel } = await admin
      .from('cost_models')
      .select('total_cost_usd')
      .eq('project_id', projectId)
      .single()

    const spent = costModel?.total_cost_usd ?? 0
    budgetRemaining = config.cost_alert_threshold - spent

    if (budgetRemaining <= 0) {
      // Auto-enable safe_stop to prevent further spend
      await setOrchestrationConfig(admin, projectId, { safe_stop: true })
      return {
        allowed:          false,
        reason:           `Budget ceiling reached ($${config.cost_alert_threshold.toFixed(2)}) — safe_stop auto-enabled`,
        budget_remaining: budgetRemaining,
        active_count:     active,
        capacity:         0,
      }
    }
  }

  return {
    allowed:          true,
    budget_remaining: budgetRemaining,
    active_count:     active,
    capacity,
  }
}

// ── Core tick ─────────────────────────────────────────────────────────────────

/**
 * Run one iteration of the autonomous loop:
 * 1. Unlock any newly unlockable tasks
 * 2. Check guardrails
 * 3. Find ready tasks
 * 4. Dispatch up to capacity
 * 5. Persist orchestration_run record
 * 6. Return summary
 *
 * Dispatch is done by calling the internal dispatch API.
 * This keeps all idempotency + locking + audit logic in one place.
 */
export async function runOrchestrationTick(
  admin: SupabaseClient,
  projectId: string,
  options: {
    triggeredBy?: string
    userId?: string
    baseUrl?: string    // e.g. http://localhost:3000 — for internal fetch
    tickNumber?: number
  } = {}
): Promise<TickResult> {
  const {
    triggeredBy = 'manual',
    userId,
    baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
    tickNumber,
  } = options

  const tickAt = new Date().toISOString()

  // ── 1. Unlock dependencies ─────────────────────────────────────────────
  const unlockedIds = await runDependencyUnlock(admin, projectId)

  // ── 2. Get config and check guardrails ────────────────────────────────
  const config  = await getOrchestrationConfig(admin, projectId)
  const guardrail = await checkGuardrails(admin, projectId, config)

  const counts = await getTaskCounts(admin, projectId)
  const activeBefore = (counts['dispatched'] || 0) + (counts['in_progress'] || 0)
  const queueDepth   = counts['ready'] || 0

  if (!guardrail.allowed) {
    const run = await persistOrchestrationRun(admin, {
      projectId,
      tickNumber,
      triggeredBy,
      dispatched:       [],
      unlocked:         unlockedIds,
      guardrailHit:     true,
      guardrailReason:  guardrail.reason,
      queueDepth,
      activeBefore,
      activeAfter:      activeBefore,
    })
    return {
      project_id:           projectId,
      tick_at:              tickAt,
      triggered_by:         triggeredBy,
      dispatched_ids:       [],
      unlocked_ids:         unlockedIds,
      guardrail_hit:        true,
      guardrail_reason:     guardrail.reason,
      queue_depth:          queueDepth,
      active_before:        activeBefore,
      active_after:         activeBefore,
      orchestration_run_id: run?.id,
    }
  }

  // ── 3. Find ready tasks ────────────────────────────────────────────────
  const readyTasks = await findReadyTasks(admin, projectId, guardrail.capacity)

  // ── 4. Dispatch each task through /api/dispatch/task ──────────────────
  const dispatchedIds: string[] = []
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || ''

  for (const task of readyTasks) {
    try {
      // ── BUG-5 guard: skip if task already has an active task_run ──────────
      // An active run means n8n already received this task and is executing it.
      // Dispatching again would create a duplicate run, corrupt cost tracking,
      // and leave the task stuck in 'dispatched' state permanently.
      //
      // Non-terminal statuses that indicate an active run:
      //   started, running, processing — n8n/Railway is executing
      //   dispatched  — webhook fired but agent hasn't called back yet
      //
      // We do NOT include: completed, failed, cancelled, error, timed_out
      // (those are terminal — a new dispatch after terminal is valid retry)
      const { data: activeRuns, error: activeRunErr } = await admin
        .from('task_runs')
        .select('id, status')
        .eq('task_id', task.id)
        .in('status', ['started', 'running', 'processing', 'dispatched'])
        .limit(1)

      if (activeRunErr) {
        console.warn(`[orchestration] active-run check failed for task ${task.id} (non-fatal):`, activeRunErr.message)
      } else if (activeRuns && activeRuns.length > 0) {
        console.log(
          `[orchestration] Task ${task.id} already has active run ${activeRuns[0].id} (status=${activeRuns[0].status}) — skipping dispatch (BUG-5 guard)`
        )
        continue
      }

      const idempotencyKey = `orch-tick-${projectId}-${task.id}-${Date.now()}`

      const res = await fetch(`${baseUrl}/api/dispatch/task`, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-Idempotency-Key':  idempotencyKey,
          ...(userId ? { 'X-Buildos-User-Id': userId } : {}),
          ...(BUILDOS_SECRET ? { 'X-Buildos-Secret': BUILDOS_SECRET } : {}),
        },
        body: JSON.stringify({
          task_id:          task.id,
          idempotency_key:  idempotencyKey,
          triggered_by:     'orchestrator',
        }),
      })

      if (res.ok) {
        dispatchedIds.push(task.id)
      } else {
        // Non-fatal: log and continue to next task
        const errBody = await res.json().catch(() => ({}))
        console.error(`[orchestration] dispatch failed for task ${task.id}:`, errBody)
      }
    } catch (dispatchErr) {
      console.error(`[orchestration] dispatch error for task ${task.id}:`, dispatchErr)
    }
  }

  const countsAfter = await getTaskCounts(admin, projectId)
  const activeAfter = (countsAfter['dispatched'] || 0) + (countsAfter['in_progress'] || 0)
  const queueAfter  = countsAfter['ready'] || 0

  // ── 5. Persist orchestration run ──────────────────────────────────────
  const run = await persistOrchestrationRun(admin, {
    projectId,
    tickNumber,
    triggeredBy,
    dispatched:      dispatchedIds,
    unlocked:        unlockedIds,
    guardrailHit:    false,
    queueDepth:      queueAfter,
    activeBefore,
    activeAfter,
  })

  // ── 6. Audit ──────────────────────────────────────────────────────────
  if (dispatchedIds.length > 0 || unlockedIds.length > 0) {
    await writeAuditLog(admin, {
      event_type:    'task_dispatched',
      actor_user_id: userId,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      new_value: {
        event:           'orchestration_tick',
        dispatched_count: dispatchedIds.length,
        unlocked_count:  unlockedIds.length,
        triggered_by:    triggeredBy,
      },
    })
  }

  return {
    project_id:           projectId,
    tick_at:              tickAt,
    triggered_by:         triggeredBy,
    dispatched_ids:       dispatchedIds,
    unlocked_ids:         unlockedIds,
    guardrail_hit:        false,
    queue_depth:          queueAfter,
    active_before:        activeBefore,
    active_after:         activeAfter,
    orchestration_run_id: run?.id,
  }
}

// ── Orchestration run persistence ─────────────────────────────────────────────

async function persistOrchestrationRun(
  admin: SupabaseClient,
  params: {
    projectId:       string
    tickNumber?:     number
    triggeredBy:     string
    dispatched:      string[]
    unlocked:        string[]
    guardrailHit:    boolean
    guardrailReason?: string
    queueDepth:      number
    activeBefore:    number
    activeAfter:     number
  }
): Promise<{ id: string } | null> {
  // Get tick number if not provided
  let tickNum = params.tickNumber
  if (!tickNum) {
    const { count } = await admin
      .from('orchestration_runs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', params.projectId)
    tickNum = (count ?? 0) + 1
  }

  const { data } = await admin
    .from('orchestration_runs')
    .insert({
      project_id:       params.projectId,
      tick_number:      tickNum,
      triggered_by:     params.triggeredBy,
      tasks_dispatched: params.dispatched,
      tasks_unlocked:   params.unlocked,
      guardrail_hit:    params.guardrailHit,
      guardrail_reason: params.guardrailReason || null,
      queue_depth:      params.queueDepth,
      active_before:    params.activeBefore,
      active_after:     params.activeAfter,
      completed_at:     new Date().toISOString(),
    })
    .select('id')
    .single()

  return data as any
}

// ── Status snapshot ────────────────────────────────────────────────────────────

export async function getOrchestrationStatus(
  admin: SupabaseClient,
  projectId: string
): Promise<OrchestrationStatus> {
  const [configResult, countsResult, costResult, costEventsResult, lastRunResult, totalRunsResult] = await Promise.all([
    getOrchestrationConfig(admin, projectId),
    getTaskCounts(admin, projectId),
    admin.from('cost_models').select('total_cost_usd, estimated_total_usd').eq('project_id', projectId).single(),
    admin.from('cost_events').select('total_cost_usd').eq('project_id', projectId),
    admin.from('orchestration_runs').select('created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single(),
    admin.from('orchestration_runs').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  const config     = configResult
  const counts     = countsResult
  // Prefer cost_models; if zero/null, fall back to sum of cost_events (same source as Dashboard)
  const costModelTotal = costResult.data?.total_cost_usd ?? 0
  const costEventsTotal = ((costEventsResult.data as any[]) || []).reduce(
    (s: number, c: any) => s + (Number(c.total_cost_usd) || 0), 0
  )
  const totalCost  = costModelTotal > 0 ? costModelTotal : costEventsTotal
  const estTotal   = costResult.data?.estimated_total_usd ?? null
  const budgetRem  = config.cost_alert_threshold !== null
    ? config.cost_alert_threshold - totalCost
    : null
  const budgetPct  = estTotal && estTotal > 0
    ? Math.round((totalCost / estTotal) * 100)
    : null

  const active  = (counts['dispatched'] || 0) + (counts['in_progress'] || 0)
  const healthy = !config.safe_stop && config.auto_dispatch &&
                  (budgetRem === null || budgetRem > 0)

  return {
    project_id:      projectId,
    config,
    active_count:    active,
    ready_count:     counts['ready']     || 0,
    pending_count:   counts['pending']   || 0,
    completed_count: counts['completed'] || 0,
    failed_count:    counts['failed']    || 0,
    blocked_count:   counts['blocked']   || 0,
    total_cost_usd:  totalCost,
    budget_remaining: budgetRem,
    budget_pct_used:  budgetPct,
    last_tick_at:    lastRunResult.data?.created_at ?? null,
    total_ticks:     totalRunsResult.count ?? 0,
    loop_healthy:    healthy,
  }
}
