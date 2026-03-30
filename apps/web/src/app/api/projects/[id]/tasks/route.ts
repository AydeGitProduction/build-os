import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { generateExecutionPlan } from '@/lib/blueprint-generator'
import type { OnboardingAnswers } from '@/lib/types'

// Blueprint seeding can insert 100+ rows (epics → features → tasks) — needs extended timeout
export const maxDuration = 60

// GET /api/projects/[id]/tasks — list all tasks for a project (grouped by status)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const epic_id = searchParams.get('epic_id')
    const agent_role = searchParams.get('agent_role')

    let query = supabase
      .from('tasks')
      .select(`
        id, title, slug, description, status, priority, agent_role,
        task_type, estimated_hours, estimated_cost_usd, actual_cost_usd,
        order_index, created_at, updated_at,
        feature:features(
          id, title, slug,
          epic:epics(id, title, slug)
        ),
        task_runs(id, status, started_at, completed_at)
      `)
      .order('created_at', { ascending: true })

    // Filter by project via features → epics → project_id
    const { data: epicIds } = await supabase
      .from('epics')
      .select('id')
      .eq('project_id', params.id)

    if (!epicIds || epicIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const epicIdList = epicIds.map(e => e.id)
    const { data: featureIds } = await supabase
      .from('features')
      .select('id')
      .in('epic_id', epicIdList)

    if (!featureIds || featureIds.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const featureIdList = featureIds.map(f => f.id)
    query = query.in('feature_id', featureIdList)

    if (status) query = query.eq('status', status)
    if (epic_id) {
      const { data: epicFeatureIds } = await supabase
        .from('features')
        .select('id')
        .eq('epic_id', epic_id)
      if (epicFeatureIds) {
        query = query.in('feature_id', epicFeatureIds.map(f => f.id))
      }
    }
    if (agent_role) query = query.eq('agent_role', agent_role)

    const { data: tasks, error } = await query
    if (error) throw error

    return NextResponse.json({ data: tasks || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects/[id]/tasks — seed tasks from execution plan
// Body: { source: 'blueprint' } — seeds from the generated blueprint
// Body: { manual: true, feature_id, name, ... } — creates a single manual task
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (body.source === 'blueprint') {
      // Use admin client for blueprint seeding — RLS blocks user-JWT from
      // reading questionnaires and inserting epics/features/tasks
      const admin = createAdminSupabaseClient()
      return await seedFromBlueprint(admin, params.id)
    }

    // Manual task creation
    const { feature_id, name, description, agent_role, priority, task_type, estimated_hours } = body
    if (!feature_id || !name?.trim()) {
      return NextResponse.json({ error: 'feature_id and name are required' }, { status: 400 })
    }

    const slug = name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        feature_id,
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        agent_role: agent_role || 'orchestrator',
        priority: priority || 'medium',
        task_type: task_type || 'development',
        status: 'pending',
        estimated_hours: estimated_hours || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data: task }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message :
      (err as any)?.message || JSON.stringify(err) || 'Internal server error'
    console.error('[tasks POST] Error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function seedFromBlueprint(supabase: any, projectId: string) {
  // Load project + questionnaire answers
  const { data: project, error: pError } = await supabase
    .from('projects')
    .select('id, name, project_type')
    .eq('id', projectId)
    .single()

  if (pError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Check for existing epics — prevent double-seeding
  const { data: existingEpics } = await supabase
    .from('epics')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)

  if (existingEpics && existingEpics.length > 0) {
    return NextResponse.json(
      { error: 'Execution plan already seeded for this project' },
      { status: 409 }
    )
  }

  const { data: questionnaire } = await supabase
    .from('questionnaires')
    .select('id, answers(question_id, answer_value)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const answersMap: OnboardingAnswers = {} as OnboardingAnswers
  if (questionnaire?.answers) {
    for (const a of questionnaire.answers) {
      (answersMap as Record<string, string>)[a.question_id] = a.answer_value
    }
  }

  // Generate execution plan
  const { generateBlueprint } = await import('@/lib/blueprint-generator')
  const generated = generateBlueprint(answersMap, project.project_type)
  const executionPlan = generateExecutionPlan(generated, project.project_type)

  const seededEpics = []
  let epicSeq = 1

  for (const epic of executionPlan) {
    const epicSlug = ((epic.title || epic.name || '').toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60) || 'epic') + '-' + Math.random().toString(36).slice(2, 10)

    const { data: epicRow, error: epicError } = await supabase
      .from('epics')
      .insert({
        project_id: projectId,
        title: epic.title || epic.name,
        slug: epicSlug,
        description: epic.description || null,
        status: 'pending',
        order_index: epicSeq++,
      })
      .select()
      .single()

    if (epicError) throw epicError

    const seededFeatures = []
    let featureSeq = 1

    for (const feature of (epic.features || [])) {
      const featureSlug = ((feature.title || feature.name || '').toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 60) || 'feature') + '-' + Math.random().toString(36).slice(2, 10)

      const { data: featureRow, error: featError } = await supabase
        .from('features')
        .insert({
          epic_id: epicRow.id,
          project_id: projectId,
          title: feature.title || feature.name,
          slug: featureSlug,
          description: feature.description || null,
          status: 'pending',
          priority: 'medium',
          order_index: featureSeq++,
        })
        .select()
        .single()

      if (featError) throw featError

      const taskRows = (feature.tasks || []).map((task: any, idx: number) => {
        const taskSlug = ((task.title || task.name || '').toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 60) || 'task') + '-' + Math.random().toString(36).slice(2, 10)

        return {
          feature_id: featureRow.id,
          project_id: projectId,
          title: task.title || task.name,
          slug: taskSlug,
          description: task.description || null,
          agent_role: task.agent_role || 'backend_engineer',
          priority: task.priority || 'medium',
          // task_type must be one of: code, schema, document, test, review, deploy, design
          task_type: (task.task_type === 'development' ? 'code' : task.task_type) || 'code',
          status: 'pending',
          estimated_cost_usd: task.estimated_cost_usd || null,
          order_index: task.order_index ?? idx,
        }
      })

      if (taskRows.length > 0) {
        const { error: taskError } = await supabase.from('tasks').insert(taskRows)
        if (taskError) throw taskError
      }

      seededFeatures.push({ ...featureRow, task_count: taskRows.length })
    }

    seededEpics.push({ ...epicRow, feature_count: seededFeatures.length })
  }

  // Update project status to in_progress
  await supabase
    .from('projects')
    .update({ status: 'in_progress' })
    .eq('id', projectId)

  // P6: Event-driven execution — fire an immediate orchestration tick so the
  // first batch of ready tasks is dispatched right away, without waiting for cron.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const secret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
    fetch(`${appUrl}/api/orchestrate/tick?project_id=${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Buildos-Secret': secret,
      },
      body: JSON.stringify({ triggered_by: 'seed_complete' }),
    }).catch(() => {}) // fire-and-forget
  } catch { /* non-fatal */ }

  return NextResponse.json({
    data: {
      epics_seeded: seededEpics.length,
      epics: seededEpics,
    }
  }, { status: 201 })
}
