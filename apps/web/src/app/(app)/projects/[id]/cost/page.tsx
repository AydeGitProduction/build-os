import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import LiveCostDashboard from '@/components/cost/LiveCostDashboard'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Cost · ${data?.name || 'Project'}` }
}

export default async function CostPage({ params }: Props) {
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

  // Fetch cost model, recent events, and task estimates in parallel
  const [{ data: costModel }, { data: costEvents }, { data: epics }] = await Promise.all([
    supabase
      .from('cost_models')
      .select('total_spend_usd, ai_usage_usd, automation_usd, infrastructure_usd, saas_usd, storage_usd, budget_usd, last_calculated_at')
      .eq('project_id', params.id)
      .single(),
    supabase
      .from('cost_events')
      .select('id, event_type, category, description, tokens_used, model_id, unit_cost_usd, quantity, total_cost_usd, task_id, created_at')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('epics')
      .select('features(tasks(estimated_cost_usd))')
      .eq('project_id', params.id),
  ])

  const estimatedTotal = (epics || []).flatMap((e: any) =>
    (e.features || []).flatMap((f: any) => f.tasks || [])
  ).reduce((s: number, t: any) => s + (t.estimated_cost_usd || 0), 0)

  return (
    <>
      <TopBar title="Cost & Budget" subtitle={project.name} />

      <div className="flex-1 p-6">
        <LiveCostDashboard
          projectId={params.id}
          initialCostModel={costModel || null}
          initialEvents={costEvents || []}
          estimatedTotal={estimatedTotal}
        />
      </div>
    </>
  )
}
