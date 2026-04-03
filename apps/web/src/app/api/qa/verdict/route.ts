/**
 * POST /api/qa/verdict
 * Contract: submit_qa_verdict (Phase 2.5)
 *
 * Submits a QA verdict for a task in "awaiting_review" or "in_qa" status.
 * pass → task.status = "completed"
 * fail → task.status = "in_progress" (returned for rework)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  checkIdempotency,
  markIdempotencyProcessing,
  completeIdempotency,
  writeAuditLog,
} from '@/lib/execution'

// Allow up to 30 seconds: verdict DB writes + post-PASS tick fire.
// Default Vercel limit (10s) is too short when called from the auto-QA chain.
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()
  let idempotencyKey = ''
  let operation = 'submit_qa_verdict'

  try {
    // ── Auth: X-Buildos-Secret (internal/autonomous) OR user JWT ─────────────
    const internalSecret = request.headers.get('X-Buildos-Secret')
    const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET
    const validSecrets = [
      process.env.N8N_WEBHOOK_SECRET,
      process.env.BUILDOS_INTERNAL_SECRET,
      process.env.BUILDOS_SECRET,
    ].filter(Boolean)
    const isInternalCall = !!(internalSecret && validSecrets.includes(internalSecret))

    let userId: string | null = null
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
      task_id,
      verdict,          // "pass" | "fail" | "PASS" | "FAIL"
      score,            // 0-100, optional
      issues,           // array of issue strings, optional
      suggestions,      // array of suggestion strings, optional
      security_flags,   // array of security flag strings, optional
      agent_output_id,  // FK to agent_outputs, optional
      agent_role = 'qa_security_auditor',
    } = body

    if (!task_id || !verdict) {
      return NextResponse.json({ error: 'task_id and verdict are required' }, { status: 400 })
    }
    // Normalise verdict to uppercase for DB consistency
    const verdictNorm = verdict.toUpperCase()
    if (!['PASS', 'FAIL'].includes(verdictNorm)) {
      return NextResponse.json({ error: 'verdict must be "pass" or "fail"' }, { status: 400 })
    }

    idempotencyKey = body.idempotency_key || `qa:${task_id}:${Date.now()}`
    operation = 'submit_qa_verdict'

    // ── Idempotency ───────────────────────────────────────────────────────────
    const idempCheck = await checkIdempotency(admin, idempotencyKey, operation)
    if (idempCheck.isDuplicate) {
      return NextResponse.json({ data: idempCheck.cachedResponse, cached: true })
    }
    // Use nil UUID for system/internal calls (user_id is UUID type in DB)
    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000'
    await markIdempotencyProcessing(admin, idempotencyKey, operation, userId || SYSTEM_UUID)

    // ── Fetch task ────────────────────────────────────────────────────────────
    const { data: task } = await admin
      .from('tasks')
      .select('id, title, status, project_id, feature_id, agent_role, retry_count, max_retries')
      .eq('id', task_id)
      .single()

    if (!task) {
      await completeIdempotency(admin, idempotencyKey, operation, { error: 'Task not found' }, false)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!['awaiting_review', 'in_qa'].includes(task.status)) {
      const err = `Task must be in "awaiting_review" or "in_qa" to receive a verdict. Current: "${task.status}"`
      await completeIdempotency(admin, idempotencyKey, operation, { error: err }, false)
      return NextResponse.json({ error: err }, { status: 422 })
    }

    // ── Get latest agent_output for this task (if not provided) ───────────────
    let resolvedAgentOutputId = agent_output_id || null
    if (!resolvedAgentOutputId) {
      const { data: latestOutput } = await admin
        .from('agent_outputs')
        .select('id')
        .eq('task_id', task_id)
        .eq('is_valid', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      resolvedAgentOutputId = latestOutput?.id || null
    }

    // ── Write QA verdict (using actual DB schema) ─────────────────────────────
    const { data: qaVerdict, error: qvError } = await admin
      .from('qa_verdicts')
      .insert({
        task_id,
        project_id: task.project_id,
        agent_output_id: resolvedAgentOutputId,
        verdict: verdictNorm,
        score: score ?? (verdictNorm === 'PASS' ? 90 : 40),
        issues: issues || [],
        suggestions: suggestions || [],
        security_flags: security_flags || [],
        reviewed_by_agent: agent_role,
      })
      .select()
      .single()

    if (qvError) throw new Error(`Failed to write QA verdict: ${qvError.message}`)

    // ── Determine new task status ─────────────────────────────────────────────
    // EXECUTION CONTRACT (Developer 2): QA PASS no longer sets 'completed' directly.
    // Instead it sets 'pending_deploy' — the task only reaches 'completed' (VERIFIED_DONE)
    // after /api/agent/generate confirms a real GitHub commit SHA + Vercel deploy.
    // This enforces: agent → generate → commit → deploy → verify → COMPLETED.
    const passed = verdictNorm === 'PASS'
    const oldStatus = task.status

    let newStatus: string
    if (passed) {
      newStatus = 'pending_deploy'  // Awaiting commit proof — NOT yet completed
    } else {
      // On fail: check if max retries exceeded
      const newRetryCount = (task.retry_count || 0) + 1
      if (newRetryCount >= (task.max_retries || 3)) {
        newStatus = 'failed'
      } else {
        // BUG FIX: Use 'ready' instead of 'in_progress' so the orchestrator
        // can re-dispatch the task. Setting to 'in_progress' leaves the task
        // orphaned — no active run, no dispatch trigger, stuck forever.
        newStatus = 'ready' // Re-queue for orchestrator dispatch
        await admin.from('tasks').update({ retry_count: newRetryCount }).eq('id', task_id)
      }
    }

    // ── Sync task status ──────────────────────────────────────────────────────
    try {
      await admin.rpc('buildos_sync_task_status_from_qa', {
        p_task_id: task_id,
        p_verdict: verdictNorm,
      })
    } catch {
      // RPC not available — use direct update fallback
    }

    // Direct update always wins (ensures correct status regardless of RPC logic)
    // completed_at is NOT set here — it is set by /api/agent/generate after commit proof.
    // pending_deploy means QA passed but commit has not yet been verified.
    await admin.from('tasks').update({
      status: newStatus,
      completed_at: null,  // Will be set by generate/route.ts after commit verification
    }).eq('id', task_id)

    // ── Fire orchestration tick on retry (re-queue needs a dispatch trigger) ──
    if (newStatus === 'ready' && task.project_id) {
      try {
        const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        fetch(`${baseUrl}/api/orchestrate/tick?project_id=${task.project_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': BUILDOS_SECRET },
          body: JSON.stringify({ triggered_by: 'qa_retry_requeue' }),
        }).catch(() => {}) // fire-and-forget
      } catch { /* non-fatal */ }
    }

    // ── Check if all tasks in feature are complete ────────────────────────────
    // A feature is complete only when all tasks reach 'completed' (not 'pending_deploy').
    // pending_deploy means QA passed but commit proof is still pending — not yet VERIFIED_DONE.
    if (passed && task.feature_id) {
      const { data: featureTasks } = await admin
        .from('tasks')
        .select('id, status')
        .eq('feature_id', task.feature_id)

      if (featureTasks) {
        const allDone = featureTasks.every((t: any) => t.status === 'completed')
        if (allDone) {
          await admin.from('features').update({ status: 'completed' }).eq('id', task.feature_id)
        }
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type: 'qa_verdict_submitted',
      actor_user_id: userId || undefined,
      actor_agent_role: agent_role,
      project_id: task.project_id,
      resource_type: 'task',
      resource_id: task_id,
      old_value: { status: oldStatus },
      new_value: { status: newStatus },
      metadata: {
        verdict: verdictNorm,
        qa_verdict_id: qaVerdict.id,
        score: score ?? null,
        internal_call: isInternalCall,
      },
    })

    // ── G5 AUTO-HOOK: governance task_events (QA verdict) ────────────────────
    // Non-fatal: governance logging failure must never block the verdict response
    try {
      const govEventType = passed ? 'qa_verdict_pass' : 'qa_verdict_fail'
      await admin.from('task_events').insert({
        task_id,
        project_id: task.project_id ?? null,
        event_type: govEventType,
        actor_type: 'agent',
        actor_id: agent_role || 'qa_security_auditor',
        details: {
          verdict: verdictNorm,
          score: score ?? null,
          old_status: oldStatus,
          new_status: newStatus,
          qa_verdict_id: qaVerdict.id,
          issues: issues || [],
          internal_call: isInternalCall,
        },
      })
    } catch (govErr) {
      console.warn('[qa/verdict] G5 governance task_events insert failed (non-fatal):', govErr)
    }

    // ── G6 TRIGGER: fire qa-failed or task-completed governance trigger ────────
    // Non-fatal: G6 trigger failure must never block the verdict response (RULE G6-1)
    try {
      const g6BaseUrl = process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const g6Secret = BUILDOS_SECRET || ''

      if (!passed) {
        // FAIL verdict → fire qa-failed trigger (may escalate to P2 incident)
        fetch(`${g6BaseUrl}/api/governance/trigger/qa-failed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': g6Secret },
          body: JSON.stringify({
            task_id,
            project_id: task.project_id ?? null,
            verdict: verdictNorm,
            score: score ?? null,
            agent_role: agent_role || 'qa_security_auditor',
            issues: issues || [],
          }),
        }).catch((err) => console.warn('[qa/verdict] G6 qa-failed trigger failed (non-fatal):', err))
      } else {
        // PASS verdict → fire task-completed trigger
        fetch(`${g6BaseUrl}/api/governance/trigger/task-completed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': g6Secret },
          body: JSON.stringify({
            task_id,
            project_id: task.project_id ?? null,
            final_status: newStatus,
            verdict: verdictNorm,
            score: score ?? null,
            agent_role: agent_role || 'qa_security_auditor',
          }),
        }).catch((err) => console.warn('[qa/verdict] G6 task-completed trigger failed (non-fatal):', err))
      }
    } catch (g6Err) {
      console.warn('[qa/verdict] G6 trigger setup failed (non-fatal):', g6Err)
    }

    const result = {
      qa_verdict_id: qaVerdict.id,
      task_id,
      verdict: verdictNorm,
      new_task_status: newStatus,
    }
    await completeIdempotency(admin, idempotencyKey, operation, result, true)

    // ── Fire orchestration tick to unlock dependencies (autonomous loop) ───────
    // Non-blocking — if tick fails, task is still marked completed
    if (passed) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const secret = BUILDOS_SECRET || ''
      fetch(`${baseUrl}/api/orchestrate/tick?project_id=${task.project_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Buildos-Secret': secret,
        },
        body: JSON.stringify({ triggered_by: 'qa_verdict_pass' }),
      }).catch(() => {})
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
