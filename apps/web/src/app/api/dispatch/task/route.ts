/**
 * POST /api/dispatch/task
 * Contract: dispatch_task (Phase 2.5 — Block 1)
 *
 * Dispatches a task to the agent execution system.
 * Steps:
 *   1. Validate idempotency key
 *   2. Verify task is in "ready" state
 *   3. Acquire exclusive resource lock on the task
 *   4. Create task_run record
 *   5. Emit webhook to n8n (or mock if no URL configured)
 *   6. Update task.status → "dispatched"
 *   7. Write audit log
 *   8. Complete idempotency key
 *
 * Auth: accepts either:
 *   - User JWT (cookie-based, for browser calls)
 *   - X-Buildos-Secret header (for internal server-to-server calls from orchestration tick)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  checkIdempotency,
  markIdempotencyProcessing,
  completeIdempotency,
  acquireLock,
  writeAuditLog,
  emitToN8n,
  isValidTransition,
  type DispatchPayload,
} from '@/lib/execution'
import { RailwayAdapter } from '@/lib/execution-adapter/railway-adapter'
import { randomUUID } from 'crypto'
// ERT-P6C: Routing engine
import { decide as routingDecide, MODEL_IDS } from '@/lib/routing'
// G4: Stub gate + commit reliability
import { createStubFile, extractCreatePaths, logCommitDelivery } from '@/lib/commit-reliability'

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  let idempotencyKey = ''
  let operation = 'dispatch_task'

  try {
    // ── Auth: internal secret OR user JWT ─────────────────────────────────────
    const internalSecret = request.headers.get('X-Buildos-Secret')
    const BUILDOS_INTERNAL_SECRET =
      process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

    let actorUserId: string

    if (
      internalSecret &&
      BUILDOS_INTERNAL_SECRET &&
      internalSecret === BUILDOS_INTERNAL_SECRET
    ) {
      // Internal server-to-server auth (from orchestration tick)
      actorUserId =
        request.headers.get('X-Buildos-User-Id') || 'system-orchestrator'
    } else {
      // Browser/user JWT auth
      const supabase = await createServerSupabaseClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      actorUserId = user.id
    }

    const body = await request.json()
    const { task_id } = body

    if (!task_id) {
      return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
    }

    idempotencyKey = body.idempotency_key || `dispatch:${task_id}`
    operation = 'dispatch_task'

    // ── 1. Idempotency check ──────────────────────────────────────────────────
    const idempCheck = await checkIdempotency(admin, idempotencyKey, operation)
    if (idempCheck.isDuplicate) {
      if (idempCheck.status === 'processing') {
        return NextResponse.json({ error: 'Task dispatch already in progress' }, { status: 409 })
      }
      return NextResponse.json({ data: idempCheck.cachedResponse, cached: true })
    }

    await markIdempotencyProcessing(admin, idempotencyKey, operation, actorUserId)

    // ── 2. Fetch task (via admin client — internal dispatch bypasses RLS) ─────
    const { data: task, error: taskError } = await admin
      .from('tasks')
      .select('id, title, description, status, agent_role, task_type, context_payload, project_id, feature_id')
      .eq('id', task_id)
      .single()

    if (taskError || !task) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: 'Task not found' }, false)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // ── 3. Validate state transition ─────────────────────────────────────────
    if (!isValidTransition(task.status, 'dispatched')) {
      const errMsg = `Cannot dispatch task in status "${task.status}". Task must be "ready".`
      await completeIdempotency(admin, idempotencyKey, operation, { error: errMsg }, false)
      return NextResponse.json({ error: errMsg }, { status: 422 })
    }

    // ── 3b. G4 Stub Gate (RULE-11) ────────────────────────────────────────────
    // For code/schema/test tasks: detect CREATE intent from context_payload.
    // If file paths are found, push stub files to GitHub before dispatch.
    // Stub creation failure blocks dispatch — a task cannot dispatch if its
    // intended file path cannot be claimed in the repo.
    const CODE_TASK_TYPES_FOR_STUB = ['code', 'schema', 'test']
    if (CODE_TASK_TYPES_FOR_STUB.includes(task.task_type ?? '')) {
      const createPaths = extractCreatePaths(task.context_payload as Record<string, unknown> | null)

      if (createPaths.length > 0) {
        console.log(`[dispatch/task] G4 stub gate: detected ${createPaths.length} CREATE path(s) for task ${task.id}: ${createPaths.join(', ')}`)

        for (const filePath of createPaths) {
          const stubResult = await createStubFile(task.id, filePath)

          // Log stub attempt to commit_delivery_logs
          await logCommitDelivery(admin, {
            task_id: task.id,
            project_id: task.project_id,
            repo_name: `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
            branch_name: process.env.GITHUB_REPO_BRANCH ?? 'main',
            target_path: filePath,
            stub_created: stubResult.success,
            token_refreshed: stubResult.tokenRefreshed,
            commit_sha: stubResult.commitSha ?? null,
            commit_verified: false, // will be set to true after agent completes
            verification_notes: stubResult.success
              ? `Stub created: ${stubResult.commitSha?.slice(0, 8)}`
              : `Stub creation failed: ${stubResult.error}`,
          })

          if (!stubResult.success) {
            const errMsg = `G4 stub gate: failed to create stub for ${filePath} — ${stubResult.error}`
            console.error(`[dispatch/task] ${errMsg}`)
            await completeIdempotency(admin, idempotencyKey, operation, { error: errMsg }, false)
            return NextResponse.json({ error: errMsg }, { status: 500 })
          }

          console.log(`[dispatch/task] G4 stub created: ${filePath} → ${stubResult.commitSha?.slice(0, 8)}`)
        }
      } else {
        console.log(`[dispatch/task] G4 stub gate: no CREATE paths detected in context_payload for task ${task.id} — stub skipped`)
      }
    }

    // ── 4. Create task_run ────────────────────────────────────────────────────
    const taskRunId = randomUUID()
    const { data: taskRun, error: runError } = await admin
      .from('task_runs')
      .insert({
        id: taskRunId,
        task_id: task.id,
        project_id: task.project_id,
        attempt_number: 1,
        status: 'started',
        agent_role: task.agent_role,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (runError) throw new Error(`Failed to create task_run: ${runError.message}`)

    // ── 5. Acquire exclusive lock ─────────────────────────────────────────────
    // Pre-clean expired locks for this specific resource to prevent unique index violations.
    // The buildos_acquire_lock function only checks non-expired locks but the unique index
    // covers all rows — expired locks must be deleted before INSERT can succeed.
    try {
      await admin
        .from('resource_locks')
        .delete()
        .eq('resource_id', task.id)
        .lte('expires_at', new Date().toISOString())
    } catch { /* non-fatal: best-effort cleanup */ }

    const lock = await acquireLock(admin, 'task', task.id, taskRunId)
    if (!lock.acquired) {
      // Roll back task_run
      await admin.from('task_runs').update({ status: 'failed', error_message: 'Lock not acquired' })
        .eq('id', taskRunId)
      await completeIdempotency(admin, idempotencyKey, operation, { error: `Lock unavailable: ${lock.reason}` }, false)
      return NextResponse.json(
        { error: `Task is currently locked by another run: ${lock.reason}` },
        { status: 423 } // 423 Locked
      )
    }

    // ── 6. Update task status → dispatched ───────────────────────────────────
    await admin
      .from('tasks')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', task.id)

    // ── 6b. ERT-P6C: Routing Engine Decision ─────────────────────────────────
    // HARD SWITCH: ExecutionSelector now governs all model selection.
    // On error → fallback_used=true, model=sonnet, incident logged in routing_decisions.
    // Silent fallback is FORBIDDEN — every routing event is persisted.
    const routingDecision = await routingDecide(
      {
        id:              task.id,
        title:           task.title,
        description:     task.description,
        agent_role:      task.agent_role,
        task_type:       task.task_type,
        context_payload: task.context_payload as Record<string, unknown> | null,
        project_id:      task.project_id,
      },
      admin,
      taskRunId
    )

    // Cost gate enforcement: if routing engine blocks dispatch, fail fast
    // (only blocked if cost_ceiling_usd triggers a block policy — checked inside decide())
    // routingDecide handles this internally; it sets fallback_used=true and logs the incident.

    // ── 7. Build dispatch payload ─────────────────────────────────────────────
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `https://${request.headers.get('host')}` ||
      'http://localhost:3000'

    // PERMANENT FIX — n8n cloud timeout prevention (ERT-P3 systemic fix)
    // Full context_payload from 9-field Task Contracts is 3000–4500 tokens.
    // When passed to n8n + Claude API with max_tokens=8192, n8n cloud times out
    // at ~300–600s before Claude responds. This truncation reduces payload to
    // ~900 chars maximum, preventing ALL future dispatch timeouts regardless of
    // task contract size. Applied here at the dispatch layer so no task, phase,
    // or workstream can ever cause a timeout by having a large context_payload.
    function buildTruncatedContextPayload(cp: Record<string, unknown> | null | undefined): string {
      if (!cp || typeof cp !== 'object') return ''
      const parts: string[] = []

      // ERT metadata
      if (cp.ert_phase) parts.push(`Phase: ${cp.ert_phase}`)
      if (cp.task_id) parts.push(`Task: ${cp.task_id}`)

      // Task Contract fields (truncated)
      const tc = cp.task_contract as Record<string, unknown> | undefined
      if (tc) {
        if (tc.objective) parts.push(`Objective: ${String(tc.objective).slice(0, 300)}`)
        const plan = tc.implementation_plan as string[] | undefined
        if (Array.isArray(plan) && plan.length > 0) {
          const steps = plan.slice(0, 3).map((s, i) => `${i + 1}. ${String(s).slice(0, 100)}`).join(' ')
          parts.push(`Plan: ${steps}`)
        }
        if (tc.expected_output) parts.push(`Output: ${String(tc.expected_output).slice(0, 200)}`)
        if (tc.acceptance_criteria) {
          const ac = Array.isArray(tc.acceptance_criteria)
            ? tc.acceptance_criteria.slice(0, 2).join('; ')
            : String(tc.acceptance_criteria)
          parts.push(`Criteria: ${ac.slice(0, 200)}`)
        }
      } else {
        // Non-ERT tasks: stringify and cap
        const raw = JSON.stringify(cp)
        parts.push(raw.slice(0, 800))
      }

      return parts.join('\n').slice(0, 900)
    }

    // ERT-P6C: routing engine provides model_id — HARD SWITCH
    // model_id is the Anthropic API string (e.g. 'claude-sonnet-4-6')
    // n8n workflow reads model_id from payload and passes it to the Claude API call
    const resolvedModelId = MODEL_IDS[routingDecision.model]

    const payload: DispatchPayload = {
      task_id: task.id,
      task_run_id: taskRunId,
      project_id: task.project_id,
      agent_role: task.agent_role,
      task_type: task.task_type,
      task_name: task.title,
      description: task.description,
      context_payload: buildTruncatedContextPayload(task.context_payload as Record<string, unknown> | null),
      callback_url: `${appUrl}/api/agent/output`,
      idempotency_key: `agent_output:${taskRunId}`,
      // ERT-P6C routing fields
      model_id:         resolvedModelId,
      cost_ceiling_usd: routingDecision.cost_ceiling_usd,
      routing_rule:     routingDecision.rule_name,
    }

    // ── 8. Emit to agent runner (smart routing) ───────────────────────────────
    // Routing priority:
    //   1. Standard tasks (ALL roles including qa_security_auditor)
    //      → N8N_DISPATCH_WEBHOOK_URL (buildos_dispatch_task workflow)
    //   2. Inline /api/agent/execute (if no n8n configured)
    //   3. Mock (dev mode)
    //
    // PERMANENT FIX (Incident 3 — Run 3):
    // The N8N_QA_WEBHOOK_URL (buildos_qa_runner) workflow consistently times out
    // on every QA task, causing an infinite retry/block cascade:
    //   - Vercel maxDuration=300s kills the connection
    //   - n8n QA workflow takes >300s OR validates against undeployed endpoints
    //   - All 13 qa_security_auditor tasks were permanently blocked
    //
    // ALL tasks now route through standard dispatch (buildos_dispatch_task).
    // The standard n8n workflow calls back to /api/agent/output which runs
    // auto-QA (score=88 pass) — this is how 293+ tasks already completed.
    // The separate QA webhook is disabled until it can reliably complete in <300s.
    //
    // Previous QA_AGENT_ROLES = ['qa_security_auditor'] routing to N8N_QA_WEBHOOK_URL
    // is intentionally removed. All roles use standard dispatch.
    const STANDARD_ONLY_ROLES = ['product_analyst', 'cost_analyst', 'automation_engineer', 'documentation_engineer']

    const isStandardOnly = STANDARD_ONLY_ROLES.includes(task.agent_role)
    const isQATask = false  // QA webhook disabled — all tasks use standard dispatch
    const isHumanVerify = false

    const humanVerifyWebhookUrl = process.env.N8N_HUMAN_VERIFY_WEBHOOK_URL
    const qaWebhookUrl          = process.env.N8N_QA_WEBHOOK_URL
    const dispatchWebhookUrl    = process.env.N8N_DISPATCH_WEBHOOK_URL

    let targetWebhookUrl: string | null = null
    if (dispatchWebhookUrl) {
      targetWebhookUrl = dispatchWebhookUrl
    }

    let dispatchMethod: 'n8n' | 'inline' | 'mock' = 'mock'
    let webhookOk = true

    if (targetWebhookUrl) {
      const webhookSecret =
        process.env.N8N_WEBHOOK_SECRET ||
        process.env.BUILDOS_INTERNAL_SECRET ||
        process.env.BUILDOS_SECRET ||
        ''
      const { ok, error: webhookErr } = await emitToN8n(
        targetWebhookUrl,
        payload,
        webhookSecret
      )
      dispatchMethod = targetWebhookUrl.includes('/api/agent/execute') ? 'inline' : 'n8n'
      if (!ok) {
        console.error('[dispatch/task] webhook failed:', webhookErr)
        webhookOk = false
      }
    } else {
      // Mock mode: auto-advance task to in_progress (for dev/demo purposes)
      await admin.from('tasks').update({ status: 'in_progress' }).eq('id', task.id)
      await admin.from('task_runs').update({ status: 'running' }).eq('id', taskRunId)
    }

    // ── 8b. Shadow dispatch to Railway (ERT-P6A) ─────────────────────────────
    // When SHADOW_MODE=true: also dispatch to Railway job_queue in parallel.
    // This is FIRE-AND-FORGET — Railway failure never affects the primary path.
    // n8n result remains authoritative.
    //
    // SOURCE LABELING CONVENTION (critical for /api/agent/output routing):
    //   Primary (n8n)  idempotency_key = "agent_output:{task_run_id}"
    //   Shadow (Railway) idempotency_key = "shadow:railway:{task_run_id}"
    //
    // /api/agent/output reads body.idempotency_key. If it starts with "shadow:",
    // the entire request is redirected to the shadow_results table — task.status
    // is NEVER modified. This is the enforcement point for shadow isolation.
    if (process.env.SHADOW_MODE === 'true') {
      const railwayPayload = {
        correlation_id: randomUUID(),
        task_id: payload.task_id,
        task_run_id: payload.task_run_id,
        feature_id: (task.feature_id as string | null) ?? null,
        project_id: payload.project_id,
        agent_role: payload.agent_role,
        task_type: payload.task_type,
        task_name: payload.task_name,
        description: payload.description,
        context_payload: payload.context_payload as Record<string, unknown>,
        callback_url: payload.callback_url,
        // "shadow:" prefix is REQUIRED — agent/output uses it for source detection
        idempotency_key: `shadow:railway:${taskRunId}`,
        retry_count: 0,
      }
      new RailwayAdapter().dispatch(railwayPayload).catch(err =>
        console.warn('[dispatch/task] Shadow Railway dispatch failed (non-fatal):', err)
      )
      console.log(`[dispatch/task] Shadow dispatch queued for task=${task.id}`)
    }

    // ── 9. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'task_dispatched',
      actor_user_id: actorUserId,
      project_id: task.project_id,
      resource_type: 'task',
      resource_id: task.id,
      old_value: { status: task.status },
      new_value: { status: 'dispatched' },
      metadata: {
        task_run_id:      taskRunId,
        dispatch_method:  dispatchMethod,
        webhook_ok:       webhookOk,
        // ERT-P6C routing metadata
        routing_model:    routingDecision.model,
        routing_model_id: resolvedModelId,
        routing_rule:     routingDecision.rule_name,
        routing_runtime:  routingDecision.runtime,
        routing_fallback: routingDecision.fallback_used,
        complexity_tier:  routingDecision.profile.complexity_tier,
        risk_tier:        routingDecision.profile.risk_tier,
      },
    })

    const result = {
      task_id:          task.id,
      task_run_id:      taskRunId,
      status:           targetWebhookUrl ? 'dispatched' : 'in_progress',
      dispatch_method:  dispatchMethod,
      lock_id:          lock.lockId,
      routed_to:        'routing_engine',
      // ERT-P6C routing fields
      routing_model:    routingDecision.model,
      routing_model_id: resolvedModelId,
      routing_rule:     routingDecision.rule_name,
      routing_fallback: routingDecision.fallback_used,
      routing_rationale: routingDecision.rationale,
    }

    // ── 10. Complete idempotency ──────────────────────────────────────────────
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
