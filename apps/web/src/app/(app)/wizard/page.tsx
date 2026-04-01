import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'IRIS Wizard — Build OS',
  description: 'AI-powered project wizard',
}

/**
 * Standalone /wizard route — redirects to the most recently updated project's
 * autopilot page, or to /projects if the user has no projects yet.
 * (IrisWorkspace requires a projectId; rendering it without one causes a
 *  POST /api/projects/undefined/iris/exchange → 404.)
 */
export default async function WizardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (project) {
    redirect(`/projects/${project.id}/autopilot`)
  }

  redirect('/projects')
}
