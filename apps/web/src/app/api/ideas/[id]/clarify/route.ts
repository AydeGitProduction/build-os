/**
 * POST /api/ideas/[id]/clarify
 *
 * Phase 1 — Minimal Clarification (1 question only)
 * Stores primary_user_action answer. [id] is wizard_conversation.id (idea_id).
 *
 * The only question asked: "What is the primary action your user takes?"
 * Stores the answer in collected_fields.primary_user_action.
 *
 * Body: { primary_user_action: string, session_id? }
 * Returns: { idea_id, project_id, primary_user_action, readiness, stored_fields }
 *
 * Auth: X-Buildos-Secret OR Supabase JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  if (secret && secret === BUILDOS_SECRET) {
    const body = await req.json()
    return handleClarify(params.id, body, admin)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  return handleClarify(params.id, body, admin)
}

async function handleClarify(
  ideaId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  const { primary_user_action, session_id } = body

  if (!primary_user_action?.trim()) {
    return NextResponse.json({ error: 'primary_user_action is required' }, { status: 400 })
  }

  // Fetch current conversation
  const { data: conv, error: fetchError } = await admin
    .from('wizard_conversations')
    .select('id, project_id, collected_fields, messages, turn_index, readiness')
    .eq('id', ideaId)
    .single()

  if (fetchError || !conv) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  // Store clarification in messages and collected_fields
  const messages = conv.messages ?? []
  messages.push({
    role: 'assistant',
    content: 'What is the primary action your user takes in your product?',
    ts: new Date().toISOString(),
    message_type: 'clarification_question',
  })
  messages.push({
    role: 'user',
    content: primary_user_action.trim(),
    ts: new Date().toISOString(),
    message_type: 'clarification_answer',
  })

  const updatedFields = {
    ...(conv.collected_fields ?? {}),
    primary_user_action: primary_user_action.trim(),
    clarification_done: true,
    clarified_at: new Date().toISOString(),
  }

  const { data: updated, error: updateError } = await admin
    .from('wizard_conversations')
    .update({
      messages,
      collected_fields: updatedFields,
      turn_index: (conv.turn_index ?? 1) + 2,
      readiness: 80, // 80% — ready for blueprint generation
      updated_at: new Date().toISOString(),
    })
    .eq('id', ideaId)
    .select('id, project_id, collected_fields, readiness')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Advance session
  if (session_id) {
    await admin
      .from('wizard_sessions')
      .update({
        current_step: 'clarification_done',
        status: 'IN_PROGRESS',
        metadata: {
          wizard_state: {
            phase: 'clarification_done',
            step: 4,
            idea_id: ideaId,
            confirmed: true,
            clarification_done: true,
            ready_for_blueprint: true,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)
  }

  console.log('[ideas/clarify] Clarification stored for idea:', ideaId)

  return NextResponse.json({
    idea_id: updated.id,
    project_id: updated.project_id,
    primary_user_action: primary_user_action.trim(),
    readiness: updated.readiness,
    stored_fields: Object.keys(updated.collected_fields ?? {}),
    next_step: 'blueprint_generation',
    message: 'Clarification complete. Ready for blueprint generation.',
  })
}
