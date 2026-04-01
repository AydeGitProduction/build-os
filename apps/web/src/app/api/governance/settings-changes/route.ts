/**
 * GET  /api/governance/settings-changes
 * POST /api/governance/settings-changes
 *
 * Block G5: Governance Memory — Settings Changes
 *
 * GET  — list settings changes (filters: setting_area, setting_key, limit)
 * POST — record a settings change (internal auth required; reason is mandatory)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const setting_area = searchParams.get('setting_area')
    const setting_key  = searchParams.get('setting_key')
    const limit        = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('settings_changes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (setting_area) query = query.eq('setting_area', setting_area)
    if (setting_key)  query = query.eq('setting_key', setting_key)

    const { data, error } = await query
    if (error) {
      console.error('[settings-changes GET] DB error:', error.message)
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
    const { setting_area, setting_key, previous_value, new_value, reason, changed_by } = body

    if (!setting_area || !setting_area.trim()) return NextResponse.json({ error: 'setting_area is required' }, { status: 400 })
    if (!setting_key  || !setting_key.trim())  return NextResponse.json({ error: 'setting_key is required' }, { status: 400 })
    if (!reason       || !reason.trim())        return NextResponse.json({ error: 'reason is required and must not be empty' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('settings_changes')
      .insert({
        setting_area: setting_area.trim(),
        setting_key:  setting_key.trim(),
        previous_value: previous_value ?? null,
        new_value:      new_value ?? null,
        reason:         reason.trim(),
        changed_by:     changed_by?.trim() || 'system',
      })
      .select()
      .single()

    if (error) {
      console.error('[settings-changes POST] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
