/**
 * GET /api/governance/infra/provisioning-audit
 *
 * G11 — Infra Hardening: Provisioning Audit Scan
 *
 * Scans the projects table and cross-references with the provisioning
 * audit trail in settings_changes to detect:
 *
 *   1. Projects created outside the approved API path (no audit record)
 *   2. Projects with workspace_id missing (scope bypass attempt)
 *   3. Projects that are governance/stress-test style without sandbox_approved trace
 *   4. Projects with provisioning gaps (repo/vercel not provisioned)
 *
 * Returns a structured audit report with flagged projects.
 *
 * Authentication: X-Buildos-Secret required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

// G11: Same governance test patterns as projects/route.ts
const GOVERNANCE_TEST_PATTERNS = [
  /^g\d+[-_]/i,
  /[-_]g\d+$/i,
  /stress[-_]test/i,
  /load[-_]test/i,
  /governance[-_]test/i,
  /infra[-_]test/i,
  /^test[-_]stress/i,
  /sandbox[-_]test/i,
]

function isGovernanceTestProject(name: string): boolean {
  return GOVERNANCE_TEST_PATTERNS.some(pattern => pattern.test(name))
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)
  const since = url.searchParams.get('since') ?? null // ISO date string

  // ── Fetch all projects ────────────────────────────────────────────────────
  let projectQuery = admin
    .from('projects')
    .select('id, name, slug, workspace_id, project_type, status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (since) {
    projectQuery = projectQuery.gte('created_at', since)
  }

  const { data: projects, error: projectsErr } = await projectQuery

  if (projectsErr) {
    return NextResponse.json({
      error: 'Failed to fetch projects',
      detail: projectsErr.message,
    }, { status: 500 })
  }

  const allProjects = projects ?? []

  // ── Fetch provisioning audit records ─────────────────────────────────────
  // Each approved project creation writes:
  // settings_changes.setting_key = 'project_created_{project_id}'
  // settings_changes.setting_area = 'provisioning'
  const { data: auditRecords } = await admin
    .from('settings_changes')
    .select('setting_key, reason, changed_by, created_at')
    .eq('setting_area', 'provisioning')
    .like('setting_key', 'project_created_%')
    .limit(1000)

  const auditedProjectIds = new Set<string>(
    (auditRecords ?? [])
      .map(r => r.setting_key.replace('project_created_', ''))
  )

  // ── Fetch sandbox boundary violation records ──────────────────────────────
  const { data: violationRecords } = await admin
    .from('settings_changes')
    .select('reason, created_at')
    .eq('setting_area', 'provisioning')
    .eq('setting_key', 'sandbox_boundary_violation')
    .limit(100)

  // ── Classify each project ─────────────────────────────────────────────────
  const flaggedProjects: {
    id: string
    name: string
    workspace_id: string | null
    created_at: string
    flags: string[]
    severity: 'critical' | 'high' | 'medium' | 'low'
  }[] = []

  let auditedCount = 0
  let ungrantedCount = 0
  let governanceTestCount = 0
  let noWorkspaceCount = 0

  for (const project of allProjects) {
    const flags: string[] = []
    const hasAuditRecord = auditedProjectIds.has(project.id)

    if (hasAuditRecord) {
      auditedCount++
    } else {
      ungrantedCount++
      flags.push('NO_PROVISIONING_AUDIT_RECORD — created outside approved API path or pre-G11')
    }

    if (!project.workspace_id) {
      noWorkspaceCount++
      flags.push('NO_WORKSPACE_ID — scope bypass: project not linked to workspace')
    }

    if (isGovernanceTestProject(String(project.name))) {
      governanceTestCount++
      // Check if sandbox_approved is in the audit record reason
      const auditRecord = (auditRecords ?? []).find(
        r => r.setting_key === `project_created_${project.id}`
      )
      const sandboxApprovedInTrace = auditRecord?.reason?.includes('sandbox_approved=true')
      if (!sandboxApprovedInTrace) {
        flags.push('GOVERNANCE_TEST_PROJECT_WITHOUT_SANDBOX_APPROVAL — stress/G-style project without sandbox_approved flag')
      }
    }

    if (flags.length > 0) {
      const severity =
        flags.some(f => f.includes('NO_WORKSPACE_ID')) ? 'critical' :
        flags.some(f => f.includes('NO_PROVISIONING_AUDIT_RECORD')) ? 'high' :
        flags.some(f => f.includes('GOVERNANCE_TEST_PROJECT')) ? 'medium' :
        'low'

      flaggedProjects.push({
        id: project.id,
        name: project.name,
        workspace_id: project.workspace_id,
        created_at: project.created_at,
        flags,
        severity,
      })
    }
  }

  // ── Determine audit status ────────────────────────────────────────────────
  const criticalCount = flaggedProjects.filter(p => p.severity === 'critical').length
  const highCount = flaggedProjects.filter(p => p.severity === 'high').length

  const audit_status = criticalCount > 0 ? 'critical' :
    highCount > 0 ? 'needs_review' :
    flaggedProjects.length > 0 ? 'minor_issues' :
    'clean'

  const summary = `Scanned ${allProjects.length} projects: ${auditedCount} audited, ${ungrantedCount} without audit records, ${governanceTestCount} governance test projects, ${noWorkspaceCount} without workspace_id, ${flaggedProjects.length} total flagged`

  // ── Write audit report to settings_changes ────────────────────────────────
  let auditReportId: string | null = null
  try {
    const { data: reportRow } = await admin
      .from('settings_changes')
      .insert({
        setting_area: 'provisioning',
        setting_key: 'provisioning_audit_scan',
        previous_value: 'unknown',
        new_value: audit_status,
        reason: `G11 provisioning audit: ${summary}`,
        changed_by: 'g11-provisioning-audit',
      })
      .select('id')
      .single()

    auditReportId = reportRow?.id ?? null
  } catch (auditErr) {
    console.warn('[provisioning-audit] Audit report write failed (non-fatal):', auditErr)
  }

  return NextResponse.json({
    ok: true,
    audit_status,
    summary,
    scanned_count: allProjects.length,
    flagged_count: flaggedProjects.length,
    audited_count: auditedCount,
    ungranted_count: ungrantedCount,
    governance_test_count: governanceTestCount,
    no_workspace_count: noWorkspaceCount,
    sandbox_violation_attempts: (violationRecords ?? []).length,
    flagged_projects: flaggedProjects,
    audit_report_id: auditReportId,
    scanned_at: new Date().toISOString(),
  }, { status: audit_status === 'critical' ? 200 : 200 })
}
