/**
 * POST /api/governance/trigger/commit-failure
 *
 * G6 — Governance Orchestration: Commit Failure Trigger
 *
 * Fired when commit_verified=false in commit_delivery_logs,
 * or when G4 stub gate fails during dispatch.
 * - Logs event to G5 task_events (event_type: commit_failure)
 * - Checks escalation threshold (3 commit failures in 24h → P1 incident)
 * - Fires n8n governance workflow (non-fatal)
 *
 * Returns 202 Accepted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

const COMMIT_FAIL_ESCALATION_THRESHOLD = 3
const ESCALATION_WINDOW_HOURS = 24

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const {
    task_id,
    project_id = null,
    commit_sha = null,
    reason = 'commit_verified=false',
    file_path = null,
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
      event_type: 'commit_failure',
      actor_type: 'system',
      actor_id: 'g6-governance-trigger',
      details: { commit_sha, reason, file_path, source: 'trigger/commit-failure' },
    })
  } catch (err) {
    console.warn('[trigger/commit-failure] G5 log failed (non-fatal):', err)
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
      .eq('event_type', 'commit_failure')
      .gte('created_at', cutoff)

    if (!countErr && failEvents) {
      failCount = failEvents.length

      if (failCount >= COMMIT_FAIL_ESCALATION_THRESHOLD) {
        const incidentBody = {
          severity: 'P1',
          incident_type: 'logic',
          owner_domain: 'backend',
          title: `Commit auto-escalation: task commit verification failed ${failCount} times in ${ESCALATION_WINDOW_HOURS}h`,
          description: `Task ${task_id} has failed commit verification ${failCount} times within ${ESCALATION_WINDOW_HOURS} hours (threshold: ${COMMIT_FAIL_ESCALATION_THRESHOLD}). Potential code generation or GitHub delivery issue. Auto-escalated by G6.`,
          task_id,
          auto_generated: true,
          source: 'g6-trigger/commit-failure',
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

          await admin.from('task_events').insert({
            task_id,
            project_id: project_id ?? null,
            event_type: 'escalation_triggered',
            actor_type: 'system',
            actor_id: 'g6-governance-trigger',
            details: {
              reason: `commit_fail_threshold_exceeded (${failCount} >= ${COMMIT_FAIL_ESCALATION_THRESHOLD})`,
              incident_id: incidentId,
              window_hours: ESCALATION_WINDOW_HOURS,
            },
          })
        }
      }
    }
  } catch (err) {
    console.warn('[trigger/commit-failure] escalation check failed (non-fatal):', err)
  }

  // ── Step 3: Fire n8n webhook (non-fatal) ──────────────────────────────────
  // G11: Fail loudly if env var is missing — log n8n_misconfigured, surface in response
  const n8nUrl = process.env.N8N_GOVERNANCE_COMMIT_FAILURE_URL
  let n8nMisconfigured = false

  if (n8nUrl) {
    fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-N8N-Secret': BUILDOS_SECRET },
      body: JSON.stringify({ task_id, project_id, commit_sha, reason, file_path, fail_count: failCount }),
    }).catch((err) =>
      console.warn('[trigger/commit-failure] n8n webhook failed (non-fatal):', err)
    )
  } else {
    // G11 FAIL-LOUDLY: Missing env var must not silently no-op
    n8nMisconfigured = true
    console.error('[trigger/commit-failure] MISCONFIGURED: N8N_GOVERNANCE_COMMIT_FAILURE_URL is not set — governance workflow did not fire')
    try {
      await admin.from('task_events').insert({
        task_id,
        project_id: project_id ?? null,
        event_type: 'n8n_misconfigured',
        actor_type: 'system',
        actor_id: 'g11-governance-infra',
        details: {
          missing_env: 'N8N_GOVERNANCE_COMMIT_FAILURE_URL',
          trigger_route: 'trigger/commit-failure',
          source: 'g11-fail-loudly',
        },
      })
    } catch (logErr) {
      console.error('[trigger/commit-failure] n8n_misconfigured audit log failed:', logErr)
    }
  }

  return NextResponse.json(
    {
      ok: true,
      event: 'commit_failure',
      task_id,
      escalated,
      fail_count: failCount,
      incident_id: incidentId,
      ...(n8nMisconfigured
        ? {
            n8n_misconfigured: true,
            n8n_warning: 'N8N_GOVERNANCE_COMMIT_FAILURE_URL is not set — governance workflow did not fire. Misconfiguration logged.',
          }
        : {}),
    },
    { status: 202 }
  )
}
