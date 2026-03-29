import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import SystemView from '@/components/command/SystemView'
import SupervisorDashboard from '@/components/command/SupervisorDashboard'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single() as any
  return { title: `System · ${(data as any)?.name || 'Project'}` }
}

export default async function SystemPage({ params }: Props) {
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
      <TopBar title="System" subtitle={(project as any).name} />
      <div className="flex-1 p-6 overflow-y-auto space-y-10">

        {/* ── Supervisor Intelligence ─────────────────────────────────────── */}
        <section>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">Supervisor Intelligence</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Real-time autonomous loop health, incident detection, and auto-remediation.
            </p>
          </div>
          <SupervisorDashboard projectId={params.id} />
        </section>

        {/* ── System Architecture ─────────────────────────────────────────── */}
        <section>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">System Architecture</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Database schema, integrations, APIs, and tech stack configuration.
            </p>
          </div>
          <SystemView projectId={params.id} />
        </section>

      </div>
    </>
  )
}
