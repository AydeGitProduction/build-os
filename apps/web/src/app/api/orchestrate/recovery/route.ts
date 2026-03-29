/**
 * POST /api/orchestrate/recovery?project_id=
 *
 * Runs the task-splitting & timeout recovery scan for a project.
 * Called by the watchdog on every run (or manually by supervisor).
 *
 * Recovery strategies applied:
 *   retry_same       — reset failed task to ready (first failure)
 *   reroute_worker   — change priority and reset to ready
 *   reduce_scope     — narrow the task title/description and retry
 *   split_task       — create child tasks, mark parent as blocked/split
 *   escalate_manual  — mark task as blocked with escalation flag
 *
 * Auth: X-Buildos-Secret (internal) or admin JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { runRecoveryScan } from '@/lib/task-recovery'

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret       = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  const admin  = createAdminSupabaseClient()
  let projectId: string | null = null

  if (secret && secret === BUILDOS_SECRET) {
    // Internal call (watchdog / cron)
    projectId = request.nextUrl.searchParams.get('project_id')
  } else {
    // Try user JWT
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    projectId = request.nextUrl.searchParams.get('project_id')
  }

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  // ── Optional dry-run mode ───────────────────────────────────────────────────
  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dry_run === true

  // ── Run recovery scan ───────────────────────────────────────────────────────
  const result = await runRecoveryScan(admin, projectId, { dryRun })

  console.log(`[recovery] project=${projectId} scanned=${result.scanned} recovered=${result.recovered.length} dry=${dryRun}`)

  return NextResponse.json({
    project_id: projectId,
    dry_run:    dryRun,
    scanned:    result.scanned,
    recovered:  result.recovered.length,
    skipped:    result.skipped,
    errors:     result.errors,
    strategies: result.recovered.reduce((acc, r) => {
      acc[r.strategy_applied] = (acc[r.strategy_applied] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    details:    result.recovered,
  })
}

/**
 * GET /api/orchestrate/recovery?project_id=
 * Returns recovery stats: how many tasks were split, escalated, or rerouted.
 */
export async function GET(request: NextRequest) {
  const secret       = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  const admin  = createAdminSupabaseClient()
  let authorized = false

  if (secret && secret === BUILDOS_SECRET) {
    authorized = true
  } else {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) authorized = true
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  // Count tasks in various recovery states
  const [splitTasks, escalatedTasks, reducedTasks, reroutedTasks] = await Promise.all([
    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'blocked')
      .contains('context_payload', { _split_state: 'split_into_children' }),

    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'blocked')
      .not('context_payload->_escalation', 'is', null),

    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .not('context_payload->_original_title', 'is', null),

    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .contains('context_payload', { _last_recovery: { strategy: 'reroute_worker' } }),
  ])

  // Count child tasks (tasks with _split.parent_task_id in context_payload)
  const { data: childTasksRaw } = await admin.from('tasks')
    .select('id, context_payload')
    .eq('project_id', projectId)
    .not('context_payload->_split', 'is', null)

  const childTasks = (childTasksRaw || []) as Array<{ id: string; context_payload: Record<string, any> | null }>

  return NextResponse.json({
    project_id:      projectId,
    split_parents:   splitTasks.count ?? 0,
    escalated:       escalatedTasks.count ?? 0,
    reduced_scope:   reducedTasks.count ?? 0,
    rerouted:        reroutedTasks.count ?? 0,
    child_tasks:     childTasks.filter(t => t.context_payload?._split?.parent_task_id).length,
  })
}
