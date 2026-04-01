/**
 * POST /api/governance/trigger/qa-failed
 *
 * G6 — Governance Orchestration: QA Failure Trigger
 *
 * Fired when a QA verdict returns FAIL or RETRY_REQUIRED.
 * - Logs event to G5 task_events
 * - Checks escalation threshold (3 QA failures in 24h → P2 incident)
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

const QA_FAIL_ESCALATION_THRESHOLD = 3
const ESCALATION_WINDOW_HOURS = 24

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
    verdict = 'FAIL',
    score = null,
    agent_role = null,
    issues = [],
  } = body as Record<string, unknown>

  if (!task_id || typeof task_id !== 'string') {
    return NextResponse.json(
      { error: 'missing required field: task_id' },
      { status: 400 }
    )
  }

  let escalated = false
  let incidentId: string | null = null
  let failCount = 0

  // ── Step 1: Log to G5 task_events ─────────────────────────────────────────
  try {
    await admin.from('task_events').insert({
      task_id,
      project_id: project_id ?? null,
      event_type: 'qa_verdict_fail',
      actor_type: 'system',
      actor_id: 'g6-governance-trigger',
      details: {
        verdict,
        score,
        agent_role,
        issues,
        source: 'trigger/qa-failed',
      },
    })
  } catch (err) {
    console.warn('[trigger/qa-failed] G5 task_events log failed (non-fatal):', err)
  }

  // ── Step 2: Escalation check ──────────────────────────────────────────────
  try {
    const cutoff = new Date(
      Date.now() - ESCALATION_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { data: failEvents, error: countErr } = await admin
      .from('task_events')
      .select('id, created_at')
      .eq('task_id', task_id)
      .eq('event_type', 'qa_verdict_fail')
      .gte('created_at', cutoff)

    if (!countErr && failEvents) {
      failCount = failEvents.length

      if (failCount >= QA_FAIL_ESCALATION_THRESHOLD) {
        // Create G2 incident
        const incidentBody = {
          severity: 'P2',
          incident_type: 'qa',
          owner_domain: 'qa',
          title: `QA auto-escalation: task failed QA ${failCount} times in ${ESCALATION_WINDOW_HOURS}h`,
          description: `Task ${task_id} has failed QA ${failCount} consecutive times within ${ESCALATION_WINDOW_HOURS} hours (threshold: ${QA_FAIL_ESCALATION_THRESHOLD}). Auto-escalated by G6 governance orchestrator.`,
          task_id,
          auto_generated: true,
          source: 'g6-trigger/qa-failed',
        }

        const incidentResp = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/governance/incidents`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Buildos-Secret': BUILDOS_SECRET,
            },
            body: JSON.stringify(incidentBody),
          }
        )

        if (incidentResp.ok) {
          const incidentData = (await incidentResp.json()) as {
            data?: { id?: string }
          }
          incidentId = incidentData?.data?.id ?? null
          escalated = true

          // Log escalation event to G5
          await admin.from('task_events').insert({
            task_id,
            project_id: project_id ?? null,
            event_type: 'escalation_triggered',
            actor_type: 'system',
            actor_id: 'g6-governance-trigger',
            details: {
              reason: `qa_fail_threshold_exceeded (${failCount} >= ${QA_FAIL_ESCALATION_THRESHOLD})`,
              incident_id: incidentId,
              window_hours: ESCALATION_WINDOW_HOURS,
            },
          })
        }
      }
    }
  } catch (err) {
    console.warn('[trigger/qa-failed] escalation check failed (non-fatal):', err)
  }

  // ── Step 3: Fire n8n governance webhook (non-fatal) ───────────────────────
  const n8nUrl = process.env.N8N_GOVERNANCE_QA_FAILED_URL
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
        verdict,
        score,
        agent_role,
        issues,
        fail_count: failCount,
      }),
    }).catch((err) => {
      console.warn('[trigger/qa-failed] n8n webhook failed (non-fatal):', err)
    })
  }

  return NextResponse.json(
    {
      ok: true,
      event: 'qa_failed',
      task_id,
      escalated,
      fail_count: failCount,
      incident_id: incidentId,
    },
    { status: 202 }
  )
}
