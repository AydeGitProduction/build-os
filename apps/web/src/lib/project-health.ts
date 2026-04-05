/**
 * project-health.ts — Phase 7.7 WS4 + WS6
 *
 * Project-level build/deploy health state management.
 *
 * States:
 *   healthy        — project builds and deploys normally
 *   build_unhealthy — last Vercel build failed; new deploy-sensitive tasks are gated
 *   deploy_blocked  — deploy hook not reachable or deployment API returned error
 *   recovering      — human/system has acknowledged failure and is attempting fix
 *
 * WS4: Health state is stored in project_settings.build_health (JSONB).
 * WS6: checkGuardrails() in orchestration reads this state before dispatching tasks.
 *
 * Usage:
 *   import { getProjectHealth, setProjectHealth, isDeployGated } from '@/lib/project-health'
 *
 *   // After Vercel deploy failure:
 *   await setProjectHealth(admin, projectId, 'deploy_blocked', 'Vercel hook returned 500')
 *
 *   // Before dispatching tasks (WS6):
 *   if (await isDeployGated(admin, projectId)) { ... block }
 *
 *   // After successful deployment (recovery):
 *   await setProjectHealth(admin, projectId, 'healthy')
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectHealthState =
  | 'healthy'
  | 'build_unhealthy'
  | 'deploy_blocked'
  | 'recovering'

export interface ProjectHealthRecord {
  state: ProjectHealthState
  reason: string | null
  /** ISO timestamp of the last state change */
  changed_at: string
  /** Commit SHA that triggered the unhealthy state, if known */
  bad_commit_sha: string | null
  /** Task ID responsible for the bad state, if known */
  responsible_task_id: string | null
  /** How many consecutive deploy failures have occurred */
  consecutive_failures: number
}

const DEFAULT_HEALTH: ProjectHealthRecord = {
  state: 'healthy',
  reason: null,
  changed_at: new Date().toISOString(),
  bad_commit_sha: null,
  responsible_task_id: null,
  consecutive_failures: 0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current project health state.
 * Returns a default 'healthy' record if no health data is stored yet.
 */
export async function getProjectHealth(
  admin: SupabaseClient,
  projectId: string,
): Promise<ProjectHealthRecord> {
  try {
    const { data } = await admin
      .from('project_settings')
      .select('build_health')
      .eq('project_id', projectId)
      .maybeSingle()

    if (!data?.build_health) {
      return { ...DEFAULT_HEALTH }
    }

    // Merge with defaults to handle partial / old records
    return { ...DEFAULT_HEALTH, ...(data.build_health as Partial<ProjectHealthRecord>) }
  } catch (err) {
    console.warn('[project-health] getProjectHealth failed (non-fatal, default healthy):', err)
    return { ...DEFAULT_HEALTH }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the project health state.
 *
 * @param state               New health state
 * @param reason              Human-readable explanation
 * @param badCommitSha        Commit SHA that caused the failure (optional)
 * @param responsibleTaskId   Task that caused the failure (optional)
 */
export async function setProjectHealth(
  admin: SupabaseClient,
  projectId: string,
  state: ProjectHealthState,
  reason?: string,
  badCommitSha?: string | null,
  responsibleTaskId?: string | null,
): Promise<void> {
  try {
    // Read current to preserve consecutive_failures counter
    const current = await getProjectHealth(admin, projectId)

    const isFailureState = state === 'build_unhealthy' || state === 'deploy_blocked'
    const wasFailureState = current.state === 'build_unhealthy' || current.state === 'deploy_blocked'
    const consecutiveFailures = isFailureState
      ? (wasFailureState ? current.consecutive_failures + 1 : 1)
      : 0

    const record: ProjectHealthRecord = {
      state,
      reason: reason ?? null,
      changed_at: new Date().toISOString(),
      bad_commit_sha: badCommitSha ?? (isFailureState ? current.bad_commit_sha : null),
      responsible_task_id: responsibleTaskId ?? (isFailureState ? current.responsible_task_id : null),
      consecutive_failures: consecutiveFailures,
    }

    // Try upsert into project_settings
    const { error: updateError } = await admin
      .from('project_settings')
      .update({ build_health: record as unknown as Record<string, unknown> })
      .eq('project_id', projectId)

    if (updateError) {
      // Row may not exist — try insert
      await admin
        .from('project_settings')
        .insert({
          project_id: projectId,
          build_health: record as unknown as Record<string, unknown>,
        })
    }

    console.log(
      `[project-health] project ${projectId}: ${current.state} → ${state}` +
      (reason ? ` (${reason.slice(0, 80)})` : '')
    )
  } catch (err) {
    // Never crash the pipeline — health update is important but not blocking
    console.error('[project-health] setProjectHealth failed (non-fatal):', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WS6: Deploy-gate check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the project is in a state where deploy-sensitive tasks
 * should be gated (not dispatched).
 *
 * States that gate dispatch:
 *   - build_unhealthy
 *   - deploy_blocked
 *
 * States that allow dispatch:
 *   - healthy
 *   - recovering (recovery tasks can proceed)
 */
export async function isDeployGated(
  admin: SupabaseClient,
  projectId: string,
): Promise<{ gated: boolean; reason: string; state: ProjectHealthState }> {
  const health = await getProjectHealth(admin, projectId)

  if (health.state === 'build_unhealthy' || health.state === 'deploy_blocked') {
    return {
      gated: true,
      reason: `Project deploy state is '${health.state}': ${health.reason ?? 'build failure detected'}. ` +
        `Dispatching new code tasks would pile onto a broken deploy. ` +
        `Resolve the build failure first or set state to 'recovering'.`,
      state: health.state,
    }
  }

  return { gated: false, reason: '', state: health.state }
}

// ─────────────────────────────────────────────────────────────────────────────
// WS5: Map Vercel deploy result to health state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a Vercel deployment result into the project health state.
 * Called from generate/route.ts after triggerVercelDeploy() and from
 * the /api/webhooks/vercel endpoint when Vercel sends a deployment event.
 */
export async function applyVercelDeployResult(
  admin: SupabaseClient,
  projectId: string,
  result: {
    triggered: boolean
    deploymentUrl?: string | null
    error?: string | null
    /** Set when called from Vercel webhook with actual build result */
    deployState?: 'READY' | 'ERROR' | 'CANCELED' | 'BUILDING'
    commitSha?: string | null
    taskId?: string | null
  },
): Promise<void> {
  const { triggered, error, deployState, commitSha, taskId } = result

  if (deployState === 'READY') {
    // Successful deployment — restore healthy state
    await setProjectHealth(admin, projectId, 'healthy', 'Vercel deployment succeeded', null, null)
    return
  }

  if (deployState === 'ERROR') {
    // Definitive build failure from Vercel webhook
    await setProjectHealth(
      admin, projectId,
      'build_unhealthy',
      `Vercel build failed (deployment state: ERROR)`,
      commitSha ?? null,
      taskId ?? null,
    )
    return
  }

  if (!triggered) {
    // Deploy hook failed to fire or returned error
    await setProjectHealth(
      admin, projectId,
      'deploy_blocked',
      `Vercel deploy hook failed: ${error ?? 'unknown error'}`,
      commitSha ?? null,
      taskId ?? null,
    )
    return
  }

  // triggered=true but no definitive result yet — don't change health state
  // (Vercel webhook will update it later when build completes)
}
