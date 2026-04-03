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
 *
 * ── SHADOW MODE SAFETY ────────────────────────────────────────────────────────
 * When SHADOW_MODE=true, Railway (shadow) and n8n (primary) both process every
 * task and both call back to this endpoint. Only primary (n8n) results are
 * authoritative. Shadow results are isolated to the shadow_results table and
 * NEVER affect task.status.
 *
 * Source detection: body.idempotency_key prefix
 *   "shadow:..." → Railway shadow (non-authoritative) → log only, return early
 *   "agent_output:..." → n8n primary (authoritative) → full processing pipeline
 *
 * Primary recovery: if a prior shadow failure raced ahead and set task to
 * "blocked", and the primary now succeeds, we force-recover the task to
 * "awaiting_review". This is the single exception to the isValidTransition
 * gate — it corrects a non-authoritative state, not a legitimate failure.
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
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

    // ── SHADOW SOURCE DETECTION ───────────────────────────────────────────────
    // idempotency_key prefix identifies the execution source:
    //   "shadow:..."       → Railway shadow worker (NON-AUTHORITATIVE)
    //   "agent_output:..." → n8n primary executor  (AUTHORITATIVE)
    //   anything else      → treat as primary (safe default)
    //
    // Railway dispatch sets idempotency_key = "shadow:railway:{task_run_id}"
    // n8n dispatch sets    idempotency_key = "agent_output:{task_run_id}"
    const rawIdempotencyKey = (body.idempotency_key as string | undefined) || ''
    const isShadowCallback = rawIdempotencyKey.startsWith('shadow:')

    if (isShadowCallback) {
      // ── SHADOW PATH: log only, never touch task state ─────────────────────
      // Railway result is stored in shadow_results for observability and
      // reconciliation, but task.status is NEVER changed from here.
      const shadowSource = rawIdempotencyKey.includes('railway') ? 'railway' : 'shadow_worker'

      try {
        await admin.from('shadow_results').insert({
          task_id,
          task_run_id,
          source: shadowSource,
          idempotency_key: rawIdempotencyKey,
          success: success ?? false,
          error_message: error_message || null,
          output_type: output_type || null,
          output_summary: output ? JSON.stringify(output).slice(0, 500) : null,
          raw_payload: {
            agent_role: agent_role || null,
            tokens_used: tokens_used || null,
            model_id: model_id || null,
            cost_usd: cost_usd || null,
          },
        })
        console.log(
          `[agent/output] Shadow result logged: source=${shadowSource} task=${task_id} success=${success}`
        )
      } catch (err) {
        // Non-fatal: shadow logging failure must never block anything
        console.warn('[agent/output] shadow_results insert failed (non-fatal):', err)
      }

      return NextResponse.json(
        {
          data: {
            shadow: true,
            source: shadowSource,
            task_id,
            task_run_id,
            logged: true,
          },
          message: 'Shadow result logged. Task state not modified.',
        },
        { status: 200 }
      )
    }

    // ── PRIMARY PATH: full processing pipeline ────────────────────────────────

    idempotencyKey = rawIdempotencyKey || `agent_output:${task_run_id}`
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

    // ── PRIMARY RECOVERY: shadow race condition override ──────────────────────
    // If this is a successful primary callback but the task is already "blocked",
    // the block was caused by a shadow (Railway) failure that arrived first.
    // Shadow results are non-authoritative — we must override the blocked state.
    //
    // Safety conditions (all must hold):
    //   1. success = true  (primary reports success)
    //   2. oldStatus = "blocked"  (task was blocked by the shadow race)
    //   3. This is the primary path (isShadowCallback = false, already confirmed above)
    //
    // We force the task directly to awaiting_review, bypassing isValidTransition.
    // This is intentional: the blocked state was never a legitimate failure.
    const isShadowRaceRecovery = success === true && oldStatus === 'blocked'

    if (isShadowRaceRecovery) {
      console.log(
        `[agent/output] Shadow race recovery: task ${task_id} unblocked by primary success. ` +
        `Overriding blocked→awaiting_review.`
      )
      await admin
        .from('tasks')
        .update({
          status: 'awaiting_review',
          actual_cost_usd: cost_usd || null,
          completed_at: null,
          failure_detail: null,
          failure_category: null,
        })
        .eq('id', task_id)
    } else if (isValidTransition(oldStatus, newTaskStatus)) {
      await admin
        .from('tasks')
        .update({
          status: newTaskStatus,
          actual_cost_usd: cost_usd || null,
          completed_at: success ? new Date().toISOString() : null,
          // WS4: record failure detail so phantom-block detector can classify it
          failure_detail: !success ? (error_message || 'Agent returned failure') : null,
        })
        .eq('id', task_id)

      // WS4 — STATE MACHINE REPAIR: every blocked transition MUST have a blocker record.
      // Previously tasks could enter status=blocked with 0 rows in the blockers table
      // (phantom block). This guard ensures every block is traceable.
      if (newTaskStatus === 'blocked' && !success) {
        const blockerDescription = error_message || 'Agent execution failed — no output produced'
        try {
          await admin.from('blockers').insert({
            project_id: task.project_id,
            task_id,
            blocker_type: 'technical',
            severity: 'high',
            description: blockerDescription.slice(0, 1000),
            status: 'open',
          })
          console.log(`[agent/output] WS4: blocker record created for task ${task_id}`)
        } catch (blockerErr) {
          // Non-fatal but logged — a missing blocker is recoverable via the consistency validator
          console.warn(`[agent/output] WS4: failed to create blocker for task ${task_id}:`, blockerErr)
        }
      }
    }

    // The effective new status (for downstream steps and audit log)
    const effectiveNewStatus = isShadowRaceRecovery ? 'awaiting_review' : newTaskStatus

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
    // Find lock for this task_run and release it.
    // BUG FIX: column is 'locked_by_task_run', not 'task_run_id' (matches migration 010 schema).
    // Previously this query found nothing, making the manual release a no-op.
    // The auto-release trigger on task_runs handles this correctly, but this
    // manual release acts as a reliable backstop in case the trigger misfires.
    const { data: locks } = await admin
      .from('resource_locks')
      .select('id')
      .eq('locked_by_task_run', task_run_id)
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
      new_value: {
        status: effectiveNewStatus,
        ...(isShadowRaceRecovery ? { recovery_reason: 'shadow_race_override' } : {}),
      },
      metadata: {
        task_run_id,
        output_type,
        success,
        cost_usd,
        tokens_used,
        model_id,
        shadow_race_recovery: isShadowRaceRecovery,
      },
    })

    // ── G5 AUTO-HOOK: governance task_events (status transition) ─────────────
    // Non-fatal: governance logging failure must never block the output response
    try {
      await admin.from('task_events').insert({
        task_id,
        project_id: task.project_id ?? null,
        event_type: 'status_transition',
        actor_type: 'agent',
        actor_id: agent_role || task.agent_role || null,
        details: {
          old_status: oldStatus,
          new_status: effectiveNewStatus,
          success,
          task_run_id,
          shadow_race_recovery: isShadowRaceRecovery,
          output_type: output_type || null,
          model_id: model_id || null,
        },
      })
    } catch (govErr) {
      console.warn('[agent/output] G5 governance task_events insert failed (non-fatal):', govErr)
    }

    const result = {
      task_id,
      task_run_id,
      agent_output_id: agentOutput.id,
      new_task_status: effectiveNewStatus,
      success,
      shadow_race_recovery: isShadowRaceRecovery,
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

      // a) Run REAL QA evaluation (Block G3) — replaces unconditional score=88 pass
      // Awaited (not fire-and-forget) to ensure verdict is recorded before
      // the Vercel function context is torn down on response.
      const agentOutputId = agentOutput?.id || null
      try {
        const { runFullQAPipeline } = await import('@/lib/qa-evaluator')
        const qaInput = {
          task_id,
          project_id: task.project_id as string | null,
          task_type: task.task_type || 'code',
          agent_role: (agent_role || task.agent_role || 'backend_engineer') as string,
          title: task.title || '',
          description: task.description || null,
          retry_count: task.retry_count || 0,
          max_retries: task.max_retries || 3,
          raw_output: (agentOutput as { raw_text?: string | null } | null)?.raw_text || (output ? JSON.stringify(output) : null),
        }
        const { result: qaResult } = await runFullQAPipeline(admin, qaInput)

        // Submit verdict to existing qa/verdict route to handle task status transition
        const verdictForSubmission = qaResult.verdict === 'RETRY_REQUIRED' ? 'fail' : qaResult.verdict.toLowerCase()
        await fetch(`${baseUrl}/api/qa/verdict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Buildos-Secret': BUILDOS_SECRET,
          },
          body: JSON.stringify({
            task_id,
            verdict: verdictForSubmission,
            score: qaResult.score,
            agent_output_id: agentOutputId,
            agent_role: agent_role || task.agent_role || 'qa_security_auditor',
            idempotency_key: `auto-qa:${task_id}:${task_run_id}`,
            issues: qaResult.verdict !== 'PASS' ? [qaResult.notes] : [],
            suggestions: qaResult.suggestion_for_task ? [qaResult.suggestion_for_task] : [],
          }),
        })
        console.log(`[agent/output] Real QA verdict: ${qaResult.verdict} (score=${qaResult.score}) for task ${task_id}`)
      } catch (qaErr) {
        console.warn(`[agent/output] Real QA evaluation failed for task ${task_id}:`, qaErr)
        // Fallback: submit a BLOCKED verdict rather than a fake pass
        try {
          await fetch(`${baseUrl}/api/qa/verdict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': BUILDOS_SECRET },
            body: JSON.stringify({
              task_id,
              verdict: 'fail',
              score: 0,
              agent_output_id: agentOutputId,
              agent_role: agent_role || task.agent_role || 'qa_security_auditor',
              idempotency_key: `auto-qa-fallback:${task_id}:${task_run_id}`,
              issues: ['QA evaluator threw an exception — task blocked for manual review'],
            }),
          })
        } catch {
          console.warn(`[agent/output] Fallback QA verdict also failed for task ${task_id}`)
        }
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

      // c) P0 CODE GENERATION — fire-and-forget call to /api/agent/generate
      // Triggers for code/schema/test task types. Uses raw_text from the agent_output
      // we just wrote. Non-fatal if it fails.
      // This path fires even if n8n workflow hasn't been updated to include the
      // generate step — it ensures generated_files != [] for ALL code-type tasks.
      const CODE_TASK_TYPES = ['code', 'schema', 'test']
      if (agentOutput?.id && CODE_TASK_TYPES.includes(task.task_type || '')) {
        const rawOutputText = agentOutput.raw_text || (output ? JSON.stringify(output) : '')
        // Use waitUntil so Vercel keeps the serverless function alive until the
        // generate call completes — prevents fire-and-forget from being cut short.
        waitUntil(
          fetch(`${baseUrl}/api/agent/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Buildos-Secret': BUILDOS_SECRET,
            },
            body: JSON.stringify({
              project_id: task.project_id,
              task_id,
              agent_output_id: agentOutput.id,
              agent_role: agent_role || task.agent_role,
              raw_output: rawOutputText,
            }),
          }).catch((err) => {
            console.warn(`[agent/output] generate call failed for task ${task_id} (non-fatal):`, err)
          })
        )
        console.log(`[agent/output] Code generation triggered for task ${task_id} (type: ${task.task_type})`)
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
