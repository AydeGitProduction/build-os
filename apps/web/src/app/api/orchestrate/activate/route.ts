/**
 * POST /api/orchestrate/activate?project_id=
 *
 * Activate or configure the autonomous orchestration loop.
 *
 * Body:
 *   {
 *     mode:                    'manual' | 'semi_auto' | 'full_auto'
 *     auto_dispatch:           boolean
 *     max_parallel_agents:     number (1-20)
 *     cost_alert_threshold_usd: number | null
 *     safe_stop:               boolean
 *   }
 *
 * After activation:
 *   - If mode is 'full_auto' or auto_dispatch=true: immediately runs a tick
 *   - Returns current orchestration status
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { setOrchestrationConfig, getOrchestrationStatus, runOrchestrationTick } from '@/lib/orchestration'
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

    const body = await request.json()
    const {
      mode,
      auto_dispatch,
      max_parallel_agents,
      cost_alert_threshold_usd,
      safe_stop,
    } = body

    // ── Validate ──────────────────────────────────────────────────────────
    if (mode && !['manual', 'semi_auto', 'full_auto'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }
    if (max_parallel_agents !== undefined && (max_parallel_agents < 1 || max_parallel_agents > 20)) {
      return NextResponse.json({ error: 'max_parallel_agents must be 1-20' }, { status: 400 })
    }

    // ── Apply config ──────────────────────────────────────────────────────
    const patch: Record<string, unknown> = {}
    if (mode                    !== undefined) patch.orchestration_mode       = mode
    if (auto_dispatch           !== undefined) patch.auto_dispatch            = auto_dispatch
    if (max_parallel_agents     !== undefined) patch.max_parallel_agents      = max_parallel_agents
    if (cost_alert_threshold_usd !== undefined) patch.cost_alert_threshold_usd = cost_alert_threshold_usd
    if (safe_stop               !== undefined) patch.safe_stop                = safe_stop

    if (Object.keys(patch).length > 0) {
      await setOrchestrationConfig(admin, projectId, patch as any)
    }

    // ── Audit ─────────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type:    'project_status_changed',
      actor_user_id: user.id,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      new_value: {
        event:           'orchestration_configured',
        config_changes:  patch,
      },
    })

    // ── If activating full_auto or auto_dispatch → run first tick ─────────
    const shouldTick = (auto_dispatch === true) ||
                       (mode === 'full_auto') ||
                       (mode === 'semi_auto' && auto_dispatch !== false)

    let tickResult = null
    if (shouldTick && safe_stop !== true) {
      try {
        tickResult = await runOrchestrationTick(admin, projectId, {
          triggeredBy: 'api',
          userId:      user.id,
          baseUrl:     process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`,
        })
      } catch {
        // Non-fatal: activation succeeds even if tick fails
      }
    }

    // ── Return current status ─────────────────────────────────────────────
    const status = await getOrchestrationStatus(admin, projectId)

    return NextResponse.json({
      data: {
        configured:  true,
        status,
        tick_result: tickResult,
        message: auto_dispatch === false || safe_stop === true
          ? 'Orchestration paused'
          : mode === 'full_auto'
            ? 'Full autonomous mode activated — system is self-executing'
            : 'Orchestration configured and tick triggered',
      }
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
