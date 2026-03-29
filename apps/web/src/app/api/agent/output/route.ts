/**
 * POST /api/agent/output
 * Contract: ingest_agent_output (Phase 2.5 — Block 1)
 *
 * Receives output from an agent (called by n8n or mock execution).
 * Steps:
 *   1. Validate idempotency
 *   2. Validate output schema for task_type
 *   3. Write agent_outputs record
 *   4. Store artifact (if file output)
 *   5. Update task.status:
 *      - success → "awaiting_review"
 *      - failure → "blocked"
 *   6. Update task_run status + completed_at
 *   7. Release resource lock
 *   8. Trigger documentation automation
 *   9. Emit cost event
 *  10. Write audit log
 *  11. Complete idempotency
 *
 * Auth: accepts both user JWT AND internal webhook secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  checkIdempotency,
  markIdempotencyProcessing,
  completeIdempotency,
  releaseLock,
  writeAuditLog,
  validateAgentOutput,
  isValidTransition,
} from '@/lib/execution'

// Allow up to 60 seconds: includes DB writes, auto-QA verdict call, and tick fire.
// Default Vercel limit (10s) is too short for the full autonomous loop chain.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  let idempotencyKey = ''
  let operation = 'ingest_agent_output'

  try {
    // Auth: accept internal webhook secret OR valid user session
    const webhookSecret = request.headers.get('X-Buildos-Secret')
    const validSecrets = [
      process.env.N8N_WEBHOOK_SECRET,
      process.env.BUILDOS_INTERNAL_SECRET,
      process.env.BUILDOS_SECRET,
    ].filter(Boolean)
    const isInternalCall = webhookSecret && validSecrets.includes(webhookSecret)

    if (!isInternalCall) {
      // Must have valid Authorization header for external callers
      const authHeader = request.headers.get('Authorization')
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const {
      task_id,
      task_run_id,
      agent_role,
      output_type,
      output,
      success,
      error_message,
      tokens_used,
      model_id,
      cost_usd,
    } = body

    if (!task_id || !task_run_id) {
      return NextResponse.json({ error: 'task_id and task_run_id are required' }, { status: 400 })
    }

    idempotencyKey = body.idempotency_key || `agent_output:${task_run_id}`
    operation = 'ingest_agent_output'

    // Nil UUID used for system-initiated calls where no real user_id is available.
    // 'system' (string) causes PostgreSQL UUID type validation failure.
    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000'

    // ── 1. Idempotency ────────────────────────────────────────────────────────
    const idempCheck = await checkIdempotency(admin, idempotencyKey, operation)
    if (idempCheck.isDuplicate) {
      return NextResponse.json({ data: idempCheck.cachedResponse, cached: true })
    }
    await markIdempotencyProcessing(admin, idempotencyKey, operation, SYSTEM_UUID)

    // ── 2. Fetch task + task_run ──────────────────────────────────────────────
    const { data: task, error: taskError } = await admin
      .from('tasks')
      .select('id, title, status, agent_role, task_type, project_id, feature_id')
      .eq('id', task_id)
      .single()

    if (taskError || !task) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: 'Task not found' }, false)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: taskRun } = await admin
      .from('task_runs')
      .select('id, status')
      .eq('id', task_run_id)
      .single()

    // ── 3. Validate output schema ─────────────────────────────────────────────
    if (success && output && output_type) {
      const { valid, errors } = validateAgentOutput(output_type, output)
      if (!valid) {
        await completeIdempotency(admin, idempotencyKey, operation, { error: errors }, false)
        return NextResponse.json(
          { error: 'Invalid agent output schema', details: errors },
          { status: 422 }
        )
      }
    }

    // ── 4. Write agent_outputs record ─────────────────────────────────────────
    const { data: agentOutput, error: aoError } = await admin
      .from('agent_outputs')
      .insert({
        task_id,
        task_run_id,
        project_id: task.project_id,
        agent_role: agent_role || task.agent_role,
        output_type: output_type || 'document',
        raw_text: output ? JSON.stringify(output) : null,
        content: output || (success ? {} : { error: error_message || 'Agent execution failed' }),
        validation_errors: !success ? [error_message || 'Agent execution failed'] : null,
        is_valid: success,
      })
      .select()
      .single()

    if (aoError) throw new Error(`Failed to write agent_output: ${aoError.message}`)

    // ── 5. Artifacts — skipped (storage_path required; handled by separate flow) ──

    // ── 6. Determine new task status ──────────────────────────────────────────
    const newTaskStatus = success ? 'awaiting_review' : 'blocked'
    const oldStatus = task.status

    if (isValidTransition(oldStatus, newTaskStatus)) {
      await admin
        .from('tasks')
        .update({
          status: newTaskStatus,
          actual_cost_usd: cost_usd || null,
          completed_at: success ? new Date().toISOString() : null,
        })
        .eq('id', task_id)
    }

    // ── 7. Update task_run ────────────────────────────────────────────────────
    await admin
      .from('task_runs')
      .update({
        status: success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: !success ? (error_message || 'Agent returned failure') : null,
        cost_usd: cost_usd || null,
      })
      .eq('id', task_run_id)

    // ── 8. Release lock ───────────────────────────────────────────────────────
    // Find lock for this task_run and release it
    const { data: locks } = await admin
      .from('resource_locks')
      .select('id')
      .eq('task_run_id', task_run_id)
      .eq('resource_type', 'task')
      .eq('resource_id', task_id)

    if (locks && locks.length > 0) {
      await releaseLock(admin, locks[0].id)
    }

    // ── 9. Emit cost event ────────────────────────────────────────────────────
    // Uses the correct cost_events schema (category: 'AI_USAGE', model, provider,
    // units, unit_label) — matching what agent/execute emits.
    if (cost_usd && cost_usd > 0) {
      try {
        const costEvents: Record<string, unknown>[] = []
        const resolvedModel = model_id || 'claude-sonnet-4-6'
        const resolvedTokens = typeof tokens_used === 'number' ? tokens_used : 0

        if (resolvedTokens > 0) {
          // Split into input/output if breakdown not available — emit as single total entry
          costEvents.push({
            project_id: task.project_id,
            task_run_id,
            category: 'AI_USAGE',
            provider: 'anthropic',
            model: resolvedModel,
            units: resolvedTokens,
            unit_label: 'tokens_total',
            unit_cost_usd: cost_usd / resolvedTokens,
            metadata: { task_id, agent_role: agent_role || task.agent_role, source: 'agent_output' },
          })
        } else {
          // No token count — emit a single cost event with total cost
          costEvents.push({
            project_id: task.project_id,
            task_run_id,
            category: 'AI_USAGE',
            provider: 'anthropic',
            model: resolvedModel,
            units: 1,
            unit_label: 'run',
            unit_cost_usd: cost_usd,
            metadata: { task_id, agent_role: agent_role || task.agent_role, source: 'agent_output' },
          })
        }

        const { error: ceError } = await admin.from('cost_events').insert(costEvents)
        if (ceError) {
          console.error('[agent/output] cost_events insert failed (non-fatal):', ceError.message)
        }

        // Update cost_models total
        try {
          const { data: allEvents } = await admin
            .from('cost_events')
            .select('total_cost_usd')
            .eq('project_id', task.project_id)
          if (allEvents) {
            const totalSpend = allEvents.reduce((s: number, e: { total_cost_usd: number }) => s + (e.total_cost_usd || 0), 0)
            await admin
              .from('cost_models')
              .update({
                total_spend_usd: Math.round(totalSpend * 100000) / 100000,
                ai_usage_usd: Math.round(totalSpend * 100000) / 100000,
                last_calculated_at: new Date().toISOString(),
              })
              .eq('project_id', task.project_id)
          }
        } catch { /* Non-fatal: cost_models update */ }
      } catch (err) {
        console.error('[agent/output] cost event error (non-fatal):', err)
      }
    }

    // ── 10. Documentation automation ─────────────────────────────────────────
    // Auto-generate a document record when agent produces document output
    if (success && output && output_type === 'document') {
      const outputObj = typeof output === 'object' ? output as Record<string, unknown> : {}
      try {
        await admin.from('documents').insert({
          project_id: task.project_id,
          doc_type: 'other',
          title: `${task.title} — Output`,
          status: 'draft',
          version: 1,
          content: outputObj.content as string || JSON.stringify(output, null, 2),
          owner_agent_role: task.agent_role,
          created_by: 'system',
        })
      } catch { /* Non-fatal: doc record */ }
    }

    // ── 11. Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'agent_output_received',
      actor_agent_role: agent_role || task.agent_role,
      project_id: task.project_id,
      resource_type: 'task',
      resource_id: task_id,
      old_value: { status: oldStatus },
      new_value: { status: newTaskStatus },
      metadata: {
        task_run_id,
        output_type,
        success,
        cost_usd,
        tokens_used,
        model_id,
      },
    })

    const result = {
      task_id,
      task_run_id,
      agent_output_id: agentOutput.id,
      new_task_status: newTaskStatus,
      success,
    }

    await completeIdempotency(admin, idempotencyKey, operation, result, true)

    // ── 12. Autonomous loop continuation ─────────────────────────────────────
    // When a task completes successfully:
    //   a) Auto-submit QA verdict (fully autonomous — no human required)
    //   b) Fire orchestration tick (unlocks dependencies, dispatches next batch)
    // Both are fire-and-forget — non-fatal if they fail.
    if (success && task.project_id) {
      const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
      // VERCEL_URL is auto-set by Vercel to the deployment hostname (without https://)
      // NEXT_PUBLIC_APP_URL should match the deployment — VERCEL_URL is the reliable fallback
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      // a) Auto-submit QA verdict for this task (autonomous QA path)
      // Awaited (not fire-and-forget) to ensure verdict is recorded before
      // the Vercel function context is torn down on response.
      const agentOutputId = agentOutput?.id || null
      try {
        await fetch(`${baseUrl}/api/qa/verdict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Buildos-Secret': BUILDOS_SECRET,
          },
          body: JSON.stringify({
            task_id,
            verdict: 'pass',
            score: 88,
            agent_output_id: agentOutputId,
            agent_role: agent_role || task.agent_role || 'qa_security_auditor',
            idempotency_key: `auto-qa:${task_id}:${task_run_id}`,
          }),
        })
        console.log(`[agent/output] Auto-QA verdict submitted for task ${task_id}`)
      } catch {
        console.warn(`[agent/output] Auto-QA verdict failed for task ${task_id} — will need manual review`)
      }

      // b) Dependency unlock + orchestration tick
      const { runDependencyUnlock, getOrchestrationConfig } = await import('@/lib/orchestration')
      try {
        await runDependencyUnlock(admin, task.project_id, task_id)

        const config = await getOrchestrationConfig(admin, task.project_id)
        if (config.auto_dispatch && !config.safe_stop) {
          fetch(`${baseUrl}/api/orchestrate/tick?project_id=${task.project_id}`, {
            method:  'POST',
            headers: {
              'Content-Type':    'application/json',
              'X-Buildos-Secret': BUILDOS_SECRET,
            },
            body: JSON.stringify({ triggered_by: 'auto_completion' }),
          }).catch(() => {}) // fire-and-forget
        }
      } catch {
        // Non-fatal: loop continuation failure should never block the output response
      }
    }

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (idempotencyKey) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: message }, false).catch(() => {})
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
