/**
 * POST /api/projects/[id]/seed-ert-p5
 *
 * Seeds the Build OS ERT-P5 roadmap (Real Delivery & Failure Handling System).
 *
 * Creates: 1 epic, 7 features, 35 tasks across workstreams A–G.
 * First task in Workstream A (Feature 0) starts as 'ready'.
 * All other tasks start as 'pending'.
 * Idempotent: returns 409 if ERT-P5 epic already exists.
 *
 * Auth: admin user JWT or X-Buildos-Secret (for cron/internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/execution'
import { BUILD_OS_ROADMAP_ERT_P5, ROADMAP_ERT_P5_SUMMARY } from '@/data/build-os-roadmap-ert-p5'

const ERT_P5_EPIC_TITLE = BUILD_OS_ROADMAP_ERT_P5[0].title

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
      .eq('title', ERT_P5_EPIC_TITLE)
      .limit(1)

    if (existingEpic && existingEpic.length > 0) {
      return NextResponse.json(
        { error: 'ERT-P5 roadmap already seeded', code: 'ALREADY_SEEDED' },
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
      : 500

    // ── Seed loop ─────────────────────────────────────────────────────────────
    let totalTasksSeeded = 0
    let totalReadyMarked = 0
    const seededEpics = []

    for (const epicDef of BUILD_OS_ROADMAP_ERT_P5) {
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
        throw new Error(`Failed to insert ERT-P5 epic "${epicDef.title}": ${epicErr?.message}`)
      }

      let epicTaskCount = 0

      for (const featDef of epicDef.features) {
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
          throw new Error(`Failed to insert ERT-P5 feature "${featDef.title}": ${featErr?.message}`)
        }

        // First feature of the epic (order_index=0) → first task is ready
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
          context_payload: {
            source:          'ert_p5_roadmap',
            phase:           5,
            workstream:      String.fromCharCode(65 + featDef.order_index), // A, B, C, ...
            epic_title:      epicDef.title,
            feature_title:   featDef.title,
            auto_dispatched: false,
          },
        }))

        const { error: taskErr } = await admin.from('tasks').insert(taskRows)
        if (taskErr) {
          throw new Error(`Failed to insert ERT-P5 tasks for "${featDef.title}": ${taskErr.message}`)
        }

        totalReadyMarked  += taskRows.filter(t => t.status === 'ready').length
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

    // ── Fire orchestration tick ───────────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${request.headers.get('host')}`)
    const secret = BUILDOS_SECRET || ''

    fetch(`${appUrl}/api/orchestrate/tick?project_id=${projectId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Buildos-Secret': secret },
    }).catch(() => {}) // fire-and-forget

    return NextResponse.json({
      success:       true,
      phase:         5,
      project_id:    projectId,
      seeded_epics:  seededEpics,
      total_tasks:   totalTasksSeeded,
      ready_tasks:   totalReadyMarked,
      summary:       ROADMAP_ERT_P5_SUMMARY,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[seed-ert-p5] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
