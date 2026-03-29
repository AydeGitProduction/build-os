/**
 * POST /api/projects/[id]/seed-phase2-roadmap
 *
 * Seeds the Build OS Phase 2 roadmap into an existing in-progress project.
 * Phase 2 builds on top of Phase 1 — it requires epics from Phase 1 to already exist.
 *
 * - Creates 5 new epics, 15 features, 55 tasks from BUILD_OS_ROADMAP_V2
 * - First task in each epic's first feature starts as 'ready'
 * - All other tasks start as 'pending'
 * - Idempotent: returns 409 if Phase 2 epics already exist (detected by epic title)
 * - Updates project cost model with Phase 2 estimated total
 * - Audited
 *
 * Auth: admin user JWT or X-Buildos-Secret (for cron/internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/execution'
import { BUILD_OS_ROADMAP_V2, ROADMAP_V2_SUMMARY } from '@/data/build-os-roadmap-v2'

// First epic of Phase 2 — used for idempotency check
const PHASE2_FIRST_EPIC_TITLE = BUILD_OS_ROADMAP_V2[0].title

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const internalSecret = request.headers.get('X-Buildos-Secret')
    const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

    let userId: string
    if (internalSecret && internalSecret === BUILDOS_SECRET) {
      // Internal call — use service role, no user context needed
      userId = 'system'
    } else {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const projectId = params.id

    // ── Project guard ────────────────────────────────────────────────────────
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, name, status')
      .eq('id', projectId)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.status === 'draft') {
      return NextResponse.json(
        { error: 'Project is still in draft. Complete onboarding before seeding Phase 2.' },
        { status: 422 }
      )
    }

    // ── Idempotency: check if Phase 2 already seeded ─────────────────────────
    const { data: existingPhase2 } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .eq('title', PHASE2_FIRST_EPIC_TITLE)
      .limit(1)

    if (existingPhase2 && existingPhase2.length > 0) {
      return NextResponse.json(
        { error: 'Phase 2 roadmap already seeded for this project', code: 'ALREADY_SEEDED' },
        { status: 409 }
      )
    }

    // ── Get current highest order_index to offset Phase 2 epics ─────────────
    const { data: existingEpics } = await admin
      .from('epics')
      .select('order_index')
      .eq('project_id', projectId)
      .order('order_index', { ascending: false })
      .limit(1)

    const baseOrderIndex = existingEpics && existingEpics.length > 0
      ? (existingEpics[0].order_index as number) + 1
      : 0

    // ── Seed loop ─────────────────────────────────────────────────────────────
    const seededEpics: Array<{ id: string; title: string; feature_count: number; task_count: number }> = []
    let totalTasksSeeded = 0
    let totalReadyMarked  = 0

    for (const epicDef of BUILD_OS_ROADMAP_V2) {
      // Insert epic — offset order_index by Phase 1 count
      const { data: epicRow, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id:  projectId,
          title:       epicDef.title,
          description: epicDef.description,
          status:      'pending',
          order_index: baseOrderIndex + epicDef.order_index,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        throw new Error(`Failed to insert Phase 2 epic "${epicDef.title}": ${epicErr?.message}`)
      }

      let epicTaskCount = 0

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
          throw new Error(`Failed to insert Phase 2 feature "${featDef.title}": ${featErr?.message}`)
        }

        // First feature of each epic → first task starts ready
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
          status:             (isFirstFeature && taskDef.order_index === 0) ? 'ready' : 'pending',
          context_payload:    {
            source:          'phase2_roadmap',
            epic_title:      epicDef.title,
            feature_title:   featDef.title,
            auto_dispatched: false,
            phase:           2,
          },
        }))

        const { error: taskErr } = await admin.from('tasks').insert(taskRows)
        if (taskErr) {
          throw new Error(`Failed to insert Phase 2 tasks for "${featDef.title}": ${taskErr.message}`)
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

    // ── Update cost model with Phase 2 additional estimate ────────────────────
    const phase2EstimatedTotal = ROADMAP_V2_SUMMARY.total_estimated_cost_usd

    const { data: existingModel } = await admin
      .from('cost_models')
      .select('id, estimated_total_usd')
      .eq('project_id', projectId)
      .single()

    if (existingModel) {
      await admin
        .from('cost_models')
        .update({
          estimated_total_usd: (existingModel.estimated_total_usd as number) + phase2EstimatedTotal,
        })
        .eq('id', existingModel.id)
    } else {
      await admin.from('cost_models').insert({
        project_id:          projectId,
        estimated_total_usd: phase2EstimatedTotal,
        total_cost_usd:      0,
        ai_cost_usd:         0,
        infra_cost_usd:      0,
        human_cost_usd:      0,
        other_cost_usd:      0,
      })
    }

    // ── Fire immediate tick to pick up new ready tasks ────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${request.headers.get('host')}`)
    const secret = BUILDOS_SECRET || ''

    fetch(`${appUrl}/api/orchestrate/tick?project_id=${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': secret },
      body: JSON.stringify({ triggered_by: 'phase2_seed_complete' }),
    }).catch(() => {})

    // ── Audit ─────────────────────────────────────────────────────────────────
    await writeAuditLog(admin, {
      event_type:    'project_status_changed',
      actor_user_id: userId,
      project_id:    projectId,
      resource_type: 'project',
      resource_id:   projectId,
      old_value:     { phase: 1 },
      new_value:     { phase: 2 },
      metadata: {
        event:              'phase2_roadmap_seeded',
        epics_seeded:       seededEpics.length,
        features_seeded:    ROADMAP_V2_SUMMARY.features,
        tasks_seeded:       totalTasksSeeded,
        ready_on_start:     totalReadyMarked,
        estimated_cost:     phase2EstimatedTotal,
        base_order_index:   baseOrderIndex,
      },
    })

    return NextResponse.json({
      data: {
        message:         'Build OS Phase 2 roadmap seeded. Autonomous build continues.',
        project_id:      projectId,
        phase:           2,
        epics_seeded:    seededEpics.length,
        features_seeded: ROADMAP_V2_SUMMARY.features,
        tasks_seeded:    totalTasksSeeded,
        tasks_ready:     totalReadyMarked,
        estimated_additional_cost_usd: phase2EstimatedTotal,
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
