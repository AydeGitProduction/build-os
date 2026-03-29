import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import AgentRoster from '@/components/command/AgentRoster'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single() as any
  return { title: `Agents · ${(data as any)?.name || 'Project'}` }
}

export default async function AgentsPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single() as any

  if (!project) notFound()
  if ((project as any).status === 'draft') redirect(`/projects/${params.id}/onboarding`)

  return (
    <>
      <TopBar title="Agents" subtitle={(project as any).name} />
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">Agent Roster</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            All agents building your project. Click any agent to see details.
          </p>
        </div>
        <AgentRoster projectId={params.id} />
      </div>
    </>
  )
}
