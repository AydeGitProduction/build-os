/**
 * POST /api/worker/heavy
 *
 * Phase 7.9 WS3 — Heavy Task Worker Endpoint
 *
 * Dedicated execution lane for heavyweight LLM tasks:
 *   - Test suite generation
 *   - Schema migrations
 *   - RLS / security audits
 *   - Any task classified as execution_lane='heavy'
 *
 * Contract: same as /api/agent/execute but:
 *   1. maxDuration = 300s (vs n8n cloud which times out earlier)
 *   2. Tags executor_used = 'inline-heavy' on task_run
 *   3. Records runtime_ms start/end
 *   4. Direct Claude call — no n8n intermediary
 *
 * Payload (same as dispatch/task sends):
 *   { task_id, task_run_id, project_id, agent_role, task_type,
 *     task_name, description, context_payload, callback_url,
 *     idempotency_key, model_id?, cost_ceiling_usd?, routing_rule? }
 *
 * Response:
 *   { done: true, executor: 'inline-heavy', task_id, runtime_ms }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

// 5-minute timeout — heavy tasks need time for large Claude responses
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  const BUILDOS_SECRET =
    process.env.BUILDOS_INTERNAL_SECRET ||
    process.env.BUILDOS_SECRET ||
    ''
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  // ── 1. Validate internal secret ──────────────────────────────────────────
  const incomingSecret =
    request.headers.get('X-Buildos-Secret') ||
    request.headers.get('X-N8N-Signature')?.replace('sha256=', '') ||
    ''

  if (BUILDOS_SECRET && incomingSecret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 2. Parse payload ──────────────────────────────────────────────────────
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { task_id, task_run_id, callback_url } = payload
  if (!task_id || !task_run_id || !callback_url) {
    return NextResponse.json(
      { error: 'Missing required fields: task_id, task_run_id, callback_url' },
      { status: 400 }
    )
  }

  // ── 3. Tag executor_used = 'inline-heavy' on task_run ────────────────────
  try {
    const admin = createAdminSupabaseClient()
    await admin
      .from('task_runs')
      .update({ executor_used: 'inline-heavy' })
      .eq('id', task_run_id as string)
  } catch (tagErr) {
    console.warn('[worker/heavy] executor_used tag failed (non-fatal):', tagErr)
  }

  // ── 4. Forward to agent/execute execution engine ─────────────────────────
  // Delegate to the existing agent execution engine. This keeps all agent
  // logic in one place while giving heavy tasks their own endpoint + timeout.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://${request.headers.get('host')}` ||
    'http://localhost:3000'

  try {
    const execResponse = await fetch(`${appUrl}/api/agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Buildos-Secret': BUILDOS_SECRET,
      },
      body: JSON.stringify(payload),
    })

    const runtimeMs = Date.now() - startedAt

    // ── 5. Record runtime_ms on task_run ──────────────────────────────────
    try {
      const admin = createAdminSupabaseClient()
      await admin
        .from('task_runs')
        .update({ runtime_ms: runtimeMs })
        .eq('id', task_run_id as string)
    } catch (rttErr) {
      console.warn('[worker/heavy] runtime_ms update failed (non-fatal):', rttErr)
    }

    const execBody = await execResponse.json().catch(() => ({}))

    console.log(`[worker/heavy] task=${task_id} done in ${runtimeMs}ms status=${execResponse.status}`)

    return NextResponse.json({
      done: true,
      executor: 'inline-heavy',
      task_id,
      runtime_ms: runtimeMs,
      upstream_status: execResponse.status,
      upstream_result: execBody,
    }, { status: execResponse.ok ? 200 : execResponse.status })

  } catch (execErr: unknown) {
    const runtimeMs = Date.now() - startedAt
    const message = execErr instanceof Error ? execErr.message : 'Execution failed'
    console.error(`[worker/heavy] task=${task_id} failed after ${runtimeMs}ms:`, message)

    // Best-effort runtime record
    try {
      const admin = createAdminSupabaseClient()
      await admin
        .from('task_runs')
        .update({ runtime_ms: runtimeMs })
        .eq('id', task_run_id as string)
    } catch { /* non-fatal */ }

    return NextResponse.json({ error: message, task_id, runtime_ms: runtimeMs }, { status: 500 })
  }
}
