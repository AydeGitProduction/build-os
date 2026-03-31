/**
 * POST /api/projects/[id]/seed-p11-6
 *
 * Seeds Build OS P11.6 — Integration Test Harness + CNV Promotion.
 *
 * MODE: DEVELOPER-FIRST | NO NEW FEATURES | REAL RUNTIME PROOF | BACKFILL + PROMOTION
 *
 * Creates: 1 epic, 7 features, 25 tasks across workstreams WS1–WS7.
 * Idempotent: returns 409 if P11.6 epic already exists.
 *
 * Auth: admin user JWT or X-Buildos-Secret (for internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { BUILD_OS_ROADMAP_P11_6, P11_6_EPIC_TITLE, ROADMAP_P11_6_SUMMARY } from '@/data/build-os-roadmap-p11-6'

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
      .eq('title', P11_6_EPIC_TITLE)
      .limit(1)

    if (existingEpic && existingEpic.length > 0) {
      return NextResponse.json(
        { error: 'P11.6 roadmap already seeded', code: 'ALREADY_SEEDED' },
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
      : 0

    let totalTasksSeeded = 0
    let totalFeaturesSeeded = 0
    const seededEpics: Array<{ id: string; title: string }> = []

    for (const epicDef of BUILD_OS_ROADMAP_P11_6) {
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
          status: epicDef.status || 'active',
          order_index: baseOrderIndex,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        return NextResponse.json(
          { error: 'Failed to insert epic', detail: epicErr?.message },
          { status: 500 }
        )
      }

      seededEpics.push({ id: epicRow.id, title: epicRow.title })

      let isFirstFeature = true

      for (let featIdx = 0; featIdx < epicDef.features.length; featIdx++) {
        const featDef = epicDef.features[featIdx]

        const featSlug = featDef.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80)

        const { data: featRow, error: featErr } = await admin
          .from('features')
          .insert({
            epic_id: epicRow.id,
            project_id: projectId,
            title: featDef.title,
            description: featDef.description,
            slug: featSlug,
            status: 'pending',
            priority: (featDef as any).priority || 'high',
            order_index: featIdx,
            acceptance_criteria: [],
          })
          .select('id')
          .single()

        if (featErr || !featRow) {
          return NextResponse.json(
            { error: 'Failed to insert feature', detail: featErr?.message },
            { status: 500 }
          )
        }

        totalFeaturesSeeded++

        const taskRows = featDef.tasks.map((taskDef: any, idx: number) => {
          const taskSlug = taskDef.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) + '-' + Math.random().toString(36).slice(2, 6)

          return {
            feature_id: featRow.id,
            project_id: projectId,
            title: taskDef.title,
            description: taskDef.description,
            slug: taskSlug,
            agent_role: taskDef.role || 'backend_engineer',
            task_type: taskDef.task_type || 'integration_test',
            priority: taskDef.priority || 'high',
            order_index: idx,
            estimated_cost_usd: taskDef.estimated_cost_usd ?? 0.05,
            max_retries: taskDef.max_retries ?? 3,
            status: (isFirstFeature && idx === 0) ? 'ready' : 'pending',
            context_payload: {
              source: 'p11_6_integration_test',
              phase: '11.6',
              workstream: featDef.workstream || `WS${featIdx + 1}`,
              epic_title: epicDef.title,
              feature_title: featDef.title,
              integration_test: true,
              cnv_promotion: true,
              auto_dispatched: false,
            },
          }
        })

        const { error: tasksErr } = await admin
          .from('tasks')
          .insert(taskRows)

        if (tasksErr) {
          return NextResponse.json(
            { error: 'Failed to insert tasks', detail: tasksErr.message },
            { status: 500 }
          )
        }

        totalTasksSeeded += taskRows.length
        isFirstFeature = false
      }
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      epics: seededEpics,
      summary: {
        ...ROADMAP_P11_6_SUMMARY,
        tasks_seeded: totalTasksSeeded,
        features_seeded: totalFeaturesSeeded,
        base_order_index: baseOrderIndex,
        scope: 'Integration test harness + CNV promotion across 877 tasks',
      },
      first_task_status: 'ready',
      message: 'P11.6 Integration Test Harness + CNV Promotion seeded successfully.',
    })

  } catch (err) {
    console.error('[seed-p11-6] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
