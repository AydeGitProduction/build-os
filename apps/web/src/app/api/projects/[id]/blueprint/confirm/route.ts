import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { generateBlueprint, generateExecutionPlan, estimateBuildCost } from '@/lib/blueprint-generator'
import type { OnboardingAnswers, ProjectType } from '@/lib/types'

/** Generate a URL-safe slug from a title string */
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60) || 'item'
}

/** Generate a unique slug: title-slug + random 8-char hex suffix */
function uniqueSlug(title: string): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${toSlug(title)}-${rand}`
}

/**
 * POST /api/projects/[id]/blueprint/confirm
 *
 * Confirms the blueprint and seeds epics/features/tasks from the execution plan.
 * - Accepts blueprint (status → 'accepted')
 * - Seeds epics, features, tasks from generateExecutionPlan()
 * - Updates project status → 'in_progress'
 * - Initialises cost model
 * - Returns { project_id, epics_seeded, tasks_seeded }
 *
 * Idempotent: returns 409 if epics already exist.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = params.id

    // ── Auth guard ────────────────────────────────────────────────────────────
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, status, project_type')
      .eq('id', projectId)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // ── Idempotency guard ─────────────────────────────────────────────────────
    const { data: existingEpics } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)

    if (existingEpics && existingEpics.length > 0) {
      // Already seeded — just navigate to dashboard
      return NextResponse.json({ project_id: projectId, already_seeded: true }, { status: 200 })
    }

    // ── Load latest accepted/draft blueprint ──────────────────────────────────
    const { data: blueprint } = await admin
      .from('blueprints')
      .select('id, questionnaire_id, status')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (!blueprint) {
      return NextResponse.json({ error: 'No blueprint found — complete the wizard first' }, { status: 404 })
    }

    // ── Load questionnaire answers ────────────────────────────────────────────
    const { data: questionnaire } = await admin
      .from('questionnaires')
      .select('id, answers(question_id, value)')
      .eq('id', blueprint.questionnaire_id)
      .single()

    const rawAnswers: Record<string, string> = {}
    for (const a of (questionnaire?.answers || [])) {
      rawAnswers[(a as { question_id: string; value: unknown }).question_id] =
        String((a as { question_id: string; value: unknown }).value ?? '')
    }

    const answersMap: OnboardingAnswers = {
      what_building: rawAnswers.what_building || rawAnswers.product_name || project.name || '',
      target_user:   rawAnswers.target_user   || rawAnswers.target_audience || '',
      core_outcome:  rawAnswers.core_outcome  || rawAnswers.core_problem || '',
      key_features:  rawAnswers.key_features || '',
      integrations:  (rawAnswers.integrations_needed || rawAnswers.integrations || '')
        .split(',').map((s: string) => s.trim()).filter(Boolean),
    }

    // ── Generate execution plan ───────────────────────────────────────────────
    const generated = generateBlueprint(answersMap, (project.project_type as ProjectType) || 'saas')
    const executionPlan = generateExecutionPlan(generated, (project.project_type as ProjectType) || 'saas')
    const estimatedCost = estimateBuildCost(executionPlan)

    // ── Seed epics → features → tasks ─────────────────────────────────────────
    let totalTasksSeeded = 0
    let totalEpicsSeeded = 0

    for (const epicDef of executionPlan) {
      const { data: epicRow, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id:  projectId,
          title:       epicDef.title,
          slug:        uniqueSlug(epicDef.title),
          description: epicDef.description,
          status:      'pending',
          priority:    epicDef.priority,
          order_index: epicDef.order_index,
        })
        .select('id')
        .single()

      if (epicErr || !epicRow) {
        console.error('[confirm] epic insert error:', epicErr?.message)
        continue
      }

      totalEpicsSeeded++

      for (const featDef of epicDef.features) {
        const { data: featRow, error: featErr } = await admin
          .from('features')
          .insert({
            epic_id:     epicRow.id,
            project_id:  projectId,
            title:       featDef.title,
            slug:        uniqueSlug(featDef.title),
            description: featDef.description,
            status:      'pending',
            priority:    featDef.priority,
            order_index: featDef.order_index,
          })
          .select('id')
          .single()

        if (featErr || !featRow) {
          console.error('[confirm] feature insert error:', featErr?.message)
          continue
        }

        const isFirstFeature = featDef.order_index === 0
        const taskRows = featDef.tasks.map(taskDef => ({
          feature_id:         featRow.id,
          project_id:         projectId,
          title:              taskDef.title,
          slug:               uniqueSlug(taskDef.title),
          description:        taskDef.description,
          agent_role:         taskDef.agent_role,
          task_type:          taskDef.task_type,
          priority:           taskDef.priority,
          order_index:        taskDef.order_index,
          estimated_cost_usd: taskDef.estimated_cost_usd,
          max_retries:        3,
          status:             (isFirstFeature && taskDef.order_index === 0) ? 'ready' : 'pending',
          context_payload:    {
            source:        'iris_wizard',
            epic_title:    epicDef.title,
            feature_title: featDef.title,
          },
        }))

        const { error: taskErr } = await admin.from('tasks').insert(taskRows)
        if (taskErr) {
          console.error('[confirm] tasks insert error:', taskErr.message)
        } else {
          totalTasksSeeded += taskRows.length
        }
      }
    }

    // ── Mark blueprint accepted ───────────────────────────────────────────────
    await admin
      .from('blueprints')
      .update({ status: 'accepted', accepted_by: user.id, accepted_at: new Date().toISOString() })
      .eq('id', blueprint.id)

    // ── Update project status → in_progress ───────────────────────────────────
    await admin
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', projectId)

    // ── Init cost model ───────────────────────────────────────────────────────
    const { data: existingModel } = await admin
      .from('cost_models')
      .select('id')
      .eq('project_id', projectId)
      .single()

    if (existingModel) {
      await admin
        .from('cost_models')
        .update({ estimated_total_usd: estimatedCost })
        .eq('id', existingModel.id)
    } else {
      await admin.from('cost_models').insert({
        project_id:          projectId,
        estimated_total_usd: estimatedCost,
        total_cost_usd:      0,
        ai_cost_usd:         0,
        infra_cost_usd:      0,
        human_cost_usd:      0,
      })
    }

    return NextResponse.json({
      project_id:    projectId,
      epics_seeded:  totalEpicsSeeded,
      tasks_seeded:  totalTasksSeeded,
      estimated_cost_usd: estimatedCost,
    }, { status: 201 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Internal server error'
    console.error('[blueprint confirm]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
