/**
 * POST /api/sessions/create
 *
 * Phase 1 — Session System
 * Creates a wizard session and returns session_id + initial wizard_state.
 *
 * Body: { user_id?, project_id? }
 * Returns: { session_id, wizard_state, created_at }
 *
 * Auth: X-Buildos-Secret OR Supabase JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  let userId: string | null = null

  if (secret && secret === BUILDOS_SECRET) {
    const body = await req.json().catch(() => ({}))
    userId = body.user_id ?? null
    return handleCreate(body, userId, admin)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  return handleCreate(body, user.id, admin)
}

async function handleCreate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  userId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  let { project_id } = body

  // wizard_sessions.project_id is NOT NULL — create a draft project if none provided
  if (!project_id) {
    // Resolve workspace_id for this user (required NOT NULL on projects)
    let workspaceId: string | null = null
    if (userId) {
      const { data: wm } = await admin
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      workspaceId = wm?.workspace_id ?? null
    }
    if (!workspaceId) {
      // Fallback: use first workspace in system
      const { data: ws } = await admin.from('workspaces').select('id').limit(1).maybeSingle()
      workspaceId = ws?.id ?? null
    }

    const draftSlug = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { data: draft, error: draftError } = await admin
      .from('projects')
      .insert({
        name: 'Draft Project',
        slug: draftSlug,
        status: 'draft',
        project_type: 'saas',
        bootstrap_status: 'not_started',
        ...(userId ? { created_by: userId } : {}),
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      })
      .select('id')
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: `Draft project creation failed: ${draftError?.message}` }, { status: 500 })
    }
    project_id = draft.id
    console.log('[sessions/create] Created draft project:', project_id)
  }

  // Build initial wizard state
  const wizard_state = {
    phase: 'idea_input',
    step: 1,
    confirmed: false,
    clarification_done: false,
    created_at: new Date().toISOString(),
  }

  const insertPayload: Record<string, unknown> = {
    project_id,
    status: 'OPEN',
    current_step: 'idea_input',
    metadata: { wizard_state },
    ...(userId ? { user_id: userId } : {}),
  }

  const { data: session, error } = await admin
    .from('wizard_sessions')
    .insert(insertPayload)
    .select('id, project_id, status, current_step, metadata, created_at')
    .single()

  if (error) {
    console.error('[sessions/create] Insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[sessions/create] Created session:', session.id)

  return NextResponse.json({
    session_id: session.id,
    wizard_state: session.metadata?.wizard_state ?? wizard_state,
    project_id: session.project_id ?? null,
    created_at: session.created_at,
  }, { status: 201 })
}
