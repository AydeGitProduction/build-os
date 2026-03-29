/**
 * POST /api/release/check?project_id=
 * Evaluate 10-gate release readiness for a project.
 *
 * Gates:
 *  1. task_completion       — ≥ 90 % of non-cancelled tasks completed
 *  2. qa_coverage           — ≥ 80 % of completed tasks have a QA verdict pass
 *  3. open_blockers         — 0 unresolved blockers
 *  4. failed_tasks          — 0 tasks in failed state
 *  5. agent_output_coverage — All completed tasks have ≥ 1 agent output
 *  6. integration_health    — ≥ 1 active integration connected
 *  7. documentation         — ≥ 1 approved/draft document exists
 *  8. cost_within_budget    — actual spend ≤ 110 % of estimated budget
 *  9. project_settings      — name, target_date, project_type all set
 * 10. test_coverage         — ≥ 1 qa_report document OR all tasks have QA verdict
 *
 * Returns: { score, gates[], ready, warnings[], checks_at }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/execution'

export type GateStatus = 'pass' | 'warn' | 'fail'

export interface Gate {
  id: string
  label: string
  description: string
  status: GateStatus
  message: string
  value?: number | string | boolean
  threshold?: number | string
  blocking: boolean   // if true, this gate prevents release
}

export interface ReleaseCheckResult {
  project_id: string
  score: number        // 0-100 (% of gates passed)
  ready: boolean       // all blocking gates pass
  gates: Gate[]
  warnings: string[]
  checks_at: string
}

export async function POST(request: NextRequest) {
  const admin = createAdminSupabaseClient()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    }

    // ── Fetch all data in parallel ─────────────────────────────────────────
    const [
      projectRes,
      tasksRes,
      blockersRes,
      agentOutputsRes,
      integrationsRes,
      documentsRes,
      costModelRes,
    ] = await Promise.all([
      admin.from('projects')
        .select('id, name, project_type, target_date, status, description')
        .eq('id', projectId)
        .single(),

      admin.from('tasks')
        .select('id, status, agent_role')
        .eq('project_id', projectId),

      admin.from('blockers')
        .select('id, severity, resolved_at')
        .eq('project_id', projectId)
        .is('resolved_at', null),  // unresolved only

      admin.from('agent_outputs')
        .select('task_id, output_type, qa_verdict')
        .eq('project_id', projectId),

      admin.from('project_integrations')
        .select('id, status')
        .eq('project_id', projectId)
        .eq('status', 'active'),

      admin.from('documents')
        .select('id, doc_type, status')
        .eq('project_id', projectId)
        .neq('status', 'superseded'),

      admin.from('cost_models')
        .select('total_cost_usd, estimated_total_usd')
        .eq('project_id', projectId)
        .single(),
    ])

    const project      = projectRes.data
    const tasks        = tasksRes.data || []
    const blockers     = blockersRes.data || []
    const agentOutputs = agentOutputsRes.data || []
    const integrations = integrationsRes.data || []
    const documents    = documentsRes.data || []
    const costModel    = costModelRes.data

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const gates: Gate[] = []
    const warnings: string[] = []

    // ── Gate 1: Task Completion Rate ──────────────────────────────────────
    const activeTasks    = tasks.filter(t => t.status !== 'cancelled')
    const completedTasks = tasks.filter(t => t.status === 'completed')
    const completionPct  = activeTasks.length === 0 ? 100 : Math.round((completedTasks.length / activeTasks.length) * 100)
    const COMPLETION_THRESHOLD = 90

    gates.push({
      id:          'task_completion',
      label:       'Task Completion',
      description: `${COMPLETION_THRESHOLD}% of active tasks must be completed`,
      status:      completionPct >= COMPLETION_THRESHOLD ? 'pass' : completionPct >= 70 ? 'warn' : 'fail',
      message:     `${completedTasks.length} / ${activeTasks.length} tasks completed (${completionPct}%)`,
      value:       completionPct,
      threshold:   COMPLETION_THRESHOLD,
      blocking:    true,
    })

    // ── Gate 2: QA Coverage ───────────────────────────────────────────────
    const qaVerdicts = agentOutputs.filter(o => o.output_type === 'qa_verdict' && o.qa_verdict === 'pass')
    const qaTaskIds  = new Set(qaVerdicts.map(o => o.task_id))
    const qaCoverage = completedTasks.length === 0 ? 100
      : Math.round((completedTasks.filter(t => qaTaskIds.has(t.id)).length / completedTasks.length) * 100)
    const QA_THRESHOLD = 80

    gates.push({
      id:          'qa_coverage',
      label:       'QA Coverage',
      description: `${QA_THRESHOLD}% of completed tasks need a passing QA verdict`,
      status:      qaCoverage >= QA_THRESHOLD ? 'pass' : qaCoverage >= 50 ? 'warn' : 'fail',
      message:     `${qaVerdicts.length} QA passes for ${completedTasks.length} completed tasks (${qaCoverage}%)`,
      value:       qaCoverage,
      threshold:   QA_THRESHOLD,
      blocking:    true,
    })

    // ── Gate 3: Open Blockers ─────────────────────────────────────────────
    const criticalBlockers = blockers.filter(b => b.severity === 'critical' || b.severity === 'high')
    const allOpenCount     = blockers.length

    gates.push({
      id:          'open_blockers',
      label:       'Open Blockers',
      description: 'No unresolved critical or high-severity blockers',
      status:      criticalBlockers.length === 0 && allOpenCount === 0 ? 'pass'
                 : criticalBlockers.length === 0 ? 'warn'
                 : 'fail',
      message:     allOpenCount === 0
        ? 'No open blockers'
        : `${criticalBlockers.length} critical/high, ${allOpenCount - criticalBlockers.length} medium/low open`,
      value:       criticalBlockers.length,
      threshold:   0,
      blocking:    true,
    })
    if (allOpenCount > 0 && criticalBlockers.length === 0) {
      warnings.push(`${allOpenCount} low/medium blocker(s) are still open`)
    }

    // ── Gate 4: Failed Tasks ──────────────────────────────────────────────
    const failedTasks = tasks.filter(t => t.status === 'failed')

    gates.push({
      id:          'failed_tasks',
      label:       'No Failed Tasks',
      description: 'All tasks must be resolved — no tasks in failed state',
      status:      failedTasks.length === 0 ? 'pass' : 'fail',
      message:     failedTasks.length === 0
        ? 'No failed tasks'
        : `${failedTasks.length} task(s) in failed state require attention`,
      value:       failedTasks.length,
      threshold:   0,
      blocking:    true,
    })

    // ── Gate 5: Agent Output Coverage ─────────────────────────────────────
    const tasksWithOutput = new Set(agentOutputs.map(o => o.task_id))
    const completedWithoutOutput = completedTasks.filter(t => !tasksWithOutput.has(t.id))
    const outputCoverage = completedTasks.length === 0 ? 100
      : Math.round(((completedTasks.length - completedWithoutOutput.length) / completedTasks.length) * 100)

    gates.push({
      id:          'agent_output_coverage',
      label:       'Agent Output Coverage',
      description: 'All completed tasks should have recorded agent outputs',
      status:      outputCoverage === 100 ? 'pass' : outputCoverage >= 80 ? 'warn' : 'fail',
      message:     completedWithoutOutput.length === 0
        ? 'All completed tasks have agent outputs'
        : `${completedWithoutOutput.length} completed task(s) missing agent outputs`,
      value:       outputCoverage,
      threshold:   100,
      blocking:    false,
    })
    if (completedWithoutOutput.length > 0) {
      warnings.push(`${completedWithoutOutput.length} completed task(s) lack recorded agent outputs`)
    }

    // ── Gate 6: Integration Health ────────────────────────────────────────
    const productionIntegrations = integrations.length

    gates.push({
      id:          'integration_health',
      label:       'Integration Health',
      description: 'At least one active integration must be connected',
      status:      productionIntegrations >= 1 ? 'pass' : 'warn',
      message:     productionIntegrations === 0
        ? 'No active integrations connected (optional but recommended)'
        : `${productionIntegrations} active integration(s) connected`,
      value:       productionIntegrations,
      threshold:   1,
      blocking:    false,
    })
    if (productionIntegrations === 0) {
      warnings.push('No integrations connected — consider connecting at minimum a source control provider')
    }

    // ── Gate 7: Documentation ─────────────────────────────────────────────
    const hasPrd          = documents.some(d => d.doc_type === 'prd')
    const hasArchitecture = documents.some(d => d.doc_type === 'architecture')
    const docCount        = documents.length

    const docStatus: GateStatus = hasPrd && hasArchitecture ? 'pass'
                                : docCount >= 1 ? 'warn'
                                : 'fail'
    gates.push({
      id:          'documentation',
      label:       'Documentation',
      description: 'PRD and Architecture documents must exist',
      status:      docStatus,
      message:     docCount === 0
        ? 'No documents found — run the Documentation Engineer agent'
        : `${docCount} document(s): PRD ${hasPrd ? '✓' : '✗'}, Architecture ${hasArchitecture ? '✓' : '✗'}`,
      value:       docCount,
      threshold:   2,
      blocking:    false,
    })
    if (!hasPrd) warnings.push('PRD document is missing')
    if (!hasArchitecture) warnings.push('Architecture document is missing')

    // ── Gate 8: Cost Within Budget ────────────────────────────────────────
    let costStatus: GateStatus = 'pass'
    let costMessage = 'No cost model configured'
    let costValue: number | undefined
    let costThreshold: number | undefined

    if (costModel) {
      const actual    = costModel.total_cost_usd || 0
      const estimated = costModel.estimated_total_usd || 0
      if (estimated > 0) {
        const pct = Math.round((actual / estimated) * 100)
        costValue     = pct
        costThreshold = 110
        costStatus    = pct <= 100 ? 'pass' : pct <= 110 ? 'warn' : 'fail'
        costMessage   = `Spent $${actual.toFixed(2)} of $${estimated.toFixed(2)} estimated (${pct}%)`
        if (pct > 100) warnings.push(`Cost overrun: ${pct}% of estimated budget spent`)
      } else {
        costStatus  = 'warn'
        costMessage = `$${(costModel.total_cost_usd || 0).toFixed(2)} spent — no budget estimate set`
        warnings.push('No budget estimate configured on cost model')
      }
    }

    gates.push({
      id:          'cost_within_budget',
      label:       'Cost Within Budget',
      description: 'Actual spend must be ≤ 110% of the estimated budget',
      status:      costStatus,
      message:     costMessage,
      value:       costValue,
      threshold:   costThreshold,
      blocking:    false,
    })

    // ── Gate 9: Project Settings ──────────────────────────────────────────
    const hasName        = !!(project.name?.trim())
    const hasType        = !!(project.project_type?.trim())
    const hasTargetDate  = !!(project.target_date)
    const settingsScore  = [hasName, hasType, hasTargetDate].filter(Boolean).length
    const settingsStatus: GateStatus = settingsScore === 3 ? 'pass' : settingsScore === 2 ? 'warn' : 'fail'

    gates.push({
      id:          'project_settings',
      label:       'Project Settings',
      description: 'Project name, type, and target date must be configured',
      status:      settingsStatus,
      message:     settingsScore === 3
        ? 'All project settings configured'
        : `Missing: ${[
            !hasName && 'name',
            !hasType && 'project type',
            !hasTargetDate && 'target date',
          ].filter(Boolean).join(', ')}`,
      value:       settingsScore,
      threshold:   3,
      blocking:    false,
    })

    // ── Gate 10: Test Coverage ────────────────────────────────────────────
    const hasQaReport       = documents.some(d => d.doc_type === 'qa_report')
    const qaPassCount       = qaVerdicts.length
    const fullQaCoverage    = completedTasks.length > 0 && qaPassCount >= completedTasks.length
    const testCovStatus: GateStatus = hasQaReport || fullQaCoverage ? 'pass'
                                    : qaPassCount > 0 ? 'warn'
                                    : 'fail'

    gates.push({
      id:          'test_coverage',
      label:       'Test Coverage',
      description: 'QA report document or 100% QA verdict coverage required',
      status:      testCovStatus,
      message:     hasQaReport
        ? 'QA report document present'
        : fullQaCoverage
          ? `All ${completedTasks.length} completed tasks have QA verdicts`
          : `${qaPassCount} QA pass(es) — need QA report doc or full QA coverage`,
      value:       hasQaReport ? 'qa_report present' : `${qaPassCount} / ${completedTasks.length} QA passes`,
      blocking:    true,
    })

    // ── Compute score ─────────────────────────────────────────────────────
    const passed     = gates.filter(g => g.status === 'pass').length
    const score      = Math.round((passed / gates.length) * 100)
    const ready      = gates.filter(g => g.blocking).every(g => g.status === 'pass')

    const result: ReleaseCheckResult = {
      project_id: projectId,
      score,
      ready,
      gates,
      warnings,
      checks_at: new Date().toISOString(),
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type:    'release_check_run',
      actor_user_id: user.id,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      new_value:     { score, ready, passed_gates: passed, total_gates: gates.length },
    })

    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET — re-run a release check (same logic, GET convenience alias)
export async function GET(request: NextRequest) {
  return POST(request)
}
