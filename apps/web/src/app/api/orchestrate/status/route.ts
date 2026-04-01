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

    // Fetch active agent roles from tasks currently in_progress or dispatched
    const { data: activeTasks } = await admin
      .from('tasks')
      .select('agent_role')
      .eq('project_id', projectId)
      .in('status', ['dispatched', 'in_progress'])

    const activeAgents = (activeTasks ?? [])
      .map((t: { agent_role: string | null }) => t.agent_role ?? 'unknown')
      .filter(Boolean)

    const activeCount  = (raw as { active_count?: number }).active_count   ?? 0
    const readyCount   = (raw as { ready_count?: number }).ready_count     ?? 0
    const pendingCount = (raw as { pending_count?: number }).pending_count ?? 0
    const completedCount = (raw as { completed_count?: number }).completed_count ?? 0
    const failedCount  = (raw as { failed_count?: number }).failed_count   ?? 0
    const blockedCount = (raw as { blocked_count?: number }).blocked_count ?? 0
    const loopHealthy  = (raw as { loop_healthy?: boolean }).loop_healthy  ?? true
    const safeStopped  = (raw as { config?: { safe_stop?: boolean } }).config?.safe_stop ?? false
    const lastTick     = (raw as { last_tick_at?: string | null }).last_tick_at ?? null

    // Derive phase from system state
    const phase =
      safeStopped              ? 'paused'
      : activeCount > 0        ? 'executing'
      : readyCount > 0         ? 'planning'
      : completedCount > 0 && pendingCount === 0 && readyCount === 0 ? 'complete'
      : 'idle'

    // Map to shape expected by useOrchestration (hooks/useOrchestration.ts)
    const mapped = {
      project_id:    projectId,
      phase,
      active_agents: activeAgents,
      task_counts: {
        pending:     pendingCount,
        ready:       readyCount,
        dispatched:  activeCount,
        in_progress: activeCount,
        completed:   completedCount,
        blocked:     blockedCount,
        failed:      failedCount,
        total:       pendingCount + readyCount + activeCount + completedCount + blockedCount + failedCount,
      },
      health_status: loopHealthy ? 'healthy' : 'degraded',
      last_tick:     lastTick,
      watchdog_ok:   loopHealthy,
      run_active:    activeCount > 0 && !safeStopped,
    }

    return NextResponse.json({ data: mapped })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
