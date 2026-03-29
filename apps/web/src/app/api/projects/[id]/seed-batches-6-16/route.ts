/**
 * POST /api/projects/[id]/seed-batches-6-16
 *
 * Seeds Build OS Batches 6–12 + IRIS (Batch 16) into a project.
 * Creates: 8 epics, 24 features, ~45 tasks — all with full task contracts.
 *
 * Idempotent: returns 409 if first epic ("Deployment & Real Output") already exists.
 * Auth: X-Buildos-Secret (internal) or user JWT.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { BATCHES_6_16, BATCHES_6_16_SUMMARY } from '@/data/build-os-batches-6-16'

const FIRST_EPIC_TITLE = BATCHES_6_16[0].title // "Deployment & Real Output"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()
  const projectId = params.id

  // ── Auth ────────────────────────────────────────────────────────────────────
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

  let userId: string
  if (internalSecret && internalSecret === BUILDOS_SECRET) {
    userId = 'system'
  } else {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  }

  // ── Check if tasks already seeded (idempotency) ─────────────────────────────
  const { data: existingEpic } = await admin
    .from('epics')
    .select('id')
    .eq('project_id', projectId)
    .eq('title', FIRST_EPIC_TITLE)
    .maybeSingle()

  // Check request body for force flag
  const body = await request.json().catch(() => ({}))
  const forceTasksOnly = body?.tasks_only === true

  // If epic exists and not forcing tasks-only mode, check if tasks exist
  if (existingEpic && !forceTasksOnly) {
    const { count } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .contains('context_payload', { source: 'batch_seed_6_16' })

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Batches 6–16 already fully seeded (${count} tasks exist)` },
        { status: 409 }
      )
    }
    // Epics/features exist but tasks missing — seed tasks only
  }

  // ── Project guard ───────────────────────────────────────────────────────────
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('id, name, status')
    .eq('id', projectId)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const results = {
    epics_created: 0,
    features_created: 0,
    tasks_created: 0,
    errors: [] as string[],
  }

  // ── Seed each epic ──────────────────────────────────────────────────────────
  for (const epicDef of BATCHES_6_16) {
    // Look up or create epic
    let epicId: string

    const { data: existingEpicRow } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .eq('title', epicDef.title)
      .maybeSingle()

    if (existingEpicRow) {
      epicId = existingEpicRow.id
      // Epic already exists — skip creation
    } else {
      const { data: epic, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id: projectId,
          title: epicDef.title,
          description: epicDef.description,
          status: 'in_progress',
          order_index: epicDef.order_index,
        })
        .select('id')
        .single()

      if (epicErr || !epic) {
        results.errors.push(`Epic "${epicDef.title}": ${epicErr?.message || 'unknown error'}`)
        continue
      }
      epicId = epic.id
      results.epics_created++
    }

    // Create features for this epic
    for (let fi = 0; fi < epicDef.features.length; fi++) {
      const featureDef = epicDef.features[fi]

      // Look up or create feature
      let featureId: string

      const { data: existingFeatureRow } = await admin
        .from('features')
        .select('id')
        .eq('project_id', projectId)
        .eq('title', featureDef.title)
        .maybeSingle()

      if (existingFeatureRow) {
        featureId = existingFeatureRow.id
      } else {
        const { data: feature, error: featureErr } = await admin
          .from('features')
          .insert({
            project_id: projectId,
            epic_id: epicId,
            title: featureDef.title,
            description: featureDef.description,
            status: 'in_progress',
            order_index: fi + 1,
          })
          .select('id')
          .single()

        if (featureErr || !feature) {
          results.errors.push(`Feature "${featureDef.title}": ${featureErr?.message || 'unknown error'}`)
          continue
        }
        featureId = feature.id
        results.features_created++
      }

      // Create tasks for this feature
      for (let ti = 0; ti < featureDef.tasks.length; ti++) {
        const taskDef = featureDef.tasks[ti]

        const { error: taskErr } = await admin
          .from('tasks')
          .insert({
            project_id: projectId,
            feature_id: featureId,
            title: taskDef.title,
            description: taskDef.description,
            task_type: taskDef.task_type,
            priority: taskDef.priority,
            agent_role: taskDef.assigned_to,
            status: 'ready',
            order_index: ti + 1,
            context_payload: {
              source: 'batch_seed_6_16',
              feature_title: featureDef.title,
              epic_title: epicDef.title,
            },
          })

        if (taskErr) {
          results.errors.push(`Task "${taskDef.title}": ${taskErr.message}`)
        } else {
          results.tasks_created++
        }
      }
    }
  }

  // ── Update project status to in_progress if it was ready_for_release ───────
  if (project.status === 'ready_for_release') {
    await admin
      .from('projects')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', projectId)
  }

  return NextResponse.json({
    success: true,
    project_id: projectId,
    seeded_by: userId,
    ...results,
    summary: BATCHES_6_16_SUMMARY,
    message: `Seeded ${results.epics_created} epics, ${results.features_created} features, ${results.tasks_created} tasks`,
  }, { status: 201 })
}

/**
 * GET /api/projects/[id]/seed-batches-6-16
 * Returns seed status — whether this batch has been seeded yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()
  const internalSecret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET

  let authorized = false
  if (internalSecret && internalSecret === BUILDOS_SECRET) {
    authorized = true
  } else {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) authorized = true
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: existing } = await admin
    .from('epics')
    .select('id, title')
    .eq('project_id', params.id)
    .eq('title', FIRST_EPIC_TITLE)
    .maybeSingle()

  return NextResponse.json({
    seeded: !!existing,
    first_epic_title: FIRST_EPIC_TITLE,
    summary: BATCHES_6_16_SUMMARY,
  })
}
