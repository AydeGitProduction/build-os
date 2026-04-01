/**
 * POST /api/governance/trigger/incident-created
 *
 * G6 — Governance Orchestration: Incident Created Trigger
 *
 * Fired when a new incident is opened in the BuildOS governance system.
 * - Logs incident_opened to G5 settings_changes
 * - If linked task_id: logs incident_linked to G5 task_events
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
    incident_id,
    incident_code = null,
    severity = 'P2',
    incident_type = 'logic',
    task_id = null,
    title = 'Unknown incident',
  } = body as Record<string, unknown>

  if (!incident_id || typeof incident_id !== 'string') {
    return NextResponse.json(
      { error: 'missing required field: incident_id' },
      { status: 400 }
    )
  }

  // ── Step 1: Log to G5 settings_changes (incident opened) ─────────────────
  try {
    await admin.from('settings_changes').insert({
      setting_area: 'incidents',
      setting_key: String(incident_code ?? incident_id),
      previous_value: 'none',
      new_value: 'open',
      reason: `Incident ${incident_code ?? incident_id} opened: ${title} (severity: ${severity}, type: ${incident_type})`,
      changed_by: 'g6-governance-trigger',
    })
  } catch (err) {
    console.warn('[trigger/incident-created] G5 settings_changes log failed (non-fatal):', err)
  }

  // ── Step 2: If linked task, log incident_linked to G5 task_events ─────────
  if (task_id && typeof task_id === 'string') {
    try {
      await admin.from('task_events').insert({
        task_id,
        event_type: 'incident_linked',
        actor_type: 'system',
        actor_id: 'g6-governance-trigger',
        details: {
          incident_id,
          incident_code,
          severity,
          incident_type,
          source: 'trigger/incident-created',
        },
      })
    } catch (err) {
      console.warn('[trigger/incident-created] G5 task_events log failed (non-fatal):', err)
    }
  }

  // ── Step 3: Fire n8n governance webhook (non-fatal) ───────────────────────
  const n8nUrl = process.env.N8N_GOVERNANCE_INCIDENT_CREATED_URL
  if (n8nUrl) {
    fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-Secret': BUILDOS_SECRET,
      },
      body: JSON.stringify({
        incident_id,
        incident_code,
        severity,
        incident_type,
        task_id,
        title,
      }),
    }).catch((err) => {
      console.warn('[trigger/incident-created] n8n webhook failed (non-fatal):', err)
    })
  }

  return NextResponse.json(
    {
      ok: true,
      event: 'incident_created',
      incident_id,
      severity,
    },
    { status: 202 }
  )
}
