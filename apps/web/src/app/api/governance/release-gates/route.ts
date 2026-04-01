/**
 * GET  /api/governance/release-gates
 * POST /api/governance/release-gates
 *
 * Block G5: Governance Memory — Release Gate Checks
 *
 * GET  — list release gate checks (filters: project_id, gate_name, gate_status, limit)
 * POST — record a release gate check (internal auth required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['passed', 'failed', 'skipped', 'pending']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id  = searchParams.get('project_id')
    const gate_name   = searchParams.get('gate_name')
    const gate_status = searchParams.get('gate_status')
    const limit       = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('release_gate_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (project_id)  query = query.eq('project_id', project_id)
    if (gate_name)   query = query.eq('gate_name', gate_name)
    if (gate_status) query = query.eq('gate_status', gate_status)

    const { data, error } = await query
    if (error) {
      console.error('[release-gates GET] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, meta: { total: data?.length ?? 0, limit } })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [process.env.BUILDOS_INTERNAL_SECRET, process.env.BUILDOS_SECRET].filter(Boolean)
  if (!secret || !validSecrets.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { project_id, gate_name, gate_status, evidence_summary, checked_by } = body

    if (!gate_name   || !gate_name.trim())   return NextResponse.json({ error: 'gate_name is required' }, { status: 400 })
    if (!gate_status || !gate_status.trim()) return NextResponse.json({ error: 'gate_status is required' }, { status: 400 })
    if (!VALID_STATUSES.includes(gate_status)) {
      return NextResponse.json(
        { error: `gate_status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('release_gate_checks')
      .insert({
        project_id:       project_id ?? null,
        gate_name:        gate_name.trim(),
        gate_status:      gate_status.trim(),
        evidence_summary: evidence_summary?.trim() || null,
        checked_by:       checked_by?.trim() || 'system',
      })
      .select()
      .single()

    if (error) {
      console.error('[release-gates POST] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
