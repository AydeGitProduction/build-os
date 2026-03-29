import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import LiveTaskBoard from '@/components/tasks/LiveTaskBoard'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Tasks · ${data?.name || 'Project'}` }
}

export default async function TasksPage({ params }: Props) {
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

  // Fetch epics → features → tasks
  const { data: epics } = await supabase
    .from('epics')
    .select(`
      id, title, slug, sequence,
      features(
        id, title, slug,
        tasks(
          id, title, slug, description, status, priority, agent_role,
          task_type, estimated_hours, estimated_cost_usd, actual_cost_usd
        )
      )
    `)
    .eq('project_id', params.id)
    .order('sequence')

  // Flatten tasks with epic/feature context
  const tasks = (epics || []).flatMap((epic: any) =>
    (epic.features || []).flatMap((feature: any) =>
      (feature.tasks || []).map((task: any) => ({
        ...task,
        feature: {
          id: feature.id,
          title: feature.title,
          slug: feature.slug,
          epic: { id: epic.id, title: epic.title, slug: epic.slug },
        },
      }))
    )
  )

  return (
    <>
      <TopBar
        title="Task Board"
        subtitle={project.name}
        actions={
          <Link href={`/projects/${params.id}`}>
            <Button variant="ghost" size="sm" leftIcon={<LayoutGrid className="h-3.5 w-3.5" />}>
              Dashboard
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-6">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm text-slate-500 mb-4">No tasks have been seeded yet.</p>
            <p className="text-xs text-slate-400">Complete the onboarding wizard to generate your execution plan.</p>
          </div>
        ) : (
          <LiveTaskBoard initialTasks={tasks} projectId={params.id} />
        )}
      </div>
    </>
  )
}
