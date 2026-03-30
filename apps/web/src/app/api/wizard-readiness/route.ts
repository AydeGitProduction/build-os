/**
 * /api/wizard-readiness
 *
 * GET ?project_id=<uuid>  — return readiness score + breakdown for a project
 * POST                    — update readiness score for a project
 *
 * Backed by wizard_state + wizard_conversations tables (P9B migration).
 * Auth: user JWT (RLS) or X-Buildos-Secret (internal).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

function isInternalCall(req: NextRequest): boolean {
  const secret = req.headers.get('X-Buildos-Secret')
  const valid = [
    process.env.BUILDOS_SECRET,
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.N8N_WEBHOOK_SECRET,
  ].filter(Boolean)
  return !!(secret && valid.includes(secret))
}

// ── GET /api/wizard-readiness?project_id=<uuid> ───────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  const internal = isInternalCall(req)
  const supabase = internal
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient()

  if (!internal) {
    const { data: { user }, error } = await (supabase as any).auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Get readiness from wizard_state (prefer) then wizard_conversations
  const [stateResult, convResult, assumptionsResult] = await Promise.all([
    supabase.from('wizard_state').select('readiness_score, iris_complete, updated_at').eq('project_id', projectId).maybeSingle(),
    supabase.from('wizard_conversations').select('readiness, trigger_fired, turn_index, updated_at').eq('project_id', projectId).maybeSingle(),
    supabase.from('wizard_assumptions').select('status').eq('project_id', projectId),
  ])

  const readinessScore = stateResult.data?.readiness_score ?? convResult.data?.readiness ?? 0
  const irisComplete = stateResult.data?.iris_complete ?? convResult.data?.trigger_fired ?? false
  const turnIndex = convResult.data?.turn_index ?? 0

  const assumptions = assumptionsResult.data ?? []
  const totalAssumptions = assumptions.length
  const acceptedAssumptions = assumptions.filter((a: any) => a.status === 'accepted' || a.status === 'modified').length
  const pendingAssumptions = assumptions.filter((a: any) => a.status === 'pending').length

  return NextResponse.json({
    success: true,
    project_id: projectId,
    readiness_score: readinessScore,
    iris_complete: irisComplete,
    turn_index: turnIndex,
    assumptions: {
      total: totalAssumptions,
      accepted: acceptedAssumptions,
      pending: pendingAssumptions,
    },
    updated_at: stateResult.data?.updated_at ?? convResult.data?.updated_at ?? null,
  })
}

// ── POST /api/wizard-readiness ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const internal = isInternalCall(req)
  const supabase = internal
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient()

  if (!internal) {
    const { data: { user }, error } = await (supabase as any).auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, readiness_score } = body as any

  if (!project_id || readiness_score === undefined) {
    return NextResponse.json({ error: 'project_id and readiness_score required' }, { status: 400 })
  }

  if (typeof readiness_score !== 'number' || readiness_score < 0 || readiness_score > 100) {
    return NextResponse.json({ error: 'readiness_score must be 0-100' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('wizard_state')
    .upsert(
      { project_id, readiness_score, updated_at: new Date().toISOString() },
      { onConflict: 'project_id' },
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mirror to wizard_conversations
  await supabase
    .from('wizard_conversations')
    .upsert(
      { project_id, readiness: readiness_score, updated_at: new Date().toISOString() },
      { onConflict: 'project_id' },
    )
    .maybeSingle()

  return NextResponse.json({ success: true, data })
}
