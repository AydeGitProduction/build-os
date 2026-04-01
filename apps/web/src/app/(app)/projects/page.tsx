import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import TopBar from '@/components/layout/TopBar'
import ProjectCard from '@/components/projects/ProjectCard'
import Button from '@/components/ui/Button'
import { Plus, FolderOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const supabase = await createServerSupabaseClient()

  // Auth check
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch {
    // Auth call failed — supabase might be misconfigured
  }
  if (!user) redirect('/login')

  // Fetch projects — simple query, no nested relations that may lack FK definitions
  let projects: any[] = []
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, slug, description, status, project_type, target_date, updated_at')
      .order('updated_at', { ascending: false })
    if (!error && data) {
      projects = data
    }
  } catch (e) {
    console.error('[ProjectsPage] Supabase query failed:', e)
    // Render empty state rather than crash
  }

  return (
    <>
      <TopBar
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          <Link href="/projects/new">
            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
              New project
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-6">
        {projects.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-5">
              <FolderOpen className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">No projects yet</h3>
            <p className="text-sm text-slate-500 max-w-xs mb-6">
              Create your first project and let Build OS generate your entire execution plan automatically.
            </p>
            <Link href="/projects/new">
              <Button leftIcon={<Plus className="h-4 w-4" />}>Create your first project</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project: any) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block">
                <ProjectCard project={project} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
