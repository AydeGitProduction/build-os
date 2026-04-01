/**
 * POST /api/governance/trigger/task-completed
 *
 * G6 — Governance Orchestration: Task Completed Trigger
 *
 * Fired when a task exits the BuildOS pipeline (pass or fail).
 * - Logs pipeline_exit event to G5 task_events
 * - Fires n8n governance workflow (non-fatal)
 *
 * Returns 202 Accepted — all processing is non-blocking from caller's perspective.
 * RULE G6-1: Must never block the primary pipeline operation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get('X-Buildos-Secret')
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const {
    task_id,
    project_id = null,
    final_status = 'completed',
    verdict = null,
    score = null,
    agent_role = null,
  } = body as Record<string, unknown>

  if (!task_id || typeof task_id !== 'string') {
    return NextResponse.json(
      { error: 'missing required field: task_id' },
      { status: 400 }
    )
  }

  // ── Step 1: Log pipeline_exit to G5 task_events ───────────────────────────
  try {
    await admin.from('task_events').insert({
      task_id,
      project_id: project_id ?? null,
      event_type: 'pipeline_exit',
      actor_type: 'system',
      actor_id: 'g6-governance-trigger',
      details: {
        final_status,
        verdict,
        score,
        agent_role,
        source: 'trigger/task-completed',
      },
    })
  } catch (err) {
    console.warn('[trigger/task-completed] G5 task_events log failed (non-fatal):', err)
  }

  // ── Step 2: Fire n8n governance webhook (non-fatal) ───────────────────────
  const n8nUrl = process.env.N8N_GOVERNANCE_TASK_COMPLETED_URL
  if (n8nUrl) {
    fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-Secret': BUILDOS_SECRET,
      },
      body: JSON.stringify({
        task_id,
        project_id,
        final_status,
        verdict,
        score,
        agent_role,
      }),
    }).catch((err) => {
      console.warn('[trigger/task-completed] n8n webhook failed (non-fatal):', err)
    })
  }

  return NextResponse.json(
    {
      ok: true,
      event: 'task_completed',
      task_id,
      final_status,
    },
    { status: 202 }
  )
}
