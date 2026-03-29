import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import ReleaseReadinessView from '@/components/release/ReleaseReadinessView'
import type { ReleaseCheckResult } from '@/app/api/release/check/route'
import { writeAuditLog } from '@/lib/execution'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Release · ${data?.name || 'Project'}` }
}

/**
 * Server-side release check runner.
 * Runs the 10-gate evaluation on page load so the user sees results immediately.
 */
async function runServerReleaseCheck(projectId: string, userId: string): Promise<ReleaseCheckResult | null> {
  const admin = createAdminSupabaseClient()

  try {
    const [
      projectRes,
      tasksRes,
      blockersRes,
      agentOutputsRes,
      integrationsRes,
      documentsRes,
      costModelRes,
    ] = await Promise.all([
      admin.from('projects').select('id, name, project_type, target_date, status, description').eq('id', projectId).single(),
      admin.from('tasks').select('id, status, agent_role').eq('project_id', projectId),
      admin.from('blockers').select('id, severity, resolved_at').eq('project_id', projectId).is('resolved_at', null),
      admin.from('agent_outputs').select('task_id, output_type, qa_verdict').eq('project_id', projectId),
      admin.from('project_integrations').select('id, status').eq('project_id', projectId).eq('status', 'active'),
      admin.from('documents').select('id, doc_type, status').eq('project_id', projectId).neq('status', 'superseded'),
      admin.from('cost_models').select('total_cost_usd, estimated_total_usd').eq('project_id', projectId).single(),
    ])

    const project      = projectRes.data
    const tasks        = tasksRes.data || []
    const blockers     = blockersRes.data || []
    const agentOutputs = agentOutputsRes.data || []
    const integrations = integrationsRes.data || []
    const documents    = documentsRes.data || []
    const costModel    = costModelRes.data

    if (!project) return null

    const gates: ReleaseCheckResult['gates'] = []
    const warnings: string[] = []

    // Gate 1: Task Completion
    const activeTasks    = tasks.filter((t: any) => t.status !== 'cancelled')
    const completedTasks = tasks.filter((t: any) => t.status === 'completed')
    const completionPct  = activeTasks.length === 0 ? 100 : Math.round((completedTasks.length / activeTasks.length) * 100)
    gates.push({ id: 'task_completion', label: 'Task Completion', description: '≥ 90% of active tasks completed', status: completionPct >= 90 ? 'pass' : completionPct >= 70 ? 'warn' : 'fail', message: `${completedTasks.length} / ${activeTasks.length} tasks completed (${completionPct}%)`, value: completionPct, threshold: 90, blocking: true })

    // Gate 2: QA Coverage
    const qaVerdicts    = agentOutputs.filter((o: any) => o.output_type === 'qa_verdict' && o.qa_verdict === 'pass')
    const qaTaskIds     = new Set(qaVerdicts.map((o: any) => o.task_id))
    const qaCoverage    = completedTasks.length === 0 ? 100 : Math.round((completedTasks.filter((t: any) => qaTaskIds.has(t.id)).length / completedTasks.length) * 100)
    gates.push({ id: 'qa_coverage', label: 'QA Coverage', description: '≥ 80% of completed tasks need passing QA', status: qaCoverage >= 80 ? 'pass' : qaCoverage >= 50 ? 'warn' : 'fail', message: `${qaVerdicts.length} QA passes for ${completedTasks.length} tasks (${qaCoverage}%)`, value: qaCoverage, threshold: 80, blocking: true })

    // Gate 3: Open Blockers
    const criticalBlockers = blockers.filter((b: any) => b.severity === 'critical' || b.severity === 'high')
    gates.push({ id: 'open_blockers', label: 'Open Blockers', description: 'No unresolved critical/high blockers', status: criticalBlockers.length === 0 && blockers.length === 0 ? 'pass' : criticalBlockers.length === 0 ? 'warn' : 'fail', message: blockers.length === 0 ? 'No open blockers' : `${criticalBlockers.length} critical/high, ${blockers.length - criticalBlockers.length} medium/low open`, value: criticalBlockers.length, threshold: 0, blocking: true })
    if (blockers.length > 0 && criticalBlockers.length === 0) warnings.push(`${blockers.length} low/medium blocker(s) open`)

    // Gate 4: Failed Tasks
    const failedTasks = tasks.filter((t: any) => t.status === 'failed')
    gates.push({ id: 'failed_tasks', label: 'No Failed Tasks', description: 'Zero tasks in failed state', status: failedTasks.length === 0 ? 'pass' : 'fail', message: failedTasks.length === 0 ? 'No failed tasks' : `${failedTasks.length} task(s) in failed state`, value: failedTasks.length, threshold: 0, blocking: true })

    // Gate 5: Agent Output Coverage
    const tasksWithOutput      = new Set(agentOutputs.map((o: any) => o.task_id))
    const completedNoOutput    = completedTasks.filter((t: any) => !tasksWithOutput.has(t.id))
    const outputCoverage       = completedTasks.length === 0 ? 100 : Math.round(((completedTasks.length - completedNoOutput.length) / completedTasks.length) * 100)
    gates.push({ id: 'agent_output_coverage', label: 'Agent Output Coverage', description: 'All completed tasks have recorded outputs', status: outputCoverage === 100 ? 'pass' : outputCoverage >= 80 ? 'warn' : 'fail', message: completedNoOutput.length === 0 ? 'All completed tasks have agent outputs' : `${completedNoOutput.length} completed task(s) missing outputs`, value: outputCoverage, threshold: 100, blocking: false })
    if (completedNoOutput.length > 0) warnings.push(`${completedNoOutput.length} task(s) lack agent outputs`)

    // Gate 6: Integration Health
    gates.push({ id: 'integration_health', label: 'Integration Health', description: 'At least one active integration', status: integrations.length >= 1 ? 'pass' : 'warn', message: integrations.length === 0 ? 'No active integrations connected' : `${integrations.length} active integration(s)`, value: integrations.length, threshold: 1, blocking: false })
    if (integrations.length === 0) warnings.push('No integrations connected')

    // Gate 7: Documentation
    const hasPrd     = documents.some((d: any) => d.doc_type === 'prd')
    const hasArch    = documents.some((d: any) => d.doc_type === 'architecture')
    const docStatus  = hasPrd && hasArch ? 'pass' : documents.length >= 1 ? 'warn' : 'fail'
    gates.push({ id: 'documentation', label: 'Documentation', description: 'PRD and Architecture docs required', status: docStatus as any, message: documents.length === 0 ? 'No documents found' : `${documents.length} doc(s): PRD ${hasPrd ? '✓' : '✗'}, Arch ${hasArch ? '✓' : '✗'}`, value: documents.length, threshold: 2, blocking: false })
    if (!hasPrd) warnings.push('PRD missing')
    if (!hasArch) warnings.push('Architecture doc missing')

    // Gate 8: Cost Within Budget
    let costStatus: 'pass' | 'warn' | 'fail' = 'pass', costMessage = 'No cost model', costValue: number | undefined, costThreshold: number | undefined = 110
    if (costModel) {
      const actual = costModel.total_cost_usd || 0
      const est    = costModel.estimated_total_usd || 0
      if (est > 0) {
        const pct = Math.round((actual / est) * 100)
        costValue  = pct
        costStatus = pct <= 100 ? 'pass' : pct <= 110 ? 'warn' : 'fail'
        costMessage = `$${actual.toFixed(2)} of $${est.toFixed(2)} (${pct}%)`
        if (pct > 100) warnings.push(`Cost overrun: ${pct}%`)
      } else { costStatus = 'warn'; costMessage = `$${(costModel.total_cost_usd || 0).toFixed(2)} spent — no estimate set` }
    }
    gates.push({ id: 'cost_within_budget', label: 'Cost Within Budget', description: 'Spend ≤ 110% of estimate', status: costStatus, message: costMessage, value: costValue, threshold: costThreshold, blocking: false })

    // Gate 9: Project Settings
    const hasName  = !!(project.name?.trim())
    const hasType  = !!(project.project_type?.trim())
    const hasDate  = !!(project.target_date)
    const settingsScore = [hasName, hasType, hasDate].filter(Boolean).length
    gates.push({ id: 'project_settings', label: 'Project Settings', description: 'Name, type, and target date set', status: settingsScore === 3 ? 'pass' : settingsScore === 2 ? 'warn' : 'fail', message: settingsScore === 3 ? 'All settings configured' : `Missing: ${[!hasName && 'name', !hasType && 'type', !hasDate && 'target date'].filter(Boolean).join(', ')}`, value: settingsScore, threshold: 3, blocking: false })

    // Gate 10: Test Coverage
    const hasQaReport    = documents.some((d: any) => d.doc_type === 'qa_report')
    const fullQaCov      = completedTasks.length > 0 && qaVerdicts.length >= completedTasks.length
    gates.push({ id: 'test_coverage', label: 'Test Coverage', description: 'QA report doc or full QA verdict coverage', status: hasQaReport || fullQaCov ? 'pass' : qaVerdicts.length > 0 ? 'warn' : 'fail', message: hasQaReport ? 'QA report present' : fullQaCov ? `All ${completedTasks.length} tasks QA-verified` : `${qaVerdicts.length} / ${completedTasks.length} QA passes`, value: hasQaReport ? 'qa_report present' : `${qaVerdicts.length} / ${completedTasks.length}`, blocking: true })

    const passed = gates.filter(g => g.status === 'pass').length
    const score  = Math.round((passed / gates.length) * 100)
    const ready  = gates.filter(g => g.blocking).every(g => g.status === 'pass')

    await writeAuditLog(admin, {
      event_type:    'release_check_run',
      actor_user_id: userId,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      new_value:     { score, ready, passed_gates: passed, total_gates: gates.length, source: 'page_load' },
    })

    return { project_id: projectId, score, ready, gates, warnings, checks_at: new Date().toISOString() }
  } catch {
    return null
  }
}

export default async function ReleasePage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single()

  if (!project) notFound()
  if (project.status === 'draft') redirect(`/projects/${params.id}/onboarding`)

  // Run check server-side so user sees results immediately
  const initialResult = await runServerReleaseCheck(params.id, user.id)

  return (
    <>
      <TopBar title="Release Readiness" subtitle={project.name} />
      <div className="flex-1 p-6 overflow-y-auto">
        <ReleaseReadinessView
          projectId={params.id}
          initialResult={initialResult}
        />
      </div>
    </>
  )
}
