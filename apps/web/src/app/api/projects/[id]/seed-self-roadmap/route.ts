/**
 * POST /api/projects/[id]/seed-self-roadmap
 *
 * Seeds the Build OS self-referential roadmap into the given project.
 * This is the moment the system starts building itself.
 *
 * - Creates 5 epics, 15 features, 46 tasks from BUILD_OS_ROADMAP
 * - Marks order_index=0 tasks in EACH EPIC's first feature as 'ready'
 * - All other tasks start as 'pending'
 * - Idempotent: returns 409 if epics already exist
 * - Audited
 * - Updates project status to 'in_progress'
 * - Initialises cost model with roadmap total estimate
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/execution'
import { BUILD_OS_ROADMAP, ROADMAP_SUMMARY } from '@/data/build-os-roadmap'

export async function POST(
  _request: NextRequest,
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

    // ── Auth guard: project must belong to user's workspace ──────────────────
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, status')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // ── Idempotency: block double-seeding ────────────────────────────────────
    const { data: existingEpics } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)

    if (existingEpics && existingEpics.length > 0) {
      return NextResponse.json(
        { error: 'Roadmap already seeded for this project', code: 'ALREADY_SEEDED' },
        { status: 409 }
      )
    }

    // ── Seed loop ─────────────────────────────────────────────────────────────
    const seededEpics: Array<{ id: string; title: string; feature_count: number; task_count: number }> = []
    let totalTasksSeeded = 0
    let totalReadyMarked  = 0

    for (const epicDef of BUILD_OS_ROADMAP) {
      // Insert epic
      const { data: epicRow, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id:  projectId,
          title:       epicDef.title,
          description: epicDef.description,
          status:      'pending',
          order_index: epicDef.order_index,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        throw new Error(`Failed to insert epic "${epicDef.title}": ${epicErr?.message}`)
      }

      let epicTaskCount    = 0
      const epicFeatureIds: string[] = []

      for (const featDef of epicDef.features) {
        // Insert feature
        const { data: featRow, error: featErr } = await admin
          .from('features')
          .insert({
            epic_id:     epicRow.id,
            project_id:  projectId,
            title:       featDef.title,
            description: featDef.description,
            status:      'pending',
            priority:    featDef.priority,
            order_index: featDef.order_index,
          })
          .select('id, title')
          .single()

        if (featErr || !featRow) {
          throw new Error(`Failed to insert feature "${featDef.title}": ${featErr?.message}`)
        }

        epicFeatureIds.push(featRow.id)

        // Insert tasks
        // Tasks in the FIRST feature of EACH epic with order_index=0 start as 'ready'
        const isFirstFeature = featDef.order_index === 0

        const taskRows = featDef.tasks.map(taskDef => ({
          feature_id:         featRow.id,
          project_id:         projectId,
          title:              taskDef.title,
          description:        taskDef.description,
          agent_role:         taskDef.agent_role,
          task_type:          taskDef.task_type,
          priority:           taskDef.priority,
          order_index:        taskDef.order_index,
          estimated_cost_usd: taskDef.estimated_cost_usd,
          max_retries:        taskDef.max_retries ?? 3,
          // First task in each epic's first feature starts ready
          status:             (isFirstFeature && taskDef.order_index === 0) ? 'ready' : 'pending',
          context_payload:    {
            source:            'self_roadmap',
            epic_title:        epicDef.title,
            feature_title:     featDef.title,
            auto_dispatched:   false,
          },
        }))

        const { error: taskErr } = await admin.from('tasks').insert(taskRows)
        if (taskErr) {
          throw new Error(`Failed to insert tasks for "${featDef.title}": ${taskErr.message}`)
        }

        const readyInFeature = taskRows.filter(t => t.status === 'ready').length
        totalReadyMarked  += readyInFeature
        totalTasksSeeded  += taskRows.length
        epicTaskCount     += taskRows.length
      }

      seededEpics.push({
        id:            epicRow.id,
        title:         epicRow.title,
        feature_count: epicDef.features.length,
        task_count:    epicTaskCount,
      })
    }

    // ── Update project status → in_progress ────────────────────────────────
    await admin
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', projectId)

    // ── Init / update cost model with estimated total ──────────────────────
    const estimatedTotal = ROADMAP_SUMMARY.total_estimated_cost_usd
    const { data: existingModel } = await admin
      .from('cost_models')
      .select('id')
      .eq('project_id', projectId)
      .single()

    if (existingModel) {
      await admin
        .from('cost_models')
        .update({ estimated_total_usd: estimatedTotal })
        .eq('id', existingModel.id)
    } else {
      await admin.from('cost_models').insert({
        project_id:          projectId,
        estimated_total_usd: estimatedTotal,
        total_cost_usd:      0,
        ai_cost_usd:         0,
        infra_cost_usd:      0,
        human_cost_usd:      0,
        other_cost_usd:      0,
      })
    }

    // ── Audit ─────────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type:    'project_status_changed',
      actor_user_id: user.id,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      old_value:     { status: project.status },
      new_value:     { status: 'in_progress' },
      metadata: {
        event:            'self_roadmap_seeded',
        epics_seeded:     seededEpics.length,
        features_seeded:  ROADMAP_SUMMARY.features,
        tasks_seeded:     totalTasksSeeded,
        ready_on_start:   totalReadyMarked,
        estimated_cost:   estimatedTotal,
      },
    })

    return NextResponse.json({
      data: {
        message:         'Build OS self-roadmap seeded. System is now self-building.',
        project_id:      projectId,
        epics_seeded:    seededEpics.length,
        features_seeded: ROADMAP_SUMMARY.features,
        tasks_seeded:    totalTasksSeeded,
        tasks_ready:     totalReadyMarked,
        estimated_total_cost_usd: estimatedTotal,
        epics:           seededEpics,
      }
    }, { status: 201 })

  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
