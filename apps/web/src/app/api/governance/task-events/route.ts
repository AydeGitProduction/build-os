/**
 * GET  /api/governance/task-events
 * POST /api/governance/task-events
 *
 * Block G5: Governance Memory — Task Events
 *
 * GET  — list task events (filters: task_id, project_id, event_type, limit)
 * POST — write a task event (internal auth required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const task_id    = searchParams.get('task_id')
    const project_id = searchParams.get('project_id')
    const event_type = searchParams.get('event_type')
    const limit      = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

    const admin = createAdminSupabaseClient()
    let query = admin
      .from('task_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (task_id)    query = query.eq('task_id', task_id)
    if (project_id) query = query.eq('project_id', project_id)
    if (event_type) query = query.eq('event_type', event_type)

    const { data, error } = await query
    if (error) {
      console.error('[task-events GET] DB error:', error.message)
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
    const { task_id, project_id, event_type, actor_type, actor_id, details } = body

    if (!task_id)    return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
    if (!event_type) return NextResponse.json({ error: 'event_type is required and must not be empty' }, { status: 400 })
    if (!event_type.trim()) return NextResponse.json({ error: 'event_type must not be empty' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('task_events')
      .insert({
        task_id,
        project_id: project_id ?? null,
        event_type: event_type.trim(),
        actor_type: actor_type?.trim() || 'system',
        actor_id: actor_id ?? null,
        details: details ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[task-events POST] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
