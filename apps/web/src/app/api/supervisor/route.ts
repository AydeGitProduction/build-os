/**
 * GET  /api/supervisor?project_id= — snapshot + classification (read-only)
 * POST /api/supervisor?project_id= — run full check + apply auto-fixes
 *
 * This is the execution layer for the supervisor intelligence model.
 * Claude (lib/supervisor.ts) defines all policies and logic.
 * This route collects signals and executes the decisions Claude made.
 *
 * Auth: admin user JWT OR X-Buildos-Secret (for cron/internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { collectHealthSnapshot, classifyHealth, runSupervisorCheck } from '@/lib/supervisor'

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminSupabaseClient()
    const internalSecret = request.headers.get('X-Buildos-Secret')
    const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

    if (!internalSecret || internalSecret !== BUILDOS_SECRET) {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const snapshot = await collectHealthSnapshot(admin, projectId)
    const classification = classifyHealth(snapshot)

    return NextResponse.json({ data: { snapshot, classification } })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminSupabaseClient()
    const internalSecret = request.headers.get('X-Buildos-Secret')
    const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

    if (!internalSecret || internalSecret !== BUILDOS_SECRET) {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${request.headers.get('host')}`)
    const secret = BUILDOS_SECRET || ''

    const result = await runSupervisorCheck(admin, projectId, baseUrl, secret)

    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
