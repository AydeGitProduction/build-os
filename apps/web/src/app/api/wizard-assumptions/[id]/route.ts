/**
 * /api/wizard-assumptions/[id]
 *
 * PATCH  — update a single assumption (accept / reject / modify)
 * DELETE — remove an assumption
 *
 * Auth: user JWT or X-Buildos-Secret (internal).
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

// ── PATCH /api/wizard-assumptions/[id] ───────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params

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

  const { status, modified_value, value } = body as any

  const allowedStatuses = ['pending', 'accepted', 'rejected', 'modified']
  if (status && !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowedStatuses.join(', ')}` },
      { status: 400 },
    )
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (status) updates.status = status
  if (modified_value !== undefined) updates.modified_value = modified_value
  if (value !== undefined) updates.value = value
  if (userId && (status === 'accepted' || status === 'rejected' || status === 'modified')) {
    updates.acted_by = userId
    updates.acted_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('wizard_assumptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// ── DELETE /api/wizard-assumptions/[id] ──────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params

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

  const { error } = await supabase
    .from('wizard_assumptions')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
