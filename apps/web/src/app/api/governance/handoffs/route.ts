/**
 * GET  /api/governance/handoffs
 * POST /api/governance/handoffs
 *
 * Block G5: Governance Memory — Handoff Events
 *
 * GET  — list handoff events (filters: task_id, from_role, to_role, limit)
 * POST — write a handoff event (internal auth required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const task_id   = searchParams.get('task_id')
    const from_role = searchParams.get('from_role')
    const to_role   = searchParams.get('to_role')
    const limit     = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('handoff_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (task_id)   query = query.eq('task_id', task_id)
    if (from_role) query = query.eq('from_role', from_role)
    if (to_role)   query = query.eq('to_role', to_role)

    const { data, error } = await query
    if (error) {
      console.error('[handoffs GET] DB error:', error.message)
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
    const { task_id, from_role, to_role, handoff_type, notes } = body

    if (!task_id)   return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
    if (!from_role || !from_role.trim()) return NextResponse.json({ error: 'from_role is required and must not be empty' }, { status: 400 })
    if (!to_role   || !to_role.trim())   return NextResponse.json({ error: 'to_role is required and must not be empty' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('handoff_events')
      .insert({
        task_id,
        from_role: from_role.trim(),
        to_role: to_role.trim(),
        handoff_type: handoff_type?.trim() || 'dispatch',
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[handoffs POST] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
