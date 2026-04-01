/**
 * GET /api/governance/infra/n8n-health
 *
 * G11 — Infra Hardening: N8N Activation State Check
 *
 * Checks all 6 required N8N_GOVERNANCE_*_URL env vars and probes each
 * webhook URL to determine actual activation state (not just JSON presence).
 *
 * Writes the health check result to G5 settings_changes for audit trail.
 *
 * Returns:
 *   - overall_status: 'healthy' | 'degraded' | 'critical'
 *   - workflows: per-workflow env + reachability state
 *   - missing_envs: list of missing env vars
 *   - unreachable_urls: list of unreachable/inactive workflow URLs
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

// G11: All 6 required governance workflow env vars
const REQUIRED_N8N_WORKFLOWS = [
  { name: 'task_created',      envKey: 'N8N_GOVERNANCE_TASK_CREATED_URL' },
  { name: 'task_completed',    envKey: 'N8N_GOVERNANCE_TASK_COMPLETED_URL' },
  { name: 'qa_failed',         envKey: 'N8N_GOVERNANCE_QA_FAILED_URL' },
  { name: 'incident_created',  envKey: 'N8N_GOVERNANCE_INCIDENT_CREATED_URL' },
  { name: 'commit_failure',    envKey: 'N8N_GOVERNANCE_COMMIT_FAILURE_URL' },
  { name: 'release_gate',      envKey: 'N8N_GOVERNANCE_RELEASE_GATE_URL' },
] as const

type WorkflowStatus = {
  workflow: string
  env_key: string
  env_present: boolean
  url: string | null
  probe_status: 'active' | 'inactive' | 'unreachable' | 'not_configured' | 'skipped'
  probe_http_code: number | null
  probe_error: string | null
}

async function probeWorkflow(url: string, secret: string): Promise<{ status: 'active' | 'inactive' | 'unreachable'; httpCode: number | null; error: string | null }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-Secret': secret,
        'X-Buildos-Health-Check': 'true',
      },
      body: JSON.stringify({
        buildos_health_check: true,
        timestamp: new Date().toISOString(),
        source: 'g11-n8n-health-check',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const httpCode = resp.status

    // n8n active webhook: 200 or 202 with workflow body
    // n8n inactive/missing workflow: 404
    // n8n disabled workflow: 404 or 500
    if (httpCode >= 200 && httpCode < 300) {
      return { status: 'active', httpCode, error: null }
    } else if (httpCode === 404) {
      return { status: 'inactive', httpCode, error: `Workflow returned 404 — likely not activated in n8n dashboard` }
    } else {
      return { status: 'unreachable', httpCode, error: `Unexpected HTTP ${httpCode}` }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes('abort') || errMsg.includes('timeout')) {
      return { status: 'unreachable', httpCode: null, error: 'Probe timeout (5s)' }
    }
    return { status: 'unreachable', httpCode: null, error: errMsg.slice(0, 200) }
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const skipProbe = req.nextUrl.searchParams.get('probe') === 'false'
  const results: WorkflowStatus[] = []
  const missingEnvs: string[] = []
  const inactiveWorkflows: string[] = []
  const unreachableWorkflows: string[] = []

  // ── Check each workflow ───────────────────────────────────────────────────
  for (const wf of REQUIRED_N8N_WORKFLOWS) {
    const url = process.env[wf.envKey] ?? null
    const envPresent = !!url

    if (!envPresent) {
      missingEnvs.push(wf.envKey)
      results.push({
        workflow: wf.name,
        env_key: wf.envKey,
        env_present: false,
        url: null,
        probe_status: 'not_configured',
        probe_http_code: null,
        probe_error: `Env var ${wf.envKey} is not set`,
      })
      continue
    }

    if (skipProbe) {
      results.push({
        workflow: wf.name,
        env_key: wf.envKey,
        env_present: true,
        url,
        probe_status: 'skipped',
        probe_http_code: null,
        probe_error: null,
      })
      continue
    }

    // Probe the actual URL
    const probe = await probeWorkflow(url, BUILDOS_SECRET)
    const probeStatus: WorkflowStatus['probe_status'] = probe.status

    if (probe.status === 'inactive') inactiveWorkflows.push(wf.name)
    if (probe.status === 'unreachable') unreachableWorkflows.push(wf.name)

    results.push({
      workflow: wf.name,
      env_key: wf.envKey,
      env_present: true,
      url,
      probe_status: probeStatus,
      probe_http_code: probe.httpCode,
      probe_error: probe.error,
    })
  }

  // ── Determine overall status ──────────────────────────────────────────────
  let overall_status: 'healthy' | 'degraded' | 'critical'

  if (missingEnvs.length > 0) {
    overall_status = 'critical'  // missing env vars = always critical
  } else if (inactiveWorkflows.length > 0 || unreachableWorkflows.length > 0) {
    overall_status = 'degraded'
  } else if (skipProbe) {
    overall_status = 'healthy'   // env vars present, probe skipped
  } else {
    overall_status = 'healthy'
  }

  const activeCount = results.filter(r => r.probe_status === 'active').length
  const totalRequired = REQUIRED_N8N_WORKFLOWS.length

  const summary = skipProbe
    ? `Env check only (no probe): ${totalRequired - missingEnvs.length}/${totalRequired} env vars present`
    : `${activeCount}/${totalRequired} workflows active; missing_envs=${missingEnvs.length}; inactive=${inactiveWorkflows.length}; unreachable=${unreachableWorkflows.length}`

  // ── Write to G5 settings_changes (audit trail) ───────────────────────────
  let auditId: string | null = null
  try {
    const { data: auditRow } = await admin
      .from('settings_changes')
      .insert({
        setting_area: 'n8n_governance',
        setting_key: 'n8n_health_check',
        previous_value: 'unknown',
        new_value: overall_status,
        reason: `G11 n8n health check: ${summary}`,
        changed_by: 'g11-infra-n8n-health',
      })
      .select('id')
      .single()

    auditId = auditRow?.id ?? null
  } catch (auditErr) {
    console.warn('[n8n-health] settings_changes audit write failed (non-fatal):', auditErr)
  }

  return NextResponse.json({
    ok: true,
    overall_status,
    summary,
    missing_envs: missingEnvs,
    inactive_workflows: inactiveWorkflows,
    unreachable_workflows: unreachableWorkflows,
    workflows: results,
    probe_skipped: skipProbe,
    audit_id: auditId,
    checked_at: new Date().toISOString(),
  }, { status: overall_status === 'critical' ? 503 : 200 })
}
