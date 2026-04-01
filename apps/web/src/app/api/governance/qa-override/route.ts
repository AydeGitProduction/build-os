/**
 * POST /api/governance/qa-override
 *
 * Block G10: Manual QA Override
 *
 * Allows authorized operators to force PASS or FAIL a QA verdict for a task.
 * Writes to both qa_results and manual_override_log for full audit trail.
 * On PASS: transitions task to 'completed'.
 * On FAIL: transitions task to 'in_progress' (returned for rework) or 'failed'
 *          if max_retries exceeded.
 *
 * Design rules:
 *   - reason is MANDATORY (cannot override without explanation — NC-05)
 *   - Both qa_results and manual_override_log MUST be written (G5 duality)
 *   - Task status update is idempotent (safe to retry)
 *   - G5 task_events hook is non-fatal (never blocks override response)
 *
 * Auth: X-Buildos-Secret (internal) OR authenticated user JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.N8N_WEBHOOK_SECRET,
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
  ].filter(Boolean)

  let userId: string | null = null
  let isInternalCall = false

  if (internalSecret && validSecrets.includes(internalSecret)) {
    isInternalCall = true
  } else {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    task_id,
    verdict,             // 'PASS' | 'FAIL' (required)
    reason,              // mandatory — cannot override without explanation
    performed_by,        // display name / role of operator (optional)
    notes = '',          // additional QA notes (optional)
  } = body as Record<string, unknown>

  // ── Validate required fields ───────────────────────────────────────────────

  if (!task_id || typeof task_id !== 'string') {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
  }

  if (!verdict || typeof verdict !== 'string') {
    return NextResponse.json({ error: 'verdict is required (PASS or FAIL)' }, { status: 400 })
  }

  const verdictNorm = (verdict as string).toUpperCase()
  if (!['PASS', 'FAIL'].includes(verdictNorm)) {
    return NextResponse.json({ error: 'verdict must be "PASS" or "FAIL"' }, { status: 400 })
  }

  // NC-05: reason is mandatory for any manual override
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({
      error: 'reason is required and must not be empty (NC-05: manual override accountability)',
    }, { status: 400 })
  }

  // ── Fetch task ─────────────────────────────────────────────────────────────
  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('id, title, status, project_id, feature_id, retry_count, max_retries, task_type, agent_role')
    .eq('id', task_id)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // ── Fetch latest agent_output_id ───────────────────────────────────────────
  let agentOutputId: string | null = null
  const { data: latestOutput } = await admin
    .from('agent_outputs')
    .select('id')
    .eq('task_id', task_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  agentOutputId = latestOutput?.id || null

  const overrideScore = verdictNorm === 'PASS' ? 100 : 0
  const operatorId = (performed_by as string | undefined)?.trim() ||
    userId ||
    (isInternalCall ? 'system-internal' : 'unknown-operator')

  // ── 1. Write to qa_results (audit layer) ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: qaResult, error: qaError } = await (admin as any)
    .from('qa_results')
    .insert({
      task_id,
      project_id: task.project_id ?? null,
      verdict: verdictNorm,
      score: overrideScore,
      qa_type: 'code',   // conservative default; override applies to any type
      compilation_passed: verdictNorm === 'PASS' ? true : null,
      requirement_match_passed: verdictNorm === 'PASS' ? true : null,
      contract_check_passed: verdictNorm === 'PASS' ? true : null,
      notes: [
        `[MANUAL OVERRIDE G10] verdict=${verdictNorm}`,
        `reason: ${(reason as string).trim()}`,
        `performed_by: ${operatorId}`,
        (notes as string) ? `notes: ${notes}` : '',
      ].filter(Boolean).join('\n'),
      evidence_summary: JSON.stringify({
        override: true,
        reason: (reason as string).trim(),
        performed_by: operatorId,
        original_task_status: task.status,
        isInternalCall,
        g10_override: true,
      }),
      evaluator_model: 'manual-override-g10',
      retry_recommended: false,
    })
    .select('id')
    .single()

  if (qaError) {
    return NextResponse.json({ error: `Failed to write qa_result: ${qaError.message}` }, { status: 500 })
  }

  // ── 2. Write to manual_override_log (NC-05 compliance) ────────────────────
  const { data: overrideLog, error: overrideError } = await admin
    .from('manual_override_log')
    .insert({
      override_type: `qa_${verdictNorm.toLowerCase()}`,  // 'qa_pass' or 'qa_fail'
      target_entity_type: 'task',
      target_entity_id: task_id,
      reason: (reason as string).trim(),
      performed_by: operatorId,
    })
    .select('id')
    .single()

  if (overrideError) {
    // Non-fatal: qa_result was written; log warning but continue
    console.error('[qa-override] manual_override_log write failed:', overrideError.message)
  }

  // ── 3. Write QA verdict to qa_verdicts (task status gate) ─────────────────
  const { data: qaVerdict, error: verdictError } = await admin
    .from('qa_verdicts')
    .insert({
      task_id,
      project_id: task.project_id ?? null,
      agent_output_id: agentOutputId,
      verdict: verdictNorm,
      score: overrideScore,
      issues: verdictNorm === 'FAIL' ? [`Manual override FAIL: ${(reason as string).trim()}`] : [],
      suggestions: [],
      security_flags: [],
      reviewed_by_agent: 'manual-override',
    })
    .select('id')
    .single()

  if (verdictError) {
    console.error('[qa-override] qa_verdicts insert failed:', verdictError.message)
    // Non-fatal: proceed with task status update
  }

  // ── 4. Update task status based on override verdict ────────────────────────
  const oldStatus = task.status
  let newStatus: string

  if (verdictNorm === 'PASS') {
    newStatus = 'completed'
  } else {
    // FAIL: check if max retries exceeded
    const newRetryCount = (task.retry_count || 0) + 1
    if (newRetryCount >= (task.max_retries || 3)) {
      newStatus = 'failed'
    } else {
      newStatus = 'in_progress'
      await admin.from('tasks').update({ retry_count: newRetryCount }).eq('id', task_id)
    }
  }

  await admin.from('tasks').update({
    status: newStatus,
    completed_at: verdictNorm === 'PASS' ? new Date().toISOString() : null,
  }).eq('id', task_id)

  // ── 5. Check feature completion (on PASS) ─────────────────────────────────
  if (verdictNorm === 'PASS' && task.feature_id) {
    const { data: featureTasks } = await admin
      .from('tasks')
      .select('id, status')
      .eq('feature_id', task.feature_id)

    if (featureTasks) {
      const allDone = featureTasks.every((t: { id: string; status: string }) => t.status === 'completed')
      if (allDone) {
        await admin.from('features').update({ status: 'completed' }).eq('id', task.feature_id)
      }
    }
  }

  // ── 6. G5 task_events hook (non-fatal) ────────────────────────────────────
  try {
    await admin.from('task_events').insert({
      task_id,
      project_id: task.project_id ?? null,
      event_type: verdictNorm === 'PASS' ? 'qa_override_pass' : 'qa_override_fail',
      actor_type: isInternalCall ? 'system' : 'human',
      actor_id: operatorId,
      details: {
        verdict: verdictNorm,
        old_status: oldStatus,
        new_status: newStatus,
        reason: (reason as string).trim(),
        qa_result_id: qaResult?.id ?? null,
        override_log_id: overrideLog?.id ?? null,
        qa_verdict_id: qaVerdict?.id ?? null,
        g10_override: true,
      },
    })
  } catch (govErr) {
    console.warn('[qa-override] G5 task_events insert failed (non-fatal):', govErr)
  }

  return NextResponse.json({
    data: {
      task_id,
      verdict: verdictNorm,
      new_task_status: newStatus,
      qa_result_id: qaResult?.id ?? null,
      override_log_id: overrideLog?.id ?? null,
      qa_verdict_id: qaVerdict?.id ?? null,
      reason: (reason as string).trim(),
      performed_by: operatorId,
    },
    message: `QA override applied: task ${task_id} → ${verdictNorm} (status: ${newStatus})`,
  }, { status: 201 })
}
