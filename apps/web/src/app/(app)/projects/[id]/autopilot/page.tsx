/**
 * Autopilot Mode Page
 * Full-screen execution experience:
 *   - ExecutionTopBar (48px, fixed)
 *   - MiniSidebar (64px) | WizardPanel (split left) | PreviewPanel (split right)
 *   - LogStream (bottom drawer)
 *
 * WS4 — Autopilot Mode
 */

import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import AutopilotClient from './AutopilotClient'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('projects').select('name').eq('id', params.id).single()
  return { title: `Autopilot · ${data?.name ?? 'Project'}` }
}

export default async function AutopilotPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await admin
    .from('projects')
    .select('id, name, status')
    .eq('id', params.id)
    .single()

  if (!project) notFound()

  return (
    <AutopilotClient
      projectId={params.id}
      projectName={project.name}
      userId={user.id}
    />
  )
}
