import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import IntegrationsView from '@/components/integrations/IntegrationsView'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Integrations · ${data?.name || 'Project'}` }
}

export default async function IntegrationsPage({ params }: Props) {
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

  const [{ data: providers }, { data: projectIntegrations }] = await Promise.all([
    supabase
      .from('integration_providers')
      .select('id, name, slug, category, description, auth_type, logo_url, required_fields, optional_fields')
      .eq('is_active', true)
      .order('category').order('name'),
    supabase
      .from('project_integrations')
      .select('id, provider_id, status, environment, created_at')
      .eq('project_id', params.id),
  ])

  return (
    <>
      <TopBar title="Integrations" subtitle={project.name} />
      <div className="flex-1 p-6">
        <IntegrationsView
          projectId={params.id}
          providers={providers || []}
          projectIntegrations={projectIntegrations || []}
        />
      </div>
    </>
  )
}
