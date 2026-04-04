/**
 * POST /api/builds/trigger
 *
 * Phase 3 — Build Trigger → Bootstrap Handoff
 * --------------------------------------------
 * Connects the wizard/product layer to BuildOS core provisioning.
 *
 * Flow:
 *   1. Auth (X-Buildos-Secret or Supabase JWT)
 *   2. Validate: blueprint exists, ready_for_build, no active build
 *   3. Generate build_id, log build_triggered to bootstrap_log
 *   4. Set project.status = 'blueprint', bootstrap_status = 'awaiting_bootstrap'
 *   5. Call existing POST /api/bootstrap/project (GitHub + Vercel provisioning)
 *   6. On success: set project.status = 'in_progress'
 *   7. Verify: blueprint + tasks still intact
 *   8. Return full proof payload
 *
 * State chain:
 *   project.status:   draft → blueprint → in_progress
 *   bootstrap_status: not_started → awaiting_bootstrap → [bootstrapping] → ready_for_architect
 *
 * NO agent dispatch. NO code execution. Data + infra handoff ONLY.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

// ─── Active bootstrap states (block re-trigger) ───────────────────────────────
const ACTIVE_BOOTSTRAP_STATES = new Set([
  'init', 'github_done', 'vercel_ready', 'linking', 'bootstrapping', 'awaiting_bootstrap',
])

// ─── Log helper ───────────────────────────────────────────────────────────────

async function writeLog(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  projectId: string,
  step: string,
  status: 'started' | 'completed' | 'failed',
  detail?: string,
) {
  try {
    await admin.from('bootstrap_log').insert({
      project_id: projectId,
      step,
      status,
      detail: detail ?? null,
    })
  } catch {
    // Non-fatal
  }
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function resolveAuth(req: NextRequest): Promise<{ userId: string | null; isInternal: boolean }> {
  const secret = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''
  const header = req.headers.get('X-Buildos-Secret') || ''
  if (secret && header === secret) {
    return { userId: null, isInternal: true }
  }
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { userId: user?.id ?? null, isInternal: false }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleTrigger(req: NextRequest): Promise<NextResponse> {
  const { isInternal, userId } = await resolveAuth(req)
  if (!isInternal && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { project_id, blueprint_id } = body as { project_id?: string; blueprint_id?: string }

  if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  if (!blueprint_id) return NextResponse.json({ error: 'blueprint_id is required' }, { status: 400 })

  const admin = createAdminSupabaseClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://web-lake-one-88.vercel.app'
  const secret = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

  // ── 1. Load and validate project ─────────────────────────────────────────
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('id, name, status, bootstrap_status, project_type')
    .eq('id', project_id)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: `Project not found: ${project_id}` }, { status: 404 })
  }

  // Block if already bootstrapped
  if (project.bootstrap_status === 'ready_for_architect') {
    return NextResponse.json({
      error: 'Project is already bootstrapped',
      bootstrap_status: project.bootstrap_status,
      project_id,
    }, { status: 409 })
  }

  // Block if bootstrap is in active state (prevent double-trigger)
  if (ACTIVE_BOOTSTRAP_STATES.has(project.bootstrap_status ?? '')) {
    return NextResponse.json({
      error: `Bootstrap already in progress: ${project.bootstrap_status}`,
      bootstrap_status: project.bootstrap_status,
      project_id,
    }, { status: 409 })
  }

  // ── 2. Load and validate blueprint ───────────────────────────────────────
  const { data: blueprint, error: bpErr } = await admin
    .from('blueprints')
    .select('id, project_id, status, version, feature_list, generated_by_agent')
    .eq('id', blueprint_id)
    .single()

  if (bpErr || !blueprint) {
    return NextResponse.json({ error: `Blueprint not found: ${blueprint_id}` }, { status: 404 })
  }

  if (blueprint.project_id !== project_id) {
    return NextResponse.json({
      error: 'Blueprint does not belong to this project',
      blueprint_project_id: blueprint.project_id,
      given_project_id: project_id,
    }, { status: 422 })
  }

  if (!['draft', 'accepted'].includes(blueprint.status)) {
    return NextResponse.json({
      error: `Blueprint status '${blueprint.status}' is not triggerable (need draft or accepted)`,
    }, { status: 422 })
  }

  // ── 3. Count tasks BEFORE bootstrap (preservation proof) ─────────────────
  const { count: tasksBefore } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id)

  const { count: epicsBefore } = await admin
    .from('epics')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id)

  // ── 4. Generate build_id, log trigger ────────────────────────────────────
  const buildId = crypto.randomUUID()

  await writeLog(admin, project_id, 'build_triggered', 'started', JSON.stringify({
    build_id: buildId,
    blueprint_id,
    blueprint_version: blueprint.version,
    triggered_by: userId ?? 'internal',
    triggered_at: new Date().toISOString(),
  }))

  // ── 5. Transition project state ───────────────────────────────────────────
  await admin
    .from('projects')
    .update({
      status: 'blueprint',             // valid: draft/blueprint/planning/in_progress...
      bootstrap_status: 'awaiting_bootstrap',
    })
    .eq('id', project_id)

  // ── 6. Call bootstrap engine ──────────────────────────────────────────────
  console.log(`[TRIGGER] build_id=${buildId} — calling bootstrap for project ${project_id}`)

  let bootstrapResult: Record<string, unknown> = {}
  let bootstrapSuccess = false

  try {
    const bootstrapResp = await fetch(`${baseUrl}/api/bootstrap/project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Buildos-Secret': secret,
      },
      body: JSON.stringify({ project_id }),
    })

    bootstrapResult = (await bootstrapResp.json()) as Record<string, unknown>
    bootstrapSuccess = bootstrapResp.ok && bootstrapResult.success === true

    if (!bootstrapSuccess) {
      console.error(`[TRIGGER] Bootstrap failed for ${project_id}:`, bootstrapResult.error)
      await writeLog(admin, project_id, 'bootstrap_call', 'failed',
        `HTTP ${bootstrapResp.status}: ${bootstrapResult.error ?? 'unknown'}`)
    }
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    console.error(`[TRIGGER] Bootstrap fetch threw:`, msg)
    bootstrapResult = { error: msg, success: false }
    await writeLog(admin, project_id, 'bootstrap_call', 'failed', msg)
  }

  // ── 7. Update project.status based on bootstrap outcome ──────────────────
  if (bootstrapSuccess) {
    await admin
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', project_id)

    await writeLog(admin, project_id, 'build_completed', 'completed', JSON.stringify({
      build_id: buildId,
      github: bootstrapResult.github,
      vercel: bootstrapResult.vercel,
    }))
  } else {
    // Leave project in 'blueprint' status — bootstrap_status is 'failed' from bootstrap route
    await writeLog(admin, project_id, 'build_completed', 'failed', String(bootstrapResult.error ?? 'bootstrap failed'))
  }

  // ── 8. Count tasks AFTER bootstrap (verify no loss) ───────────────────────
  const { count: tasksAfter } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id)

  const { count: epicsAfter } = await admin
    .from('epics')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project_id)

  // ── 9. Re-read final project state ────────────────────────────────────────
  const { data: finalProject } = await admin
    .from('projects')
    .select('id, name, status, bootstrap_status')
    .eq('id', project_id)
    .single()

  // ── 10. Return proof payload ───────────────────────────────────────────────
  const buildStatus = bootstrapSuccess ? 'complete' : 'failed'

  return NextResponse.json({
    build_id: buildId,
    build_status: buildStatus,
    project_id,
    blueprint_id,
    project: {
      id: finalProject?.id ?? project_id,
      name: finalProject?.name ?? project.name,
      status: finalProject?.status ?? (bootstrapSuccess ? 'in_progress' : 'blueprint'),
      bootstrap_status: finalProject?.bootstrap_status ?? (bootstrapSuccess ? 'ready_for_architect' : 'failed'),
    },
    bootstrap: bootstrapResult,
    preservation: {
      tasks_before: tasksBefore ?? 0,
      tasks_after: tasksAfter ?? 0,
      tasks_intact: (tasksBefore ?? 0) === (tasksAfter ?? 0),
      epics_before: epicsBefore ?? 0,
      epics_after: epicsAfter ?? 0,
      epics_intact: (epicsBefore ?? 0) === (epicsAfter ?? 0),
      blueprint_id,
      blueprint_version: blueprint.version,
    },
  }, { status: bootstrapSuccess ? 200 : 500 })
}

// ─── Route export ─────────────────────────────────────────────────────────────

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    return await handleTrigger(req)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[builds/trigger]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
