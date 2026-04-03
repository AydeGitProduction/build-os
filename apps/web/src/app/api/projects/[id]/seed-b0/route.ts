/**
 * POST /api/projects/[id]/seed-b0
 *
 * Seeds the B0 Bootstrap Engine Rebuild roadmap.
 *
 * MANDATE: Fix project creation so EVERY project is correctly created,
 * linked, and ready BEFORE any tasks run.
 *
 * Creates: 1 epic, 7 features, 21 tasks across workstreams WS1–WS7.
 * WS1-T1 (migration) starts as 'ready'. All other tasks start as 'pending'.
 * Idempotent: returns 409 if B0 epic already exists.
 *
 * Auth: X-Buildos-Secret header (internal) OR admin user JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { BUILD_OS_ROADMAP_B0, B0_EPIC_TITLE, ROADMAP_B0_SUMMARY } from '@/data/build-os-roadmap-b0'

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
      .eq('title', B0_EPIC_TITLE)
      .limit(1)

    if (existingEpic && existingEpic.length > 0) {
      return NextResponse.json(
        { error: 'B0 roadmap already seeded', code: 'ALREADY_SEEDED' },
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
      : 800

    // ── Seed epics, features, tasks ──────────────────────────────────────────
    let totalTasksSeeded = 0
    let totalFeaturesSeeded = 0
    const seededEpics: { id: string; title: string }[] = []
    const firstReadyTask: { id: string; title: string } | null = null
    let ws1FirstTaskId: string | null = null

    for (const epicDef of BUILD_OS_ROADMAP_B0) {
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
          priority: 'critical',
          order_index: baseOrderIndex + epicDef.order_index,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        console.error('[seed-b0] Failed to insert epic:', epicErr)
        return NextResponse.json(
          { error: 'Failed to insert epic', detail: epicErr?.message },
          { status: 500 }
        )
      }

      seededEpics.push({ id: epicRow.id, title: epicRow.title })

      let isFirstFeature = true

      for (const featDef of epicDef.features) {
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
            priority: featDef.priority,
            order_index: featDef.order_index,
            acceptance_criteria: [],
          })
          .select('id')
          .single()

        if (featErr || !featRow) {
          console.error('[seed-b0] Failed to insert feature:', featErr)
          return NextResponse.json(
            { error: 'Failed to insert feature', detail: featErr?.message },
            { status: 500 }
          )
        }

        totalFeaturesSeeded++

        const taskRows = featDef.tasks.map((taskDef, idx) => {
          const taskSlug = taskDef.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) + '-' + Math.random().toString(36).slice(2, 6)

          // Only WS1-T1 (first task of first feature, order_index=0) starts as ready
          const isFirstTask = isFirstFeature && taskDef.order_index === 0

          return {
            feature_id: featRow.id,
            project_id: projectId,
            title: taskDef.title,
            description: taskDef.description,
            slug: taskSlug,
            agent_role: taskDef.agent_role,
            task_type: taskDef.task_type,
            priority: taskDef.priority,
            order_index: taskDef.order_index,
            max_retries: 3,
            status: isFirstTask ? 'ready' : 'pending',
            context_payload: {
              source:        'b0_bootstrap_engine_rebuild',
              phase:         'B0',
              workstream:    `WS${featDef.order_index + 1}`,
              epic_title:    epicDef.title,
              feature_title: featDef.title,
              mandate:       'Wizard → Project → GitHub Repo → Vercel Project → Linking → READY',
              rule:          'NO task dispatch before bootstrap_status = ready',
              seeded_by:     userId,
              seeded_at:     new Date().toISOString(),
            },
          }
        })

        const { data: insertedTasks, error: tasksErr } = await admin
          .from('tasks')
          .insert(taskRows)
          .select('id, title, status')

        if (tasksErr) {
          console.error('[seed-b0] Failed to insert tasks:', tasksErr)
          return NextResponse.json(
            { error: 'Failed to insert tasks', detail: tasksErr.message },
            { status: 500 }
          )
        }

        // Track first ready task (WS1-T1 migration)
        if (isFirstFeature && insertedTasks) {
          const firstTask = insertedTasks.find(t => t.status === 'ready')
          if (firstTask && !ws1FirstTaskId) {
            ws1FirstTaskId = firstTask.id
          }
        }

        totalTasksSeeded += taskRows.length
        isFirstFeature = false
      }
    }

    console.log(`[seed-b0] Seeded ${totalTasksSeeded} tasks for project ${projectId}. First ready: ${ws1FirstTaskId}`)

    return NextResponse.json({
      success:          true,
      project_id:       projectId,
      epics:            seededEpics,
      first_ready_task: ws1FirstTaskId,
      summary: {
        ...ROADMAP_B0_SUMMARY,
        tasks_seeded:    totalTasksSeeded,
        features_seeded: totalFeaturesSeeded,
        base_order_index: baseOrderIndex,
      },
      mandate:  'Wizard → Project → GitHub Repo → Vercel Project → Linking → READY',
      message:  'B0 Bootstrap Engine Rebuild roadmap seeded. WS1-T1 (migration 033) is ready to dispatch.',
      next_step: 'Paste MIGRATE-B0-033.sql in Supabase SQL Editor AFTER WS1-T1 runs and produces the SQL file.',
    })

  } catch (err) {
    console.error('[seed-b0] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
