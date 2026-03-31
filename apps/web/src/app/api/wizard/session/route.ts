/**
 * /api/wizard/session
 *
 * POST — Create a new wizard session for a project
 * GET  — List wizard sessions for a project (query: ?project_id=)
 *
 * Auth: Bearer JWT (Supabase auth) OR X-Buildos-Secret (internal)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  let userId: string | null = null

  if (secret && secret === BUILDOS_SECRET) {
    // Internal call — parse user_id from body
    const body = await req.json()
    userId = body.user_id ?? null
    if (!userId) {
      return NextResponse.json({ error: 'user_id required for internal calls' }, { status: 400 })
    }
    const { data, error } = await admin
      .from('wizard_sessions')
      .insert({
        project_id: body.project_id,
        user_id: userId,
        status: 'OPEN',
        metadata: body.metadata ?? {},
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ session: data }, { status: 201 })
  }

  // User JWT call
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  if (!body.project_id) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('wizard_sessions')
    .insert({
      project_id: body.project_id,
      user_id: user.id,
      status: 'OPEN',
      metadata: body.metadata ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ session: data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (secret && secret === BUILDOS_SECRET) {
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    const { data, error } = await admin
      .from('wizard_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ sessions: data })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = admin.from('wizard_sessions').select('*').eq('user_id', user.id)
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ sessions: data })
}
