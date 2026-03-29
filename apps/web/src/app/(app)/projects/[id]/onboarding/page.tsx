import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import IrisChat from '@/components/onboarding/IrisChat'

export const metadata: Metadata = { title: 'Project Onboarding · Iris' }

interface Props {
  params: { id: string }
}

export default async function OnboardingPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  // If blueprint already generated, redirect to dashboard
  if (project.status !== 'draft') {
    redirect(`/projects/${params.id}`)
  }

  return (
    <>
      <TopBar
        title="Meet Iris"
        subtitle="Your AI architect · product discovery"
      />

      <div className="flex-1 p-6 overflow-hidden">
        <IrisChat projectId={project.id} projectName={project.name} />
      </div>
    </>
  )
}
