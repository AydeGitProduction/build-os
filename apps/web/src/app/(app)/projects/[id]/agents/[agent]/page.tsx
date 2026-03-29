import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import AgentDetailView from '@/components/command/AgentDetailView'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'

const AGENT_DISPLAY: Record<string, string> = {
  solution_architect:      'Architect',
  backend_engineer:        'Backend Engineer',
  frontend_engineer:       'Frontend Engineer',
  integration_engineer:    'Integration Engineer',
  qa_security_auditor:     'QA Auditor',
  documentation_engineer:  'Documentation Engineer',
  cost_analyst:            'Cost Analyst',
}

interface Props {
  params: { id: string; agent: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = AGENT_DISPLAY[params.agent] || params.agent
  return { title: `${name} · Agent Detail` }
}

export default async function AgentDetailPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single() as any

  if (!project) notFound()
  if ((project as any).status === 'draft') redirect(`/projects/${params.id}/onboarding`)

  // Validate agent role exists
  if (!AGENT_DISPLAY[params.agent]) notFound()

  // Fetch task runs for this agent
  const { data: runsRaw } = await admin
    .from('task_runs')
    .select('id, status, started_at, completed_at, duration_ms, tokens_input, tokens_output, model_used, cost_usd, error_message, task_id')
    .eq('project_id', params.id)
    .eq('agent_role', params.agent)
    .order('created_at', { ascending: false })
    .limit(20) as any
  const runs: any[] = (runsRaw as any) || []

  // Fetch recent tasks
  const { data: tasksRaw } = await admin
    .from('tasks')
    .select('id, title, status, priority, completed_at, created_at, actual_cost_usd, estimated_cost_usd')
    .eq('project_id', params.id)
    .eq('agent_role', params.agent)
    .order('created_at', { ascending: false })
    .limit(10) as any
  const tasks: any[] = (tasksRaw as any) || []

  // Fetch recent QA verdicts for this agent's tasks
  const taskIds = tasks.map((t: any) => t.id)
  let verdicts: any[] = []
  if (taskIds.length > 0) {
    const { data } = await admin
      .from('qa_verdicts')
      .select('id, task_id, verdict, score, created_at')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
      .limit(20) as any
    verdicts = (data as any) || []
  }

  // Fetch outputs
  const { data: outputsRaw } = await admin
    .from('agent_outputs')
    .select('id, output_type, is_valid, created_at, task_id')
    .eq('project_id', params.id)
    .eq('agent_role', params.agent)
    .order('created_at', { ascending: false })
    .limit(20) as any
  const outputs: any[] = (outputsRaw as any) || []

  // Compute stats
  const completedRuns = runs.filter((r: any) => r.status === 'completed')
  const avgDuration = completedRuns.length > 0
    ? Math.round(completedRuns.reduce((s: number, r: any) => s + (r.duration_ms || 0), 0) / completedRuns.length)
    : 0

  const totalRuns = runs.length
  const successRuns = runs.filter((r: any) => r.status === 'completed').length
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0

  const totalTasks = tasks.length
  const completedTasksCount = tasks.filter((t: any) => t.status === 'completed').length

  const initialData = {
    agentRole: params.agent,
    displayName: AGENT_DISPLAY[params.agent],
    runs: runs || [],
    tasks: tasks || [],
    verdicts,
    outputs: outputs || [],
    stats: {
      totalTasks,
      completedTasks: completedTasksCount,
      successRate,
      avgDurationMs: avgDuration,
    },
  }

  return (
    <>
      <TopBar
        title={AGENT_DISPLAY[params.agent] || params.agent}
        subtitle="Agent Detail"
        actions={
          <Link href={`/projects/${params.id}/agents`}>
            <Button size="sm" variant="outline" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
              All Agents
            </Button>
          </Link>
        }
      />
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentDetailView projectId={params.id} initialData={initialData} />
      </div>
    </>
  )
}
