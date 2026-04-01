/**
 * GET  /api/governance/qa-results   — list QA results with filters
 * POST /api/governance/qa-results   — record a QA result (and optionally run full evaluation)
 *
 * Block G3: Real QA Gate
 *
 * Auth: X-Buildos-Secret (internal) OR authenticated user JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { evaluateQA, persistQAResult, persistQAFeedbackToTask, escalateToIncident } from '@/lib/qa-evaluator'

async function resolveAuth(request: NextRequest): Promise<{ ok: boolean; userId: string | null }> {
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.N8N_WEBHOOK_SECRET,
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
  ].filter(Boolean)

  if (internalSecret && validSecrets.includes(internalSecret)) {
    return { ok: true, userId: null }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, userId: null }
  return { ok: true, userId: user.id }
}

// ── GET /api/governance/qa-results ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  const auth = await resolveAuth(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const task_id   = searchParams.get('task_id')
  const project_id = searchParams.get('project_id')
  const verdict   = searchParams.get('verdict')
  const qa_type   = searchParams.get('qa_type')
  const limit     = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset    = parseInt(searchParams.get('offset') || '0')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('qa_results')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (task_id)    query = query.eq('task_id', task_id)
  if (project_id) query = query.eq('project_id', project_id)
  if (verdict)    query = query.eq('verdict', verdict.toUpperCase())
  if (qa_type)    query = query.eq('qa_type', qa_type)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count, limit, offset })
}

// ── POST /api/governance/qa-results ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  const auth = await resolveAuth(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    task_id,
    project_id = null,
    verdict,
    score,
    qa_type,
    compilation_passed = null,
    requirement_match_passed = null,
    contract_check_passed = null,
    notes = '',
    evidence_summary = '',
    evaluator_model = 'buildos-qa-evaluator-v1',
    retry_recommended = false,
    // Auto-evaluate mode: if raw_output provided, run the full evaluator
    auto_evaluate = false,
    raw_output = null,
    task_title = null,
    task_description = null,
    task_type = null,
    agent_role = null,
    retry_count = 0,
    max_retries = 3,
  } = body as Record<string, unknown>

  // ── Mode 1: Auto-evaluate using the QA evaluator ──────────────────────────

  if (auto_evaluate) {
    if (!task_id || !project_id) {
      return NextResponse.json({
        error: 'auto_evaluate mode requires: task_id, project_id',
      }, { status: 400 })
    }

    // Fetch task data if not provided
    let resolvedTask: {
      title: string
      description: string | null
      task_type: string
      agent_role: string
      retry_count: number
      max_retries: number
      project_id: string
    } | null = null

    if (!task_title || !task_type || !agent_role) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: taskData } = await (admin as any)
        .from('tasks')
        .select('title, description, task_type, agent_role, retry_count, max_retries, project_id')
        .eq('id', task_id as string)
        .single()
      resolvedTask = taskData as typeof resolvedTask
    }

    if (!resolvedTask && (!task_title || !task_type || !agent_role)) {
      return NextResponse.json({ error: 'Task not found and required fields not provided' }, { status: 404 })
    }

    // Fetch latest raw_output if not provided
    let resolvedRawOutput = raw_output as string | null
    if (!resolvedRawOutput) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outputData } = await (admin as any)
        .from('agent_outputs')
        .select('raw_text')
        .eq('task_id', task_id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .single() as { data: { raw_text: string | null } | null }
      resolvedRawOutput = outputData?.raw_text || null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = resolvedTask as any
    const evalInput = {
      task_id: task_id as string,
      project_id: (project_id || rt?.project_id || null) as string | null,
      task_type: (task_type as string) || rt?.task_type || 'code',
      agent_role: (agent_role as string) || rt?.agent_role || 'backend_engineer',
      title: (task_title as string) || rt?.title || '',
      description: (task_description as string) || rt?.description || null,
      retry_count: (retry_count as number) || rt?.retry_count || 0,
      max_retries: (max_retries as number) || rt?.max_retries || 3,
      raw_output: resolvedRawOutput,
    }

    const result = evaluateQA(evalInput)
    const qa_result_id = await persistQAResult(admin, evalInput, result)

    if (result.verdict !== 'PASS') {
      await persistQAFeedbackToTask(admin, task_id as string, result)
    }

    const incident_id = result.escalate_to_incident
      ? await escalateToIncident(admin, evalInput, result)
      : null

    return NextResponse.json({
      data: {
        id: qa_result_id,
        task_id,
        verdict: result.verdict,
        score: result.score,
        qa_type: result.qa_type,
        compilation_passed: result.compilation_passed,
        requirement_match_passed: result.requirement_match_passed,
        contract_check_passed: result.contract_check_passed,
        notes: result.notes,
        evaluator_model: result.evaluator_model,
        retry_recommended: result.retry_recommended,
        escalated_incident_id: incident_id,
      },
    }, { status: 201 })
  }

  // ── Mode 2: Manual insert (caller provides all fields) ────────────────────

  if (!task_id || !verdict || score === undefined || score === null || !qa_type) {
    return NextResponse.json({
      error: 'Required fields: task_id, verdict, score, qa_type',
    }, { status: 400 })
  }

  const validVerdicts = ['PASS', 'FAIL', 'RETRY_REQUIRED', 'BLOCKED']
  const verdictNorm = (verdict as string).toUpperCase()
  if (!validVerdicts.includes(verdictNorm)) {
    return NextResponse.json({
      error: `verdict must be one of: ${validVerdicts.join(', ')}`,
    }, { status: 400 })
  }

  const validQATypes = ['code', 'non_code']
  if (!validQATypes.includes(qa_type as string)) {
    return NextResponse.json({
      error: `qa_type must be one of: ${validQATypes.join(', ')}`,
    }, { status: 400 })
  }

  const scoreNum = Number(score)
  if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
    return NextResponse.json({ error: 'score must be an integer 0-100' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('qa_results')
    .insert({
      task_id: task_id as string,
      project_id: project_id as string | null,
      verdict: verdictNorm,
      score: Math.round(scoreNum),
      qa_type: qa_type as string,
      compilation_passed: compilation_passed as boolean | null,
      requirement_match_passed: requirement_match_passed as boolean | null,
      contract_check_passed: contract_check_passed as boolean | null,
      notes: (notes as string) || '',
      evidence_summary: (evidence_summary as string) || '',
      evaluator_model: (evaluator_model as string) || 'buildos-qa-evaluator-v1',
      retry_recommended: Boolean(retry_recommended),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
