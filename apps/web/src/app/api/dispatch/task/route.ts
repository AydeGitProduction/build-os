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
// Phase 7.9 / 7.9c WS2: Execution lane classifier + executor subtype
import { classifyTaskWithReason, classifyTaskFull } from '@/lib/execution-classifier'

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

    // ── 2b. WS2 — CONTEXT VALIDATION GATE ────────────────────────────────────
    // Every code/schema/test task MUST have a non-empty context_payload.
    // Empty context → agent produces G10 empty output → wastes a Railway run.
    // Reject at dispatch time: immediately fail with clear failure_detail.
    const CODE_TASK_TYPES_CTX = ['code', 'schema', 'test']
    if (CODE_TASK_TYPES_CTX.includes(task.task_type ?? '')) {
      const cp = task.context_payload as Record<string, unknown> | null
      const isEmpty = !cp || Object.keys(cp).length === 0
      if (isEmpty) {
        const ctxErrMsg = `WS2 CONTEXT GATE: Task "${task.title}" has empty context_payload. ` +
          `Code tasks require: project type, feature description, expected output, dependencies. ` +
          `Populate context_payload before dispatching.`
        console.warn(`[dispatch/task] ${ctxErrMsg} task=${task.id}`)

        // Mark task as blocked with failure_detail — don't leave it in ready limbo
        await admin
          .from('tasks')
          .update({
            status: 'blocked',
            failure_detail: ctxErrMsg,
          })
          .eq('id', task.id)

        // Create blocker record (WS4 invariant: every blocked must have a blocker)
        try {
          await admin.from('blockers').insert({
            project_id: task.project_id,
            task_id: task.id,
            blocker_type: 'technical',
            severity: 'high',
            description: ctxErrMsg.slice(0, 1000),
            status: 'open',
          })
        } catch { /* non-fatal */ }

        await completeIdempotency(admin, idempotencyKey, operation, { error: ctxErrMsg }, false)
        return NextResponse.json({ error: ctxErrMsg }, { status: 422 })
      }
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

            // ── G4→G6 AUTO-TRIGGER: commit_failure on stub gate failure ───────────
            // Non-fatal: fire commit-failure governance trigger (RULE G6-1)
            try {
              const g6BaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
              fetch(`${g6BaseUrl}/api/governance/trigger/commit-failure`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Buildos-Secret': BUILDOS_INTERNAL_SECRET,
                },
                body: JSON.stringify({
                  task_id: task.id,
                  project_id: task.project_id ?? null,
                  commit_sha: null,
                  reason: `G4 stub gate failure: ${stubResult.error}`,
                  file_path: filePath,
                }),
              }).catch((err) =>
                console.warn('[dispatch/task] G4→G6 commit-failure trigger failed (non-fatal):', err)
              )
            } catch (g6Err) {
              console.warn('[dispatch/task] G4→G6 commit-failure trigger setup failed (non-fatal):', g6Err)
            }

            await completeIdempotency(admin, idempotencyKey, operation, { error: errMsg }, false)
            return NextResponse.json({ error: errMsg }, { status: 500 })
          }

          console.log(`[dispatch/task] G4 stub created: ${filePath} → ${stubResult.commitSha?.slice(0, 8)}`)
        }
      } else {
        console.log(`[dispatch/task] G4 stub gate: no CREATE paths detected in context_payload for task ${task.id} — stub skipped`)
      }
    }

    // ── 4. Acquire exclusive lock (BEFORE task_run creation) ─────────────────
    // WS3 FIX: Lock must be acquired BEFORE creating the task_run row.
    // Previous order (create task_run → acquire lock) had a race window:
    //   - Two concurrent dispatch calls both created task_runs
    //   - One got "Lock not acquired" → rolled back its run
    //   - DB ended up with a ghost failed run for every duplicate dispatch
    //
    // By acquiring the lock first:
    //   - Only one concurrent dispatch can acquire the lock
    //   - The loser returns 423 immediately, without creating any task_run
    //   - No ghost runs, no duplicate dispatch records
    const taskRunId = randomUUID()

    // Pre-clean expired locks to prevent unique index violations on INSERT.
    try {
      await admin
        .from('resource_locks')
        .delete()
        .eq('resource_id', task.id)
        .lte('expires_at', new Date().toISOString())
    } catch { /* non-fatal: best-effort cleanup */ }

    const lock = await acquireLock(admin, 'task', task.id, taskRunId)
    if (!lock.acquired) {
      // Lock failed — do NOT create a task_run. Return 423 immediately.
      await completeIdempotency(admin, idempotencyKey, operation, { error: `Lock unavailable: ${lock.reason}` }, false)
      return NextResponse.json(
        { error: `Task is currently locked by another run: ${lock.reason}` },
        { status: 423 } // 423 Locked
      )
    }

    // ── Phase 7.9 / 7.9c WS2: Classify execution lane + executor subtype ────────
    // P7.9:   fast vs heavy lane (prevents n8n timeout for large LLM jobs)
    // P7.9c:  executor subtype (prevents wrong runtime → predictable timeout)
    //
    // Subtypes:
    //   worker_schema  → DDL/migration/RLS tasks; must never hit inline timeout
    //   worker_testgen → test suite generation; large output, schema-aware
    //   worker_long_llm→ large feature implementation
    //   worker_inline_safe → bounded heavy task; safe for standard inline worker
    const fullClassification = classifyTaskFull({
      task_type: task.task_type,
      title: task.title,
      description: task.description,
      // execution_lane column may not exist yet (migration pending) — classify from title/type
    })
    const executionLane   = fullClassification.lane
    const executorSubtype = fullClassification.subtype  // null for fast lane
    const executorUsed    = executionLane === 'heavy' ? 'inline-heavy' : 'n8n'
    console.log(`[dispatch/task] Lane classification: task=${task.id} lane=${executionLane} subtype=${executorSubtype ?? 'n/a'} reason="${fullClassification.reason}"`)

    // Update task's execution_lane in DB (non-fatal — column may not exist if migration pending)
    try {
      await admin
        .from('tasks')
        .update({ execution_lane: executionLane } as Record<string, unknown>)
        .eq('id', task.id)
    } catch { /* non-fatal: migration not yet applied */ }

    // ── 5. Create task_run (AFTER lock is acquired) ───────────────────────────
    // Only one concurrent dispatch can reach here — lock guarantees atomicity.
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

    // Phase 7.9 WS6: Tag executor_used (non-fatal — column may not exist if migration not yet applied)
    try {
      await admin
        .from('task_runs')
        .update({ executor_used: executorUsed } as Record<string, unknown>)
        .eq('id', taskRunId)
    } catch { /* non-fatal: migration may not be applied yet */ }

    if (runError) {
      // Roll back lock if task_run creation fails
      await admin.from('resource_locks').delete().eq('locked_by_task_run', taskRunId)
      throw new Error(`Failed to create task_run: ${runError.message}`)
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

    // P7.9c WS1 — Schema-Preserving Context Payload (replaces ERT-P3 string truncation)
    //
    // ROOT CAUSE FIXED: The previous buildTruncatedContextPayload() converted the
    // context_payload object into a plain string (≤900 chars). This destroyed the
    // structured shape — when /api/agent/execute received it and checked
    // payload?.key_tables, it got undefined because the string has no properties.
    // The ⛔ SCHEMA CONTRACT block at the top of every agent prompt NEVER FIRED.
    // Result: agents hallucinated table names (heavy_jobs instead of heavy_dispatch_queue).
    //
    // FIX: Return a structured object that ALWAYS preserves schema-critical fields
    // (key_tables, table) as top-level properties. Text-heavy fields are still
    // truncated to prevent timeout, but the schema contract survives dispatch.
    function buildTruncatedContextPayload(cp: Record<string, unknown> | null | undefined): Record<string, unknown> {
      if (!cp || typeof cp !== 'object') return {}
      const result: Record<string, unknown> = {}

      // ── SCHEMA CONTRACT FIELDS — preserved as-is, never truncated ─────────────
      // These are the only fields the executor MUST see to obey schema contracts.
      // key_tables: comma-separated list of allowed DB tables for this task
      // table:      canonical table name if a single table is the focus
      if (cp.key_tables !== undefined) result.key_tables = cp.key_tables
      if (cp.table !== undefined) result.table = cp.table

      // ── ERT metadata ──────────────────────────────────────────────────────────
      if (cp.ert_phase) result.ert_phase = cp.ert_phase
      if (cp.task_id) result.task_id = cp.task_id

      // ── Task Contract fields (truncated for size, but structured) ─────────────
      const tc = cp.task_contract as Record<string, unknown> | undefined
      if (tc) {
        const contract: Record<string, unknown> = {}
        if (tc.objective) contract.objective = String(tc.objective).slice(0, 300)
        const plan = tc.implementation_plan as string[] | undefined
        if (Array.isArray(plan) && plan.length > 0) {
          contract.implementation_plan = plan.slice(0, 3).map(s => String(s).slice(0, 100))
        }
        if (tc.expected_output) contract.expected_output = String(tc.expected_output).slice(0, 200)
        if (tc.acceptance_criteria) {
          contract.acceptance_criteria = Array.isArray(tc.acceptance_criteria)
            ? tc.acceptance_criteria.slice(0, 2)
            : String(tc.acceptance_criteria).slice(0, 200)
        }
        // key_tables may also live inside task_contract — hoist to top level
        if (tc.key_tables !== undefined && result.key_tables === undefined) {
          result.key_tables = tc.key_tables
        }
        result.task_contract = contract
      }

      // ── Other non-critical scalar fields ──────────────────────────────────────
      if (cp.source) result.source = cp.source
      if (cp.phase) result.phase = cp.phase
      if (cp.epic_title) result.epic_title = String(cp.epic_title).slice(0, 100)
      if (cp.feature_title) result.feature_title = String(cp.feature_title).slice(0, 100)
      if (cp.objective && !result.task_contract) result.objective = String(cp.objective).slice(0, 300)

      return result
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

    // ── Phase 7.9 / 7.9c WS2: Route tasks by lane + executor subtype ────────────
    // STRICT: heavy tasks NEVER go to n8n (which times out for large LLM jobs).
    //
    // Executor subtype routing within the heavy lane (P7.9c WS2):
    //   worker_schema    → /api/worker/heavy?subtype=schema   (schema synthesis, DDL, RLS)
    //   worker_testgen   → /api/worker/heavy?subtype=testgen  (test suite generation)
    //   worker_long_llm  → /api/worker/heavy?subtype=long_llm (large feature code)
    //   worker_inline_safe → /api/worker/heavy (default, no subtype param)
    //
    // The ?subtype= param lets /api/worker/heavy adjust Claude model/max_tokens if needed.
    // Fast tasks → N8N_DISPATCH_WEBHOOK_URL (n8n, standard path, unchanged).
    let targetWebhookUrl: string | null = null
    if (executionLane === 'heavy') {
      const heavyWorkerBase = process.env.HEAVY_WORKER_URL || `${appUrl}/api/worker/heavy`
      // Attach subtype as query param so the worker can route internally
      const subtypeParam = executorSubtype && executorSubtype !== 'worker_inline_safe'
        ? `?subtype=${executorSubtype.replace('worker_', '')}`
        : ''
      targetWebhookUrl = `${heavyWorkerBase}${subtypeParam}`
      console.log(`[dispatch/task] HEAVY lane: subtype=${executorSubtype ?? 'inline_safe'} → ${targetWebhookUrl} (task=${task.id})`)
    } else if (dispatchWebhookUrl) {
      // Fast lane: standard n8n dispatch
      targetWebhookUrl = dispatchWebhookUrl
    }

    let dispatchMethod: 'n8n' | 'inline' | 'inline-heavy' | 'mock' = 'mock'
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
      // Phase 7.9: label the dispatch method correctly
      if (targetWebhookUrl.includes('/api/worker/heavy')) {
        dispatchMethod = 'inline-heavy'
      } else if (targetWebhookUrl.includes('/api/agent/execute')) {
        dispatchMethod = 'inline'
      } else {
        dispatchMethod = 'n8n'
      }
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

    // ── G5 AUTO-HOOK: governance task_events + handoff_events (dispatch) ──────
    // Non-fatal: governance logging failure must never block dispatch
    try {
      await admin.from('task_events').insert({
        task_id: task.id,
        project_id: task.project_id ?? null,
        event_type: 'dispatched',
        actor_type: 'system',
        actor_id: actorUserId || 'orchestrator',
        details: {
          task_run_id: taskRunId,
          dispatch_method: dispatchMethod,
          webhook_ok: webhookOk,
          routing_model: routingDecision.model,
          routing_rule: routingDecision.rule_name,
          routing_fallback: routingDecision.fallback_used,
        },
      })
    } catch (govErr) {
      console.warn('[dispatch/task] G5 governance task_events insert failed (non-fatal):', govErr)
    }

    try {
      await admin.from('handoff_events').insert({
        task_id: task.id,
        from_role: 'orchestrator',
        to_role: task.agent_role || 'agent',
        handoff_type: 'dispatch',
        notes: `Dispatched via ${dispatchMethod}; model=${routingDecision.model}; rule=${routingDecision.rule_name}`,
      })
    } catch (govErr) {
      console.warn('[dispatch/task] G5 governance handoff_events insert failed (non-fatal):', govErr)
    }

    // ── G6 TRIGGER: fire task-created governance trigger ──────────────────────
    // Non-fatal: G6 trigger failure must never block dispatch (RULE G6-1)
    try {
      const g6BaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const g6Secret = BUILDOS_INTERNAL_SECRET || ''
      fetch(`${g6BaseUrl}/api/governance/trigger/task-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': g6Secret },
        body: JSON.stringify({
          task_id: task.id,
          project_id: task.project_id ?? null,
          agent_role: task.agent_role ?? null,
          from_stage: 'intake',
          to_stage: 'dispatch',
          metadata: {
            task_run_id: taskRunId,
            dispatch_method: dispatchMethod,
            routing_model: routingDecision.model,
            routing_rule: routingDecision.rule_name,
          },
        }),
      }).catch((err) => console.warn('[dispatch/task] G6 task-created trigger failed (non-fatal):', err))
    } catch (g6Err) {
      console.warn('[dispatch/task] G6 trigger setup failed (non-fatal):', g6Err)
    }

    const result = {
      task_id:          task.id,
      task_run_id:      taskRunId,
      status:           targetWebhookUrl ? 'dispatched' : 'in_progress',
      dispatch_method:  dispatchMethod,
      lock_id:          lock.lockId,
      routed_to:        'routing_engine',
      // Phase 7.9: execution lane
      execution_lane:   executionLane,
      executor_used:    executorUsed,
      lane_reason:      laneResult.reason,
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
