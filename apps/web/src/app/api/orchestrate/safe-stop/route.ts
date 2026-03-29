/**
 * POST /api/orchestrate/safe-stop?project_id=
 *
 * Immediately halts new dispatch while letting in-flight tasks complete.
 * Sets safe_stop=true + auto_dispatch=false.
 * Returns a state snapshot.
 *
 * Resume by calling /api/orchestrate/activate with { safe_stop: false, auto_dispatch: true }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { setOrchestrationConfig, getOrchestrationStatus } from '@/lib/orchestration'
import { writeAuditLog } from '@/lib/execution'

export async function POST(request: NextRequest) {
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

    // Get state before stopping
    const statusBefore = await getOrchestrationStatus(admin, projectId)

    // Apply safe stop
    await setOrchestrationConfig(admin, projectId, {
      safe_stop:    true,
      auto_dispatch: false,
    })

    await writeAuditLog(admin, {
      event_type:    'project_status_changed',
      actor_user_id: user.id,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      new_value: {
        event:         'safe_stop_activated',
        active_tasks:  statusBefore.active_count,
        queue_depth:   statusBefore.ready_count,
        total_cost:    statusBefore.total_cost_usd,
      },
    })

    const statusAfter = await getOrchestrationStatus(admin, projectId)

    return NextResponse.json({
      data: {
        safe_stop:   true,
        message:     `Safe stop activated. ${statusBefore.active_count} task(s) will complete. No new dispatches.`,
        in_flight:   statusBefore.active_count,
        queue_frozen: statusBefore.ready_count,
        status:      statusAfter,
      }
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
