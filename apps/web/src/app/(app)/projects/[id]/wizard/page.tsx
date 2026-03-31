import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

interface Props { params: { id: string } }

export default async function WizardPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: blueprint } = await admin
    .from('blueprints')
    .select('id, status')
    .eq('project_id', params.id)
    .maybeSingle()

  if (blueprint && blueprint.status === 'confirmed') {
    redirect(`/projects/${params.id}/autopilot`)
  }

  redirect(`/projects/${params.id}/autopilot`)
}
