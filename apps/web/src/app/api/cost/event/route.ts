/**
 * POST /api/cost/event
 * Contract: emit_cost_event (Phase 2.5)
 *
 * Appends a cost event to the cost_events ledger (append-only via DB RULE).
 * Also updates cost_model totals for the project.
 *
 * Auth: accepts internal webhook secret OR user JWT.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  checkIdempotency,
  markIdempotencyProcessing,
  completeIdempotency,
  writeAuditLog,
} from '@/lib/execution'

const ALLOWED_EVENT_TYPES = [
  'agent_run', 'api_call', 'storage', 'compute',
  'external_service', 'manual', 'adjustment',
] as const

const ALLOWED_CATEGORIES = [
  'ai', 'automation', 'infrastructure', 'saas', 'storage', 'other',
] as const

// GET /api/cost/event?project_id= — list cost events for a project
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const limit     = parseInt(searchParams.get('limit') || '50')
    const category  = searchParams.get('category')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    let query = supabase
      .from('cost_events')
      .select('id, event_type, category, description, tokens_used, model_id, unit_cost_usd, quantity, total_cost_usd, task_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) throw error

    // Aggregates
    const events = data || []
    const totalSpend = events.reduce((s, e) => s + (e.total_cost_usd || 0), 0)
    const byCategory = events.reduce((acc: Record<string, number>, e) => {
      acc[e.category] = (acc[e.category] || 0) + (e.total_cost_usd || 0)
      return acc
    }, {})

    return NextResponse.json({
      data: events,
      meta: {
        total_events: events.length,
        total_spend_usd: Math.round(totalSpend * 100000) / 100000,
        by_category: byCategory,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

// POST /api/cost/event — emit a cost event
export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  let idempotencyKey = ''
  let operation = 'emit_cost_event'

  try {
    // Auth: accept internal webhook secret OR user JWT
    const webhookSecret = request.headers.get('X-Buildos-Secret')
    const isInternalCall = webhookSecret && webhookSecret === process.env.N8N_WEBHOOK_SECRET

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
    const {
      project_id,
      task_id,
      task_run_id,
      event_type,
      category = 'ai',
      description,
      tokens_used,
      model_id,
      unit_cost_usd,
      quantity = 1,
      recorded_by,
      metadata,
    } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }
    if (!event_type || !ALLOWED_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    if (typeof unit_cost_usd !== 'number' || unit_cost_usd < 0) {
      return NextResponse.json({ error: 'unit_cost_usd must be a non-negative number' }, { status: 400 })
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    idempotencyKey = body.idempotency_key || `cost_event:${project_id}:${Date.now()}`
    operation = 'emit_cost_event'

    // ── Idempotency ────────────────────────────────────────────────────────
    const idempCheck = await checkIdempotency(admin, idempotencyKey, operation)
    if (idempCheck.isDuplicate) {
      return NextResponse.json({ data: idempCheck.cachedResponse, cached: true })
    }
    await markIdempotencyProcessing(admin, idempotencyKey, operation, userId)

    // ── Insert cost event (append-only — DB RULE prevents UPDATE/DELETE) ──
    const { data: costEvent, error: ceError } = await admin
      .from('cost_events')
      .insert({
        project_id,
        task_id:      task_id      || null,
        task_run_id:  task_run_id  || null,
        event_type,
        category,
        description:  description  || `${event_type} event`,
        tokens_used:  tokens_used  || null,
        model_id:     model_id     || null,
        unit_cost_usd,
        quantity,
        recorded_by:  recorded_by  || userId,
        metadata:     metadata     || null,
      })
      .select('id, total_cost_usd')
      .single()

    if (ceError) throw new Error(`Failed to insert cost event: ${ceError.message}`)

    // ── Update cost_model totals ───────────────────────────────────────────
    // Fetch current model + all events total
    const { data: allEvents } = await admin
      .from('cost_events')
      .select('total_cost_usd, category')
      .eq('project_id', project_id)

    if (allEvents) {
      const totalSpend     = allEvents.reduce((s, e) => s + (e.total_cost_usd || 0), 0)
      const aiUsage        = allEvents.filter(e => e.category === 'ai').reduce((s, e) => s + (e.total_cost_usd || 0), 0)
      const automationCost = allEvents.filter(e => e.category === 'automation').reduce((s, e) => s + (e.total_cost_usd || 0), 0)
      const infraCost      = allEvents.filter(e => e.category === 'infrastructure').reduce((s, e) => s + (e.total_cost_usd || 0), 0)
      const saasCost       = allEvents.filter(e => e.category === 'saas').reduce((s, e) => s + (e.total_cost_usd || 0), 0)
      const storageCost    = allEvents.filter(e => e.category === 'storage').reduce((s, e) => s + (e.total_cost_usd || 0), 0)

      await admin
        .from('cost_models')
        .update({
          total_spend_usd:   Math.round(totalSpend * 100000) / 100000,
          ai_usage_usd:      Math.round(aiUsage * 100000) / 100000,
          automation_usd:    Math.round(automationCost * 100000) / 100000,
          infrastructure_usd: Math.round(infraCost * 100000) / 100000,
          saas_usd:          Math.round(saasCost * 100000) / 100000,
          storage_usd:       Math.round(storageCost * 100000) / 100000,
          last_calculated_at: new Date().toISOString(),
        })
        .eq('project_id', project_id)
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'cost_event_emitted',
      actor_user_id: userId === 'system' ? undefined : userId,
      project_id,
      resource_type: 'cost_event',
      resource_id: costEvent.id,
      new_value: { event_type, category, total_cost_usd: costEvent.total_cost_usd },
    })

    const result = {
      cost_event_id: costEvent.id,
      total_cost_usd: costEvent.total_cost_usd,
    }
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
