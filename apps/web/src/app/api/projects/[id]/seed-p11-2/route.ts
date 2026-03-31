/**
 * POST /api/projects/[id]/seed-p11-2
 *
 * Seeds the Build OS P11.2 roadmap (Provider Connections Foundation).
 *
 * Creates: 1 epic, 7 features, 29 tasks across workstreams WS1–WS7.
 * First task in WS1 (Feature 0) starts as 'ready'.
 * All other tasks start as 'pending'.
 * Idempotent: returns 409 if P11.2 epic already exists.
 *
 * Auth: admin user JWT or X-Buildos-Secret (for internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { BUILD_OS_ROADMAP_P11_2, P11_2_EPIC_TITLE, ROADMAP_P11_2_SUMMARY } from '@/data/build-os-roadmap-p11-2'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const internalSecret = request.headers.get('X-Buildos-Secret') ?? request.headers.get('x-buildos-secret')
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

    // ── Idempotency ──────────────────────────────────────────────────────────
    const { data: existingEpic } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .eq('title', P11_2_EPIC_TITLE)
      .limit(1)

    if (existingEpic && existingEpic.length > 0) {
      return NextResponse.json(
        { error: 'P11.2 roadmap already seeded', code: 'ALREADY_SEEDED' },
        { status: 409 }
      )
    }

    // ── Find current highest order_index ─────────────────────────────────────
    const { data: existingEpics } = await admin
      .from('epics')
      .select('order_index')
      .eq('project_id', projectId)
      .order('order_index', { ascending: false })
      .limit(1)

    const baseOrderIndex = existingEpics && existingEpics.length > 0
      ? (existingEpics[0].order_index as number) + 100
      : 700

    // ── Seed epics, features, tasks ──────────────────────────────────────────
    let totalTasksSeeded = 0
    let totalFeaturesSeeded = 0
    const seededEpics: { id: string; title: string }[] = []

    for (const epicDef of BUILD_OS_ROADMAP_P11_2) {
      // Insert epic
      // Generate slug from title
      const epicSlug = epicDef.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)

      const { data: epicRow, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id: projectId,
          title: epicDef.title,
          description: epicDef.description,
          slug: epicSlug,
          status: 'pending',
          priority: 'high',
          order_index: baseOrderIndex + epicDef.order_index,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        console.error('[seed-p11-2] Failed to insert epic:', epicErr)
        return NextResponse.json(
          { error: 'Failed to insert epic', detail: epicErr?.message },
          { status: 500 }
        )
      }

      seededEpics.push({ id: epicRow.id, title: epicRow.title })

      let isFirstFeature = true

      for (const featDef of epicDef.features) {
        // Generate slug from feature title
        const featSlug = featDef.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80)

        // Insert feature
        const { data: featRow, error: featErr } = await admin
          .from('features')
          .insert({
            epic_id: epicRow.id,
            project_id: projectId,
            title: featDef.title,
            description: featDef.description,
            slug: featSlug,
            status: 'pending',
            priority: featDef.priority,
            order_index: featDef.order_index,
            acceptance_criteria: [],
          })
          .select('id')
          .single()

        if (featErr || !featRow) {
          console.error('[seed-p11-2] Failed to insert feature:', featErr)
          return NextResponse.json(
            { error: 'Failed to insert feature', detail: featErr?.message },
            { status: 500 }
          )
        }

        totalFeaturesSeeded++

        // Build task rows
        const taskRows = featDef.tasks.map((taskDef) => {
          const taskSlug = taskDef.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) + '-' + Math.random().toString(36).slice(2, 6)
          return taskSlug
        }).map((slug, idx) => {
          const taskDef = featDef.tasks[idx]
          return {
          feature_id: featRow.id,
          project_id: projectId,
          title: taskDef.title,
          description: taskDef.description,
          slug,
          agent_role: taskDef.agent_role,
          task_type: taskDef.task_type,
          priority: taskDef.priority,
          order_index: taskDef.order_index,
          estimated_cost_usd: taskDef.estimated_cost_usd,
          max_retries: (taskDef as any).max_retries ?? 3,
          // First task of first workstream starts as 'ready'
          status: (isFirstFeature && taskDef.order_index === 0) ? 'ready' : 'pending',
          context_payload: {
            source: 'p11_2_roadmap',
            phase: '11.2',
            workstream: `WS${featDef.order_index + 1}`,
            epic_title: epicDef.title,
            feature_title: featDef.title,
            auto_dispatched: false,
          },
        }})

        // Insert tasks
        const { error: tasksErr } = await admin
          .from('tasks')
          .insert(taskRows)

        if (tasksErr) {
          console.error('[seed-p11-2] Failed to insert tasks:', tasksErr)
          return NextResponse.json(
            { error: 'Failed to insert tasks', detail: tasksErr.message },
            { status: 500 }
          )
        }

        totalTasksSeeded += taskRows.length
        isFirstFeature = false
      }
    }

    console.log(`[seed-p11-2] Seeded ${totalTasksSeeded} tasks for project ${projectId}`)

    return NextResponse.json({
      success: true,
      project_id: projectId,
      epics: seededEpics,
      summary: {
        ...ROADMAP_P11_2_SUMMARY,
        tasks_seeded: totalTasksSeeded,
        features_seeded: totalFeaturesSeeded,
        base_order_index: baseOrderIndex,
      },
      first_task_status: 'ready',
      message: `P11.2 Provider Connections Foundation roadmap seeded successfully.`,
    })

  } catch (err) {
    console.error('[seed-p11-2] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
