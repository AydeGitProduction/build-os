/**
 * GET /api/orchestrate/status?project_id=
 * Returns the current orchestration status snapshot.
 *
 * FIX (autopilot-stats): Previously returned raw lib/orchestration shape
 * (active_count, ready_count, loop_healthy, ...) which did NOT match the
 * shape expected by useOrchestration hook (active_agents[], task_counts{},
 * health_status, run_active, phase). This caused Autopilot mode to always
 * show 0 agents / 0 tasks / Idle.
 *
 * Now maps the lib response to the hook-expected shape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrchestrationStatus } from '@/lib/orchestration'

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    }

    const raw = await getOrchestrationStatus(admin, projectId)

    // Fetch live task counts directly from DB (more accurate than lib summary)
    const { data: taskRows } = await admin
      .from('tasks')
      .select('status, agent_role')
      .eq('project_id', projectId)

    type TaskRow = { status: string; agent_role: string | null }
    const rows: TaskRow[] = taskRows ?? []

    const countByStatus = (s: string) => rows.filter(r => r.status === s).length
    const pendingCount    = countByStatus('pending')
    const readyCount      = countByStatus('ready')
    const dispatchedCount = countByStatus('dispatched')
    const inProgressCount = countByStatus('in_progress')
    const completedCount  = countByStatus('completed')
    const blockedCount    = countByStatus('blocked')
    const failedCount     = countByStatus('failed')
    const activeCount     = dispatchedCount + inProgressCount

    const activeAgents = rows
      .filter(r => r.status === 'dispatched' || r.status === 'in_progress')
      .map(r => r.agent_role ?? 'unknown')
      .filter(Boolean)

    const loopHealthy = (raw as { loop_healthy?: boolean }).loop_healthy ?? true
    const safeStopped = (raw as { config?: { safe_stop?: boolean } }).config?.safe_stop ?? false
    const lastTick    = (raw as { last_tick_at?: string | null }).last_tick_at ?? null

    // Derive phase from system state
    const phase =
      safeStopped                                                         ? 'paused'
      : activeCount > 0                                                   ? 'executing'
      : readyCount > 0                                                    ? 'planning'
      : completedCount > 0 && pendingCount === 0 && readyCount === 0     ? 'complete'
      : 'idle'

    // Return flat shape expected by useOrchestration hook (hooks/useOrchestration.ts)
    // NOTE: do NOT wrap in { data: ... } — apiGet already stores full JSON as result.data
    const mapped = {
      project_id:    projectId,
      phase,
      active_agents: activeAgents,
      task_counts: {
        pending:     pendingCount,
        ready:       readyCount,
        dispatched:  dispatchedCount,
        in_progress: inProgressCount,
        completed:   completedCount,
        blocked:     blockedCount,
        failed:      failedCount,
        total:       rows.length,
      },
      health_status: loopHealthy ? 'healthy' : 'degraded',
      last_tick:     lastTick,
      watchdog_ok:   loopHealthy,
      run_active:    activeCount > 0 && !safeStopped,
    }

    return NextResponse.json(mapped)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
