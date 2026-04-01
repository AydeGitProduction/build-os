/**
 * GET  /api/governance/manual-overrides
 * POST /api/governance/manual-overrides
 *
 * Block G5: Governance Memory — Manual Override Log
 *
 * GET  — list manual overrides (filters: override_type, target_entity_type, target_entity_id, limit)
 * POST — record a manual override (internal auth required; reason is mandatory)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const override_type       = searchParams.get('override_type')
    const target_entity_type  = searchParams.get('target_entity_type')
    const target_entity_id    = searchParams.get('target_entity_id')
    const limit               = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('manual_override_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (override_type)      query = query.eq('override_type', override_type)
    if (target_entity_type) query = query.eq('target_entity_type', target_entity_type)
    if (target_entity_id)   query = query.eq('target_entity_id', target_entity_id)

    const { data, error } = await query
    if (error) {
      console.error('[manual-overrides GET] DB error:', error.message)
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
    const { override_type, target_entity_type, target_entity_id, reason, performed_by } = body

    if (!override_type      || !override_type.trim())      return NextResponse.json({ error: 'override_type is required' }, { status: 400 })
    if (!target_entity_type || !target_entity_type.trim()) return NextResponse.json({ error: 'target_entity_type is required' }, { status: 400 })
    if (!target_entity_id   || !String(target_entity_id).trim()) return NextResponse.json({ error: 'target_entity_id is required' }, { status: 400 })
    if (!reason             || !reason.trim())             return NextResponse.json({ error: 'reason is required and must not be empty' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('manual_override_log')
      .insert({
        override_type:      override_type.trim(),
        target_entity_type: target_entity_type.trim(),
        target_entity_id:   String(target_entity_id).trim(),
        reason:             reason.trim(),
        performed_by:       performed_by?.trim() || 'system',
      })
      .select()
      .single()

    if (error) {
      console.error('[manual-overrides POST] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
