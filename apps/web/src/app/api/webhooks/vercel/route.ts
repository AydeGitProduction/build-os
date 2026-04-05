/**
 * POST /api/webhooks/vercel — Phase 7.7 WS5
 *
 * Receives Vercel deployment lifecycle webhooks and maps them into
 * BuildOS project/task truth (project health state + task status).
 *
 * Vercel sends: deployment.created, deployment.ready, deployment.error,
 *               deployment.canceled, deployment.check-rerequested
 *
 * Mapping:
 *   deployment.ready   → project health: healthy    (build succeeded)
 *   deployment.error   → project health: build_unhealthy (build failed)
 *   deployment.canceled → no change (neutral)
 *
 * Security: validates X-Vercel-Signature header using VERCEL_WEBHOOK_SECRET.
 * If secret is not configured, the endpoint logs a warning but processes
 * the event (to avoid breaking builds when secret hasn't been set yet).
 *
 * Configuration required in Vercel dashboard:
 *   → Project Settings → Git → Deploy Hooks & Webhooks
 *   → Add webhook: https://<your-domain>/api/webhooks/vercel
 *   → Events: deployment.ready, deployment.error
 *   → Add secret → set VERCEL_WEBHOOK_SECRET in Vercel env vars
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { applyVercelDeployResult } from '@/lib/project-health'
import { createHmac } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Vercel webhook payload types (subset we care about)
// ─────────────────────────────────────────────────────────────────────────────

interface VercelDeploymentWebhook {
  type: string
  id: string
  createdAt: number
  payload: {
    deployment?: {
      id: string
      url: string
      name: string
      meta?: {
        githubCommitSha?: string
        githubRepoOwner?: string
        githubRepoName?: string
      }
    }
    projectId?: string
    /** Vercel deployment state: BUILDING | READY | ERROR | CANCELED */
    readyState?: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED'
    links?: {
      deployment?: string
      project?: string
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the X-Vercel-Signature header using HMAC-SHA1.
 * Returns true if valid or if secret is not configured.
 */
function validateVercelSignature(
  rawBody: string,
  signatureHeader: string | null,
): { valid: boolean; reason?: string } {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[vercel-webhook] VERCEL_WEBHOOK_SECRET not set — skipping signature validation')
    return { valid: true }
  }

  if (!signatureHeader) {
    return { valid: false, reason: 'Missing X-Vercel-Signature header' }
  }

  const hmac = createHmac('sha1', secret)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')

  if (expected !== signatureHeader) {
    return { valid: false, reason: 'Signature mismatch — request may be forged' }
  }

  return { valid: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve BuildOS project_id from Vercel projectId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up the BuildOS project_id corresponding to a Vercel project.
 * We match via project_integrations.environment_map.vercel_project_id
 * or deployment_targets.target_config.vercel_project_id.
 */
async function resolveProjectId(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  vercelProjectId: string,
): Promise<string | null> {
  if (!vercelProjectId) return null

  try {
    // Check project_integrations first
    const { data: integrations } = await admin
      .from('project_integrations')
      .select('project_id, environment_map')
      .eq('status', 'active')

    for (const row of integrations ?? []) {
      const envMap = row.environment_map as Record<string, unknown> | null
      if (
        envMap?.vercel_project_id === vercelProjectId ||
        (envMap?.vercel_project_url as string)?.includes(vercelProjectId)
      ) {
        return row.project_id as string
      }
    }

    // Check deployment_targets
    const { data: targets } = await admin
      .from('deployment_targets')
      .select('project_id, target_config')
      .eq('provider', 'vercel')

    for (const row of targets ?? []) {
      const cfg = row.target_config as Record<string, unknown> | null
      if (cfg?.vercel_project_id === vercelProjectId) {
        return row.project_id as string
      }
    }
  } catch (err) {
    console.warn('[vercel-webhook] resolveProjectId error:', err)
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Find the task responsible for this commit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to find the BuildOS task_id that produced a given commit SHA.
 * Looks in commit_delivery_logs by commit_sha.
 */
async function resolveResponsibleTask(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  projectId: string,
  commitSha: string | null | undefined,
): Promise<string | null> {
  if (!commitSha) return null
  try {
    const { data } = await admin
      .from('commit_delivery_logs')
      .select('task_id')
      .eq('project_id', projectId)
      .eq('commit_sha', commitSha)
      .limit(1)
      .maybeSingle()
    return (data?.task_id as string) ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Read raw body for signature validation (must be done before .json())
  const rawBody = await request.text()
  const signature = request.headers.get('x-vercel-signature')

  // WS5: Validate signature
  const { valid, reason: sigReason } = validateVercelSignature(rawBody, signature)
  if (!valid) {
    console.error('[vercel-webhook] Signature validation failed:', sigReason)
    return NextResponse.json({ error: sigReason ?? 'Invalid signature' }, { status: 401 })
  }

  let event: VercelDeploymentWebhook
  try {
    event = JSON.parse(rawBody) as VercelDeploymentWebhook
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, payload } = event

  console.log(`[vercel-webhook] Received event: type=${type} deploymentId=${payload?.deployment?.id ?? 'unknown'} readyState=${payload?.readyState ?? 'unknown'}`)

  // Only handle deployment events we care about
  if (!type.startsWith('deployment')) {
    return NextResponse.json({ processed: false, reason: `Event type '${type}' not handled` })
  }

  const admin = createAdminSupabaseClient()

  // WS5: Resolve BuildOS project from Vercel project ID
  const vercelProjectId = payload?.projectId
  let buildOsProjectId: string | null = vercelProjectId
    ? await resolveProjectId(admin, vercelProjectId)
    : null

  if (!buildOsProjectId) {
    console.warn(`[vercel-webhook] Could not resolve BuildOS project for Vercel project '${vercelProjectId}' — health state not updated`)
    // Still return 200 so Vercel doesn't retry unnecessarily
    return NextResponse.json({ processed: false, reason: 'BuildOS project not found for Vercel project' })
  }

  // Commit SHA for task attribution
  const commitSha = payload?.deployment?.meta?.githubCommitSha ?? null
  const deployState = payload?.readyState

  // WS5: Map deployment state → project health
  if (type === 'deployment.ready' || deployState === 'READY') {
    const responsibleTask = await resolveResponsibleTask(admin, buildOsProjectId, commitSha)
    await applyVercelDeployResult(admin, buildOsProjectId, {
      triggered: true,
      deployState: 'READY',
      commitSha,
      taskId: responsibleTask,
    })
    console.log(`[vercel-webhook] WS5: deployment.ready → project ${buildOsProjectId} health=healthy`)
  } else if (type === 'deployment.error' || deployState === 'ERROR') {
    const responsibleTask = await resolveResponsibleTask(admin, buildOsProjectId, commitSha)
    await applyVercelDeployResult(admin, buildOsProjectId, {
      triggered: true,
      deployState: 'ERROR',
      commitSha,
      taskId: responsibleTask,
    })
    console.error(`[vercel-webhook] WS5: deployment.error → project ${buildOsProjectId} health=build_unhealthy, task=${responsibleTask ?? 'unknown'}`)

    // WS4: If we know the responsible task, mark it as failed (not just blocked)
    // so the system has accurate truth — task completed but deploy broke
    if (responsibleTask) {
      try {
        const { data: currentTask } = await admin
          .from('tasks')
          .select('status')
          .eq('id', responsibleTask)
          .maybeSingle()

        // Only update if task is in completed/pending_deploy — don't regress active tasks
        if (currentTask?.status === 'completed' || currentTask?.status === 'pending_deploy') {
          await admin
            .from('tasks')
            .update({
              failure_detail: `WS5: Vercel build failed after commit ${commitSha?.slice(0, 8) ?? 'unknown'}. Project health set to build_unhealthy.`,
              failure_category: 'vercel_build_failed',
              // Note: we do NOT change status to 'failed' — the commit was valid.
              // The task stays 'completed' (code is in repo) but we annotate the build failure.
              // This is WS4 truth: task done, but deploy broke. Different from task failed.
            })
            .eq('id', responsibleTask)
        }
      } catch (taskErr) {
        console.warn('[vercel-webhook] WS4 task annotation failed (non-fatal):', taskErr)
      }
    }
  }

  return NextResponse.json({
    processed: true,
    type,
    project_id: buildOsProjectId,
    deploy_state: deployState ?? 'unknown',
  })
}
