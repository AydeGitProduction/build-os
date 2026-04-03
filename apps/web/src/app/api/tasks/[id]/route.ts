/**
 * PATCH /api/tasks/[id]
 * Update a single task (status promotion, manual updates).
 * Respects the state machine from execution.ts.
 *
 * GET /api/tasks/[id]
 * Fetch a single task with full context.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { isValidTransition, writeAuditLog } from '@/lib/execution'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .select(`
        id, name, slug, description, status, priority, agent_role,
        task_type, estimated_hours, estimated_cost_usd, actual_cost_usd,
        dispatched_at, completed_at, retry_count, max_retries,
        created_at, updated_at,
        feature:features(id, title, slug, epic:epics(id, title, slug, project_id)),
        task_runs(id, status, started_at, completed_at, cost_usd, error_message, agent_role)
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ data: task })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { status: newStatus, priority, description, notes, context_payload } = body

    // Fetch current task state
    const { data: task } = await supabase
      .from('tasks')
      .select('id, status, project_id, title')
      .eq('id', params.id)
      .single()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}

    // Validate status transition if changing status
    if (newStatus && newStatus !== task.status) {
      if (!isValidTransition(task.status, newStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition: "${task.status}" → "${newStatus}"` },
          { status: 422 }
        )
      }
      updates.status = newStatus
      if (newStatus === 'ready')     updates.dispatched_at = null
      if (newStatus === 'completed') updates.completed_at  = new Date().toISOString()
    }

    if (priority)    updates.priority    = priority
    if (description) updates.description = description
    // B0.3-FIX: allow context_payload backfill for tasks created without it (e.g. IRIS wizard tasks)
    if (context_payload !== undefined) updates.context_payload = context_payload

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { data: updated, error: updateError } = await admin
      .from('tasks')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) throw updateError

    // Audit if status changed
    if (newStatus && newStatus !== task.status) {
      await writeAuditLog(admin, {
        event_type: newStatus === 'completed' ? 'task_completed' :
                    newStatus === 'blocked'   ? 'task_blocked'   : 'task_dispatched',
        actor_user_id: user.id,
        project_id: task.project_id,
        resource_type: 'task',
        resource_id: task.id,
        old_value: { status: task.status },
        new_value: { status: newStatus },
        metadata: { notes, manual_update: true },
      })
    }

    return NextResponse.json({ data: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
