import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'IRIS Wizard — Build OS',
  description: 'AI-powered project wizard',
}

/**
 * Standalone /wizard route — redirects to the most recently updated project's
 * autopilot page, or to /projects if the user has no projects yet.
 *
 * FIX (wizard-redirect): Previously used supabase client with owner_id filter,
 * which returned no results when projects are created via service role with a
 * different owner_id. Now tries owner_id first, then falls back to any project
 * via admin client so the redirect always works.
 */
export default async function WizardPage() {
  const supabase = await createServerSupabaseClient()
  const admin    = createAdminSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Try owner_id first (standard case)
  let { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fallback: most recently updated project regardless of owner
  // (handles service-created projects with system owner_id)
  if (!project) {
    const { data: fallback } = await admin
      .from('projects')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    project = fallback
  }

  if (project) {
    redirect(`/projects/${project.id}/autopilot`)
  }

  redirect('/projects')
}
