/**
 * POST /api/routing/classify
 *
 * Classify a task and return the full routing decision.
 * Used by debugging tools and the routing panel UI.
 *
 * Body: { task_id: string } or full task payload
 * Auth: X-Buildos-Secret or user JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { decide as routingDecide, classifyTask, MODEL_IDS } from '@/lib/routing'

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  // Auth
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_INTERNAL_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  if (!internalSecret || internalSecret !== BUILDOS_INTERNAL_SECRET) {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await request.json()
  const { task_id } = body

  if (!task_id && !body.agent_role) {
    return NextResponse.json({ error: 'task_id or task payload required' }, { status: 400 })
  }

  let task = body
  if (task_id) {
    const { data, error } = await admin
      .from('tasks')
      .select('id, title, description, agent_role, task_type, context_payload, project_id')
      .eq('id', task_id)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    task = data
  }

  const decision = await routingDecide(task, admin, null)

  return NextResponse.json({
    data: {
      task_id: task.id,
      profile:          decision.profile,
      model:            decision.model,
      model_id:         MODEL_IDS[decision.model],
      runtime:          decision.runtime,
      rule_name:        decision.rule_name,
      cost_ceiling_usd: decision.cost_ceiling_usd,
      rationale:        decision.rationale,
      fallback_used:    decision.fallback_used,
      decision_ms:      decision.decision_ms,
      retry_policy:     decision.retry_policy,
    }
  })
}
