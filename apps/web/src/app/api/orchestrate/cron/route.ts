/**
 * GET /api/orchestrate/cron
 *
 * Vercel Cron endpoint (configured in vercel.json).
 * Runs one orchestration tick for ALL active projects with auto_dispatch=true.
 * Called every 5 minutes in production.
 *
 * Auth: CRON_SECRET header (set in Vercel dashboard).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { runOrchestrationTick } from '@/lib/orchestration'
import { runSupervisorCheck } from '@/lib/supervisor'

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET

  // Validate cron auth
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminSupabaseClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`

  try {
    // Find all projects with auto_dispatch enabled and not safe-stopped
    const { data: settings } = await admin
      .from('project_settings')
      .select('project_id')
      .eq('auto_dispatch', true)
      .eq('safe_stop', false)

    if (!settings || settings.length === 0) {
      return NextResponse.json({ data: { ticked: 0, message: 'No active auto-dispatch projects' } })
    }

    const secret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
    const results = []

    for (const setting of settings) {
      try {
        // Run supervisor check BEFORE tick — auto-fix stale runs and stuck tasks
        // so the tick operates on a clean state.
        await runSupervisorCheck(admin, setting.project_id, baseUrl, secret)
          .catch(() => {}) // Non-fatal — supervisor failure must never block tick

        const result = await runOrchestrationTick(admin, setting.project_id, {
          triggeredBy: 'cron',
          baseUrl,
        })
        results.push({ project_id: setting.project_id, dispatched: result.dispatched_ids.length, unlocked: result.unlocked_ids.length })
      } catch (err) {
        results.push({ project_id: setting.project_id, error: String(err) })
      }
    }

    return NextResponse.json({
      data: {
        ticked:       results.length,
        results,
        cron_at:      new Date().toISOString(),
      }
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
