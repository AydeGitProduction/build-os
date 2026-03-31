import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import CommandCenter from '@/components/command/CommandCenter'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { Activity, Rocket } from 'lucide-react'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('projects')
    .select('name')
    .eq('id', params.id)
    .single() as any
  return { title: (data as any)?.name ? `${(data as any).name} · Command Center` : 'Command Center' }
}

export default async function ProjectCommandCenterPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug, description, status, project_type, start_date, target_date, updated_at')
    .eq('id', params.id)
    .single() as any

  if (!project) notFound()
  if ((project as any).status === 'draft') redirect(`/projects/${params.id}/onboarding`)

  // Task stats — use admin to bypass RLS for aggregation
  const { data: tasksRaw } = await admin
    .from('tasks')
    .select('status, estimated_cost_usd, actual_cost_usd')
    .eq('project_id', params.id)

  const allTasks: any[] = (tasksRaw as any) || []
  const totalTasks      = allTasks.length
  const completedTasks  = allTasks.filter((t: any) => t.status === 'completed').length
  const blockedTasks    = allTasks.filter((t: any) => t.status === 'blocked').length
  const inProgressTasks = allTasks.filter((t: any) => ['in_progress', 'dispatched'].includes(t.status)).length
  const estimatedCost   = allTasks.reduce((s: number, t: any) => s + (Number(t.estimated_cost_usd) || 0), 0)

  // Actual cost from cost_events
  const { data: costEventsRaw } = await admin
    .from('cost_events')
    .select('total_cost_usd')
    .eq('project_id', params.id)
  const actualCost = ((costEventsRaw as any) || []).reduce((s: number, c: any) => s + (Number(c.total_cost_usd) || 0), 0)

  const initialStats = {
    totalTasks,
    completedTasks,
    blockedTasks,
    inProgressTasks,
    estimatedCost,
    actualCost,
  }

  return (
    <>
      <TopBar
        title={project.name}
        subtitle="Command Center"
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/projects/${params.id}/orchestrate`}>
              <Button size="sm" variant="outline" leftIcon={<Activity className="h-3.5 w-3.5" />}>
                Orchestrate
              </Button>
            </Link>
            <Link href={`/projects/${params.id}/autopilot`}>
              <Button size="sm" variant="primary" leftIcon={<Rocket className="h-3.5 w-3.5" />}>
                Autopilot Mode
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <CommandCenter
          projectId={params.id}
          project={project}
          initialStats={initialStats}
        />
      </div>
    </>
  )
}
