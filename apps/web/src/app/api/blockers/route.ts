/**
 * POST /api/blockers
 * Contract: create_blocker (Phase 2.5)
 *
 * Creates a blocker record, attaches to task, detects duplicates (5-min window),
 * updates task.status → "blocked".
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  checkIdempotency,
  markIdempotencyProcessing,
  completeIdempotency,
  writeAuditLog,
} from '@/lib/execution'

// GET /api/blockers?project_id=&task_id= — list blockers
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const taskId    = searchParams.get('task_id')
    const resolved  = searchParams.get('resolved')

    let query = supabase
      .from('blockers')
      .select(`
        id, task_id, description, severity, resolution, resolved_at, created_at,
        task:tasks(id, title, status, agent_role)
      `)
      .order('created_at', { ascending: false })

    if (taskId)  query = query.eq('task_id', taskId)
    if (resolved === 'false') query = query.is('resolved_at', null)
    if (resolved === 'true')  query = query.not('resolved_at', 'is', null)

    // Filter by project via tasks join
    if (projectId) {
      const { data: taskIds } = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', projectId)
      if (taskIds) {
        query = query.in('task_id', taskIds.map((t: any) => t.id))
      }
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// POST /api/blockers — create a blocker
export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  let idempotencyKey = ''
  let operation = 'create_blocker'

  try {
    // Accept both user auth and internal webhook secret
    const webhookSecret = request.headers.get('X-Buildos-Secret')
    const validSecrets = [
      process.env.N8N_WEBHOOK_SECRET,
      process.env.BUILDOS_INTERNAL_SECRET,
      process.env.BUILDOS_SECRET,
    ].filter(Boolean)
    const isInternalCall = !!(webhookSecret && validSecrets.includes(webhookSecret))

    let userId = 'system'
    if (!isInternalCall) {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const body = await request.json()
    const { task_id, description, severity = 'high', task_run_id } = body

    if (!task_id || !description?.trim()) {
      return NextResponse.json({ error: 'task_id and description are required' }, { status: 400 })
    }

    idempotencyKey = body.idempotency_key || `blocker:${task_id}:${Date.now()}`
    operation = 'create_blocker'

    // ── Idempotency + duplicate detection ────────────────────────────────────
    const idempCheck = await checkIdempotency(admin, idempotencyKey, operation)
    if (idempCheck.isDuplicate) {
      return NextResponse.json({ data: idempCheck.cachedResponse, cached: true })
    }

    // Duplicate detection: same task, same description within 5 minutes
    const { data: dup } = await admin.rpc('buildos_find_duplicate_blocker', {
      p_task_id: task_id,
      p_description: description.trim(),
    })

    if (dup) {
      await completeIdempotency(admin, idempotencyKey, operation, { duplicate_blocker_id: dup }, false)
      return NextResponse.json(
        { error: 'A similar blocker was already created for this task in the last 5 minutes', duplicate_id: dup },
        { status: 409 }
      )
    }

    await markIdempotencyProcessing(admin, idempotencyKey, operation, userId)

    // ── Fetch task ─────────────────────────────────────────────────────────
    const { data: task } = await admin
      .from('tasks')
      .select('id, title, status, project_id')
      .eq('id', task_id)
      .single()

    if (!task) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: 'Task not found' }, false)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // ── Create blocker ─────────────────────────────────────────────────────
    const { data: blocker, error: blockerError } = await admin
      .from('blockers')
      .insert({
        task_id,
        description: description.trim(),
        severity,
        reported_by: userId === 'system' ? null : userId,
      })
      .select()
      .single()

    if (blockerError) throw new Error(blockerError.message)

    // ── Update task status → blocked ──────────────────────────────────────
    const oldStatus = task.status
    await admin
      .from('tasks')
      .update({ status: 'blocked' })
      .eq('id', task_id)

    // ── Update task_run if provided ────────────────────────────────────────
    if (task_run_id) {
      await admin
        .from('task_runs')
        .update({ status: 'failed', error_message: description.trim() })
        .eq('id', task_run_id)
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'blocker_created',
      actor_user_id: userId === 'system' ? undefined : userId,
      project_id: task.project_id,
      resource_type: 'task',
      resource_id: task_id,
      old_value: { status: oldStatus },
      new_value: { status: 'blocked' },
      metadata: { blocker_id: blocker.id, severity, description: description.trim() },
    })

    const result = { blocker_id: blocker.id, task_id, new_task_status: 'blocked' }
    await completeIdempotency(admin, idempotencyKey, operation, result, true)

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (idempotencyKey) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: message }, false).catch(() => {})
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH /api/blockers/[id] — resolve a blocker
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const blockerId = searchParams.get('id')
    if (!blockerId) {
      return NextResponse.json({ error: 'Blocker id required as query param ?id=' }, { status: 400 })
    }

    const body = await request.json()
    const { resolution } = body

    const admin = createAdminSupabaseClient()
    const { data: blocker, error } = await admin
      .from('blockers')
      .update({ resolution: resolution || 'Resolved', resolved_at: new Date().toISOString() })
      .eq('id', blockerId)
      .select('id, task_id')
      .single()

    if (error || !blocker) {
      return NextResponse.json({ error: 'Blocker not found' }, { status: 404 })
    }

    // Unblock task → ready
    await admin.from('tasks').update({ status: 'ready' }).eq('id', blocker.task_id)

    return NextResponse.json({ data: { blocker_id: blockerId, task_status: 'ready' } })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
