import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

// GET /api/projects — list all projects for the current user (across workspaces)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace_id')
    const status = searchParams.get('status')

    let query = supabase
      .from('projects')
      .select(`
        id, name, slug, description, status, project_type,
        start_date, target_date, created_at, updated_at,
        workspace:workspaces(id, name, slug),
        epics(id, status),
        tasks(id, status)
      `)
      .order('updated_at', { ascending: false })

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: projects, error } = await query
    if (error) throw error

    // Compute summary stats inline
    const projectsWithStats = (projects || []).map((p: any) => {
      const tasks = p.tasks || []
      const completedTasks = tasks.filter((t: any) => t.status === 'completed').length
      const totalTasks = tasks.length
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        status: p.status,
        project_type: p.project_type,
        start_date: p.start_date,
        target_date: p.target_date,
        created_at: p.created_at,
        updated_at: p.updated_at,
        workspace: p.workspace,
        epic_count: (p.epics || []).length,
        task_count: totalTasks,
        completed_task_count: completedTasks,
        progress_pct: progress,
      }
    })

    return NextResponse.json({ data: projectsWithStats })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  try {
    // Auth check via user JWT
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, workspace_id, project_type, start_date, target_date } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }
    if (!workspace_id) {
      return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
    }

    const slug = name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Use admin client for DB writes — bypasses RLS which blocks project creation
    const admin = createAdminSupabaseClient()

    const { data: project, error } = await admin
      .from('projects')
      .insert({
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        workspace_id,
        project_type: project_type || 'saas',
        status: 'draft',
        start_date: start_date || null,
        target_date: target_date || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A project with this name already exists in this workspace' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Auto-create default project environments
    const environments = ['development', 'staging', 'production']
    await admin.from('project_environments').insert(
      environments.map(env => ({
        project_id: (project as any).id,
        name: env,
        is_production: env === 'production',
      }))
    )

    // Auto-create project settings
    await admin.from('project_settings').insert({
      project_id: (project as any).id,
      auto_dispatch: true,
      require_qa_on_all_tasks: true,
      max_parallel_agents: 4,
      orchestration_mode: 'full_auto',
      safe_stop: false,
    })

    return NextResponse.json({ data: project }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
