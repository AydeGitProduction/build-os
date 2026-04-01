/**
 * POST /api/governance/trigger/release-gate
 *
 * G6 — Governance Orchestration: Release Gate Check
 *
 * Runs automated release readiness checks:
 *   A: No open P0 incidents
 *   B: No open P1 incidents
 *   C: Fewer than 5 commit_failures in last 7 days
 *
 * Writes result to G5 release_gate_checks.
 * Also fires n8n release_gate workflow (non-fatal).
 *
 * Returns 200 with gate_status and evidence_summary.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

const COMMIT_FAIL_RELEASE_THRESHOLD = 5
const COMMIT_FAIL_WINDOW_DAYS = 7

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
    project_id = null,
    gate_name = 'pre-deploy',
    checked_by = 'g6-governance-trigger',
  } = body as Record<string, unknown>

  const checks: Record<
    string,
    { passed: boolean; detail: string; count?: number }
  > = {}
  let gate_status: 'passed' | 'failed' | 'pending' = 'passed'

  // ── Check A: No open P0 incidents ─────────────────────────────────────────
  try {
    const { data: p0Incidents } = await admin
      .from('incidents')
      .select('id, incident_code, severity')
      .eq('status', 'open')
      .eq('severity', 'P0')
      .limit(10)

    const p0Count = p0Incidents?.length ?? 0
    checks['check_a_no_p0_incidents'] = {
      passed: p0Count === 0,
      detail: `Open P0 incidents: ${p0Count}`,
      count: p0Count,
    }
  } catch (err) {
    checks['check_a_no_p0_incidents'] = {
      passed: false,
      detail: `Check failed: ${String(err).slice(0, 100)}`,
    }
  }

  // ── Check B: No open P1 incidents ─────────────────────────────────────────
  try {
    const { data: p1Incidents } = await admin
      .from('incidents')
      .select('id, incident_code, severity')
      .eq('status', 'open')
      .eq('severity', 'P1')
      .limit(10)

    const p1Count = p1Incidents?.length ?? 0
    checks['check_b_no_p1_incidents'] = {
      passed: p1Count === 0,
      detail: `Open P1 incidents: ${p1Count}`,
      count: p1Count,
    }
  } catch (err) {
    checks['check_b_no_p1_incidents'] = {
      passed: false,
      detail: `Check failed: ${String(err).slice(0, 100)}`,
    }
  }

  // ── Check C: Commit failure rate in last 7 days (G10 FIX: scoped by project_id) ──
  // RULE-29: Release gate commit failure check must be scoped to project_id.
  // Prior: global count across ALL projects — external test failures blocked gates.
  // Fixed: filter by project_id when provided, so only current project failures count.
  try {
    const cutoff7d = new Date(
      Date.now() - COMMIT_FAIL_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    let commitFailQuery = admin
      .from('task_events')
      .select('id, created_at, project_id')
      .eq('event_type', 'commit_failure')
      .gte('created_at', cutoff7d)

    // G10 FIX (RULE-29): scope to project_id when provided
    const scopedToProject = !!project_id
    if (scopedToProject) {
      commitFailQuery = commitFailQuery.eq('project_id', project_id as string)
    }

    const { data: commitFailEvents } = await commitFailQuery

    const commitFailCount = commitFailEvents?.length ?? 0
    const scopeLabel = scopedToProject
      ? `project ${String(project_id).slice(0, 8)}…`
      : 'GLOBAL (no project_id provided — RULE-29 warning)'

    checks['check_c_commit_failure_rate'] = {
      passed: commitFailCount < COMMIT_FAIL_RELEASE_THRESHOLD,
      detail: `Commit failures (${COMMIT_FAIL_WINDOW_DAYS}d, scope=${scopeLabel}): ${commitFailCount} (threshold: ${COMMIT_FAIL_RELEASE_THRESHOLD})`,
      count: commitFailCount,
    }
  } catch (err) {
    checks['check_c_commit_failure_rate'] = {
      passed: false,
      detail: `Check failed: ${String(err).slice(0, 100)}`,
    }
  }

  // ── Determine gate_status ─────────────────────────────────────────────────
  const criticalFailed =
    !checks['check_a_no_p0_incidents']?.passed ||
    !checks['check_b_no_p1_incidents']?.passed
  const warningFailed = !checks['check_c_commit_failure_rate']?.passed

  if (criticalFailed) gate_status = 'failed'
  else if (warningFailed) gate_status = 'pending'
  else gate_status = 'passed'

  const evidence_summary = Object.entries(checks)
    .map(([k, v]) => `${v.passed ? 'PASS' : 'FAIL'} ${k}: ${v.detail}`)
    .join('; ')

  // ── Write to G5 release_gate_checks ───────────────────────────────────────
  let gateCheckId: string | null = null
  try {
    const { data: gateRow } = await admin
      .from('release_gate_checks')
      .insert({
        project_id: project_id ?? null,
        gate_name: String(gate_name),
        gate_status,
        evidence_summary,
        checked_by: String(checked_by),
      })
      .select('id')
      .single()

    gateCheckId = gateRow?.id ?? null
  } catch (err) {
    console.warn('[trigger/release-gate] G5 release_gate_checks write failed (non-fatal):', err)
  }

  // ── Fire n8n webhook (non-fatal) ──────────────────────────────────────────
  // G11: Fail loudly if env var is missing — log n8n_misconfigured, surface in response
  const n8nUrl = process.env.N8N_GOVERNANCE_RELEASE_GATE_URL
  let n8nMisconfigured = false

  if (n8nUrl) {
    fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-N8N-Secret': BUILDOS_SECRET },
      body: JSON.stringify({ project_id, gate_name, checked_by, gate_status, checks }),
    }).catch((err) =>
      console.warn('[trigger/release-gate] n8n webhook failed (non-fatal):', err)
    )
  } else {
    // G11 FAIL-LOUDLY: Missing env var must not silently no-op
    n8nMisconfigured = true
    console.error('[trigger/release-gate] MISCONFIGURED: N8N_GOVERNANCE_RELEASE_GATE_URL is not set — governance workflow did not fire')
    try {
      await admin.from('settings_changes').insert({
        setting_area: 'n8n_governance',
        setting_key: 'n8n_misconfigured_release_gate',
        previous_value: 'configured',
        new_value: 'missing',
        reason: `G11 fail-loudly: N8N_GOVERNANCE_RELEASE_GATE_URL missing — gate ${gate_name} governance workflow did not fire (gate_status=${gate_status})`,
        changed_by: 'g11-governance-infra',
      })
    } catch (logErr) {
      console.error('[trigger/release-gate] n8n_misconfigured audit log failed:', logErr)
    }
  }

  return NextResponse.json({
    ok: true,
    event: 'release_gate',
    gate_status,
    gate_name,
    project_id,
    evidence_summary,
    checks,
    gate_check_id: gateCheckId,
    ...(n8nMisconfigured
      ? {
          n8n_misconfigured: true,
          n8n_warning: 'N8N_GOVERNANCE_RELEASE_GATE_URL is not set — governance workflow did not fire. Misconfiguration logged.',
        }
      : {}),
  })
}
