/**
 * POST /api/projects/[id]/seed-p9b-integration-v3
 *
 * Seeds the P9B-INTEGRATION v3 — Real Wizard State roadmap.
 *
 * Creates: 1 epic, 6 features, 19 tasks across workstreams I1–I6.
 * First task in each feature that has status:'ready' starts as 'ready'.
 * All other tasks start as 'pending'.
 * Idempotent: returns 409 if P9B-INTEGRATION v3 epic already exists.
 *
 * Auth: admin user JWT or X-Buildos-Secret (for internal calls)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { BUILD_OS_ROADMAP_P9B_INTEGRATION_V3, ROADMAP_P9B_INTEGRATION_V3_SUMMARY } from '@/data/build-os-roadmap-p9b-integration-v3'

const P9B_INT_V3_EPIC_TITLE = BUILD_OS_ROADMAP_P9B_INTEGRATION_V3[0].title

function makeSlug(title: string): string {
  return title.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60)
    + '-' + Math.random().toString(36).slice(2, 10)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = createAdminSupabaseClient()

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Project guard ─────────────────────────────────────────────────────────
    const { data: project, error: projErr } = await admin
      .from('projects')
      .select('id, name, status')
      .eq('id', projectId)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // ── Idempotency ───────────────────────────────────────────────────────────
    const { data: existingEpic } = await admin
      .from('epics')
      .select('id')
      .eq('project_id', projectId)
      .eq('title', P9B_INT_V3_EPIC_TITLE)
      .limit(1)

    if (existingEpic && existingEpic.length > 0) {
      return NextResponse.json(
        { error: 'P9B-INTEGRATION v3 roadmap already seeded', code: 'ALREADY_SEEDED' },
        { status: 409 }
      )
    }

    // ── Find current highest order_index ──────────────────────────────────────
    const { data: existingEpics } = await admin
      .from('epics')
      .select('order_index')
      .eq('project_id', projectId)
      .order('order_index', { ascending: false })
      .limit(1)

    const baseOrderIndex = existingEpics && existingEpics.length > 0
      ? (existingEpics[0].order_index as number) + 100
      : 600

    // ── Seed loop ─────────────────────────────────────────────────────────────
    let totalTasksSeeded = 0
    let totalReadyMarked = 0
    const seededEpics = []

    for (const epicDef of BUILD_OS_ROADMAP_P9B_INTEGRATION_V3) {
      const { data: epicRow, error: epicErr } = await admin
        .from('epics')
        .insert({
          project_id:  projectId,
          title:       epicDef.title,
          slug:        makeSlug(epicDef.title),
          description: epicDef.description,
          status:      'pending',
          order_index: baseOrderIndex + epicDef.order_index,
        })
        .select('id, title')
        .single()

      if (epicErr || !epicRow) {
        throw new Error(`Failed to insert epic "${epicDef.title}": ${epicErr?.message}`)
      }

      let epicTaskCount = 0

      for (const featDef of epicDef.features) {
        const { data: featRow, error: featErr } = await admin
          .from('features')
          .insert({
            epic_id:     epicRow.id,
            project_id:  projectId,
            title:       featDef.title,
            slug:        makeSlug(featDef.title),
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

        const taskRows = featDef.tasks.map(taskDef => ({
          feature_id:         featRow.id,
          project_id:         projectId,
          title:              taskDef.title,
          slug:               makeSlug(taskDef.title),
          description:        taskDef.description,
          agent_role:         taskDef.agent_role,
          task_type:          taskDef.task_type,
          priority:           taskDef.priority,
          order_index:        taskDef.order_index,
          estimated_cost_usd: taskDef.estimated_cost_usd,
          status:             taskDef.status === 'ready' ? 'ready' : 'pending',
          context_payload: {
            source:        'p9b_integration_v3',
            phase:         'p9b_int_v3',
            workstream:    featDef.title.split(' ')[0], // 'I1', 'I2', etc.
            epic_title:    epicDef.title,
            feature_title: featDef.title,
            seeded_by:     userId,
          },
        }))

        const { error: taskErr } = await admin.from('tasks').insert(taskRows)
        if (taskErr) {
          throw new Error(`Failed to insert tasks for "${featDef.title}": ${taskErr.message}`)
        }

        totalReadyMarked += taskRows.filter(t => t.status === 'ready').length
        totalTasksSeeded += taskRows.length
        epicTaskCount    += taskRows.length
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
      phase:         'p9b_integration_v3',
      project_id:    projectId,
      seeded_epics:  seededEpics,
      total_tasks:   totalTasksSeeded,
      ready_tasks:   totalReadyMarked,
      summary:       ROADMAP_P9B_INTEGRATION_V3_SUMMARY,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[seed-p9b-integration-v3] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
