/**
 * /api/wizard-assumptions
 *
 * GET  ?project_id=<uuid>   — list all assumptions for a project
 * POST                      — create or bulk-upsert assumptions for a project
 *
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

// ── GET /api/wizard-assumptions?project_id=<uuid> ────────────────────────────
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

  const { data, error } = await supabase
    .from('wizard_assumptions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: data ?? [] })
}

// ── POST /api/wizard-assumptions ─────────────────────────────────────────────
// Body: { project_id, assumptions: [{ assumption_key, label, value, status? }] }
export async function POST(req: NextRequest) {
  const internal = isInternalCall(req)
  const supabase = internal
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient()

  let userId: string | null = null
  if (!internal) {
    const { data: { user }, error } = await (supabase as any).auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, assumptions } = body as any

  if (!project_id || !Array.isArray(assumptions) || assumptions.length === 0) {
    return NextResponse.json({ error: 'project_id and assumptions[] required' }, { status: 400 })
  }

  const rows = assumptions.map((a: any) => ({
    project_id,
    assumption_key: a.assumption_key,
    label: a.label ?? a.assumption_key,
    value: a.value ?? '',
    status: a.status ?? 'pending',
    ...(a.modified_value !== undefined && { modified_value: a.modified_value }),
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('wizard_assumptions')
    .upsert(rows, { onConflict: 'project_id,assumption_key' })
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
