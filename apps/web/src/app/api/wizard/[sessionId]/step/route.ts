/**
 * /api/wizard/[sessionId]/step
 *
 * POST — Add a step to a wizard session
 * GET  — List steps for a session
 *
 * Auth: Bearer JWT OR X-Buildos-Secret
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

interface StepRouteContext {
  params: { sessionId: string }
}

export async function POST(req: NextRequest, { params }: StepRouteContext) {
  const { sessionId } = params
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  // Verify session exists
  const { data: session, error: sessErr } = await admin
    .from('wizard_sessions')
    .select('id, user_id, status')
    .eq('id', sessionId)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!(secret && secret === BUILDOS_SECRET)) {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || user.id !== session.user_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json()
  if (!body.step_type || body.step_number == null) {
    return NextResponse.json({ error: 'step_type and step_number required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('wizard_steps')
    .insert({
      session_id: sessionId,
      step_number: body.step_number,
      step_type: body.step_type,
      data: body.data ?? {},
      completed_at: body.completed ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Update session status to IN_PROGRESS
  if (session.status === 'OPEN') {
    await admin
      .from('wizard_sessions')
      .update({ status: 'IN_PROGRESS', current_step: body.step_type })
      .eq('id', sessionId)
  }

  return NextResponse.json({ step: data }, { status: 201 })
}

export async function GET(req: NextRequest, { params }: StepRouteContext) {
  const { sessionId } = params
  const admin = createAdminSupabaseClient()
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET

  if (!(secret && secret === BUILDOS_SECRET)) {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { data, error } = await admin
    .from('wizard_steps')
    .select('*')
    .eq('session_id', sessionId)
    .order('step_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ steps: data })
}
