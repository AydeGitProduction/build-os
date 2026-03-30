/**
 * /api/wizard-state
 *
 * GET  ?project_id=<uuid>  — fetch wizard state (conversation + readiness) for a project
 * POST                     — upsert wizard state for a project
 *
 * Backed by wizard_conversations + wizard_state tables (P9B migration).
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

// ── GET /api/wizard-state?project_id=<uuid> ───────────────────────────────────
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

  // Fetch from wizard_state (primary) and wizard_conversations (legacy)
  const [stateResult, convResult] = await Promise.all([
    supabase
      .from('wizard_state')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('wizard_conversations')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle(),
  ])

  return NextResponse.json({
    success: true,
    wizard_state: stateResult.data ?? null,
    wizard_conversation: convResult.data ?? null,
    // Unified view — prefer wizard_state if available
    state: stateResult.data
      ? {
          project_id: projectId,
          conversation_history: stateResult.data.conversation_history ?? [],
          iris_complete: stateResult.data.iris_complete ?? false,
          first_user_msg: stateResult.data.first_user_msg ?? null,
          readiness_score: stateResult.data.readiness_score ?? 0,
          updated_at: stateResult.data.updated_at,
        }
      : convResult.data
      ? {
          project_id: projectId,
          conversation_history: convResult.data.messages ?? [],
          iris_complete: convResult.data.trigger_fired ?? false,
          first_user_msg: null,
          readiness_score: convResult.data.readiness ?? 0,
          updated_at: convResult.data.updated_at,
        }
      : null,
  })
}

// ── POST /api/wizard-state ────────────────────────────────────────────────────
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

  const { project_id, conversation_history, iris_complete, first_user_msg, readiness_score } = body as any

  if (!project_id) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  // Upsert wizard_state
  const { data, error } = await supabase
    .from('wizard_state')
    .upsert(
      {
        project_id,
        ...(conversation_history !== undefined && { conversation_history }),
        ...(iris_complete !== undefined && { iris_complete }),
        ...(first_user_msg !== undefined && { first_user_msg }),
        ...(readiness_score !== undefined && { readiness_score }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' },
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also mirror readiness + messages into wizard_conversations for backward compat
  if (conversation_history !== undefined || readiness_score !== undefined || iris_complete !== undefined) {
    await supabase
      .from('wizard_conversations')
      .upsert(
        {
          project_id,
          ...(conversation_history !== undefined && { messages: conversation_history }),
          ...(readiness_score !== undefined && { readiness: readiness_score }),
          ...(iris_complete !== undefined && { trigger_fired: iris_complete }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      )
      .select()
      .maybeSingle()
    // Non-fatal if wizard_conversations upsert fails
  }

  return NextResponse.json({ success: true, data })
}
