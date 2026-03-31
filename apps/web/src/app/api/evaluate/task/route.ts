/**
 * /api/evaluate/task
 *
 * POST — Evaluate a completed task and store score in evaluation_scores.
 *        Called by dispatch pipeline after task completion (fire-and-forget).
 *
 * Auth: X-Buildos-Secret (internal only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET

  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { task_id } = body

  if (!task_id) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // Load task + latest agent output
  const { data: task, error: taskErr } = await admin
    .from('tasks')
    .select('id, title, description, status, task_type')
    .eq('id', task_id)
    .single()

  if (taskErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.status !== 'completed') {
    return NextResponse.json({ error: 'Task not completed', status: task.status }, { status: 422 })
  }

  const { data: outputs } = await admin
    .from('agent_outputs')
    .select('raw_text, is_valid, agent_role')
    .eq('task_id', task_id)
    .eq('is_valid', true)
    .order('created_at', { ascending: false })
    .limit(1)

  const latestOutput = outputs?.[0]

  // Get default criteria
  const { data: criteria } = await admin
    .from('evaluation_criteria')
    .select('id, name, weight')
    .eq('active', true)
    .limit(4)

  if (!criteria || criteria.length === 0) {
    return NextResponse.json({ error: 'No evaluation criteria found' }, { status: 500 })
  }

  // Auto-evaluate using Claude
  let scores: Array<{ criteria_id: number; score: number; notes: string }> = []

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const outputText = latestOutput?.raw_text?.slice(0, 2000) ?? 'No output available'

    const evalPrompt = `Evaluate this completed task output on a scale of 0-100 for each criterion.

Task: ${task.title}
Type: ${task.task_type}
Agent: ${latestOutput?.agent_role ?? 'unknown'}

Output (truncated):
${outputText}

Return JSON only:
{"scores": [${criteria.map(c => `{"criteria_id": ${c.id}, "score": <0-100>, "notes": "<brief reason>"}`).join(', ')}]}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: evalPrompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    scores = parsed.scores ?? []
  } catch (e) {
    // Fallback: assign default scores
    scores = criteria.map(c => ({
      criteria_id: c.id,
      score: latestOutput?.is_valid ? 70 : 40,
      notes: `Auto-scored (AI eval failed: ${String(e).slice(0, 80)})`,
    }))
  }

  // Store evaluation scores
  const insertRows = scores.map(s => ({
    task_id,
    criteria_id: s.criteria_id,
    score: s.score,
    classification: s.score >= 70 ? 'FR' : 'CNV',
    notes: s.notes,
  }))

  const { data: inserted, error: insertErr } = await admin
    .from('evaluation_scores')
    .upsert(insertRows, { onConflict: 'task_id,evaluator_id,criteria_id', ignoreDuplicates: false })
    .select('id, criteria_id, score, classification')

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const avgScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    : 0

  return NextResponse.json({
    success: true,
    task_id,
    scores_written: inserted?.length ?? 0,
    average_score: Math.round(avgScore * 10) / 10,
    classification: avgScore >= 70 ? 'FR' : 'CNV',
  })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET

  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('task_id')

  if (!taskId) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('evaluation_scores')
    .select('*, evaluation_criteria(name, weight)')
    .eq('task_id', taskId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ scores: data })
}
