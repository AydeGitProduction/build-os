import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import DocsView from '@/components/docs/DocsView'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Docs · ${data?.name || 'Project'}` }
}

export default async function DocsPage({ params }: Props) {
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

  // Fetch all documents including content for rendering
  const { data: documents } = await supabase
    .from('documents')
    .select('id, doc_type, title, status, version, content, owner_agent_role, created_by, created_at, updated_at')
    .eq('project_id', params.id)
    .neq('status', 'superseded')         // Hide superseded docs by default
    .order('updated_at', { ascending: false })

  return (
    <>
      <TopBar title="Documentation" subtitle={project.name} />
      <div className="flex-1 p-6 flex flex-col min-h-0">
        <DocsView
          projectId={params.id}
          initialDocs={documents || []}
        />
      </div>
    </>
  )
}
