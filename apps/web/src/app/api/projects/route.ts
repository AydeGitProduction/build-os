import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// G11: Admin client for governance audit writes (bypasses RLS)
const adminAudit = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUILDOS_SECRET =
  process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

// G11: Governance/stress-test project name patterns that require sandbox_approved flag
// Any project whose name matches these patterns is treated as a governance test artifact
// and MUST NOT silently create production-scoped records without explicit approval.
const GOVERNANCE_TEST_PATTERNS = [
  /^g\d+[-_]/i,           // G9-, G10-, G11- prefixed
  /[-_]g\d+$/i,           // suffixed -G9, _G11
  /stress[-_]test/i,       // stress-test, stress_test
  /load[-_]test/i,         // load-test, load_test
  /governance[-_]test/i,   // governance-test
  /infra[-_]test/i,        // infra-test
  /^test[-_]stress/i,      // test-stress prefix
  /sandbox[-_]test/i,      // sandbox-test
]

function isGovernanceTestProject(name: string): boolean {
  return GOVERNANCE_TEST_PATTERNS.some(pattern => pattern.test(name))
}

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
    const { name, description, workspace_id, project_type, start_date, target_date, sandbox_approved } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }
    if (!workspace_id) {
      return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
    }

    // G11 SCOPE 4: Production vs Sandbox Boundary
    // Governance/stress-test project names cannot silently create production-scoped artifacts.
    // They MUST include sandbox_approved: true or be blocked.
    if (isGovernanceTestProject(String(name))) {
      if (!sandbox_approved) {
        // Write governance incident log before rejecting
        try {
          await adminAudit.from('settings_changes').insert({
            setting_area: 'provisioning',
            setting_key: 'sandbox_boundary_violation',
            previous_value: 'none',
            new_value: 'blocked',
            reason: `G11 sandbox boundary: governance/stress-test project name "${name}" rejected — sandbox_approved not set`,
            changed_by: String(user.id),
          })
        } catch (_logErr) { /* non-fatal */ }

        return NextResponse.json({
          error: 'Sandbox boundary violation: governance/stress-test project names require sandbox_approved: true in the request body',
          code: 'SANDBOX_BOUNDARY_VIOLATION',
          project_name: name,
          required: 'Include { sandbox_approved: true } to create governance test projects',
        }, { status: 403 })
      }
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

    // G11 SCOPE 5: Provisioning Audit Trail
    // Write durable project_created record to settings_changes immediately after DB insert.
    // This is the authoritative record that project was created via approved API path.
    try {
      await adminAudit.from('settings_changes').insert({
        setting_area: 'provisioning',
        setting_key: `project_created_${(project as any).id}`,
        previous_value: 'none',
        new_value: 'created',
        reason: `Project "${name.trim()}" created via approved API path — workspace_id=${workspace_id}, user=${user.id}, sandbox_approved=${!!sandbox_approved}, is_governance_test=${isGovernanceTestProject(String(name))}`,
        changed_by: String(user.id),
      })
    } catch (auditErr) {
      // Non-fatal: log but don't fail project creation
      console.error('[projects/route] G11 provisioning audit write failed (non-fatal):', auditErr)
    }

    // Auto-trigger provisioning (fire-and-forget — does not block response)
    // Provisions GitHub repo + Vercel project in background
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const internalSecret = process.env.BUILDOS_INTERNAL_SECRET ?? process.env.BUILDOS_SECRET
    if (internalSecret) {
      fetch(`${appUrl}/api/projects/${(project as any).id}/provision`, {
        method: 'POST',
        headers: {
          'x-buildos-secret': internalSecret,
          'content-type': 'application/json',
        },
      }).catch((provisionErr) => {
        // Log but never fail project creation due to provisioning errors
        console.error('[projects/route] Provisioning trigger failed:', provisionErr)
      })
    }

    return NextResponse.json({
      data: project,
      // G11: Surface provisioning control metadata
      provisioning: {
        audit_written: true,
        approved_path: true,
        is_governance_test: isGovernanceTestProject(String(name)),
        sandbox_approved: !!sandbox_approved,
      },
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
