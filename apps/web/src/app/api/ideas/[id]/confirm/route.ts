/**
 * PATCH /api/ideas/[id]/confirm
 *
 * Phase 1 — Step 2 Confirmation
 * Sets idea.confirmed = true. [id] is the wizard_conversation.id (idea_id).
 *
 * Body: { session_id? }
 * Returns: { idea_id, project_id, confirmed: true, readiness }
 *
 * Auth: X-Buildos-Secret OR Supabase JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  if (secret && secret === BUILDOS_SECRET) {
    const body = await req.json().catch(() => ({}))
    return handleConfirm(params.id, body, admin)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  return handleConfirm(params.id, body, admin)
}

async function handleConfirm(
  ideaId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  const { session_id } = body

  // Fetch current conversation
  const { data: conv, error: fetchError } = await admin
    .from('wizard_conversations')
    .select('id, project_id, collected_fields, readiness')
    .eq('id', ideaId)
    .single()

  if (fetchError || !conv) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  // Update confirmed = true, bump readiness to 50%
  const updatedFields = {
    ...(conv.collected_fields ?? {}),
    confirmed: true,
    confirmed_at: new Date().toISOString(),
  }

  const { data: updated, error: updateError } = await admin
    .from('wizard_conversations')
    .update({
      collected_fields: updatedFields,
      readiness: 50, // 50% after confirmation
      updated_at: new Date().toISOString(),
    })
    .eq('id', ideaId)
    .select('id, project_id, collected_fields, readiness')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Advance session step if provided
  if (session_id) {
    await admin
      .from('wizard_sessions')
      .update({
        current_step: 'confirmed',
        status: 'IN_PROGRESS',
        metadata: {
          wizard_state: {
            phase: 'confirmed',
            step: 3,
            idea_id: ideaId,
            confirmed: true,
            clarification_done: false,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)
  }

  console.log('[ideas/confirm] Confirmed idea:', ideaId)

  return NextResponse.json({
    idea_id: updated.id,
    project_id: updated.project_id,
    confirmed: true,
    readiness: updated.readiness,
    collected_fields: updated.collected_fields,
  })
}
