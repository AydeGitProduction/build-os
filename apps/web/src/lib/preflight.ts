/**
 * preflight.ts — WS2: Vercel/GitHub Preflight Checks
 *
 * Before any project bootstrap or run starts, this module validates:
 *   1. GitHub App installation exists and is accessible
 *   2. Write (push) permission exists on the target repo
 *   3. Correct repo is linked to the Vercel project
 *   4. Required env vars exist in the Vercel project
 *
 * If ANY check fails:
 *   - Run is NOT started
 *   - Task status set to 'blocked_preflight'
 *   - Exact missing item returned in the error body
 *
 * Usage:
 *   const result = await runPreflight(projectId, admin)
 *   if (!result.passed) {
 *     await admin.from('tasks').update({ status: 'blocked_preflight', ... })
 *     return NextResponse.json({ error: result.reason, missing: result.missing }, { status: 422 })
 *   }
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ghFetchWithAuth } from './github-app-token'
import { VERCEL_REQUIRED_ENV_KEYS } from './vercel-env-template'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PreflightCheck =
  | 'github_app_installation'
  | 'github_write_permission'
  | 'vercel_github_linkage'
  | 'vercel_env_vars'

export interface PreflightCheckResult {
  check: PreflightCheck
  passed: boolean
  detail: string
}

export interface PreflightResult {
  passed: boolean
  /** Populated only when passed=false */
  reason?: string
  /** Exact missing item / failed check */
  missing?: string
  /** First failing check name */
  failedCheck?: PreflightCheck
  /** Full results for all checks */
  checks: PreflightCheckResult[]
  /** Integration data resolved during preflight (available when passed=true) */
  integration?: {
    githubInstallationId: string
    githubRepoFullname: string
    vercelProjectId: string
    githubLinkedToVercel: boolean
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

async function checkGitHubInstallation(
  installationId: string,
): Promise<PreflightCheckResult> {
  const check: PreflightCheck = 'github_app_installation'
  try {
    const res = await ghFetchWithAuth<{ id: number; account?: { login: string } }>(
      `/app/installations/${installationId}`,
      'GET',
      undefined,
      check,
    )
    if (res.ok) {
      return {
        check,
        passed: true,
        detail: `Installation ${installationId} verified — account=${(res.data as { account?: { login: string } })?.account?.login ?? 'unknown'}`,
      }
    }
    return {
      check,
      passed: false,
      detail: `GitHub App installation ${installationId} returned HTTP ${res.status}. App may not be installed on this org.`,
    }
  } catch (err) {
    return {
      check,
      passed: false,
      detail: `GitHub App installation check threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkGitHubWritePermission(
  owner: string,
  repo: string,
): Promise<PreflightCheckResult> {
  const check: PreflightCheck = 'github_write_permission'
  try {
    const res = await ghFetchWithAuth<{ permissions?: { push?: boolean; admin?: boolean } }>(
      `/repos/${owner}/${repo}`,
      'GET',
      undefined,
      check,
    )
    if (!res.ok) {
      return {
        check,
        passed: false,
        detail: `Cannot read repo ${owner}/${repo} — HTTP ${res.status}. Check App installation scope.`,
      }
    }
    const perms = (res.data as { permissions?: { push?: boolean } })?.permissions
    if (perms?.push !== true) {
      return {
        check,
        passed: false,
        detail: `GitHub App lacks write (push) permission on ${owner}/${repo}. Current permissions: ${JSON.stringify(perms)}`,
      }
    }
    return {
      check,
      passed: true,
      detail: `Write permission confirmed on ${owner}/${repo}`,
    }
  } catch (err) {
    return {
      check,
      passed: false,
      detail: `Write permission check threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkVercelGitHubLinkage(
  vercelProjectId: string,
  githubRepoFullname: string,
): Promise<PreflightCheckResult> {
  const check: PreflightCheck = 'vercel_github_linkage'

  const vercelToken = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID

  if (!vercelToken) {
    return {
      check,
      passed: false,
      detail: 'VERCEL_API_TOKEN not set — cannot verify Vercel/GitHub linkage',
    }
  }

  try {
    const teamParam = teamId ? `?teamId=${teamId}` : ''
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${vercelProjectId}${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    )

    if (!res.ok) {
      return {
        check,
        passed: false,
        detail: `Vercel project ${vercelProjectId} returned HTTP ${res.status}. Project may not exist.`,
      }
    }

    const data = (await res.json()) as {
      link?: { type?: string; repo?: string; repoOwnerId?: string }
    }
    const linked = data.link?.repo

    if (!linked) {
      return {
        check,
        passed: false,
        detail: `Vercel project ${vercelProjectId} has no GitHub repo linked. Expected: ${githubRepoFullname}`,
      }
    }

    if (linked !== githubRepoFullname) {
      return {
        check,
        passed: false,
        detail: `Vercel project ${vercelProjectId} is linked to "${linked}" but expected "${githubRepoFullname}"`,
      }
    }

    return {
      check,
      passed: true,
      detail: `Vercel project ${vercelProjectId} correctly linked to ${githubRepoFullname}`,
    }
  } catch (err) {
    return {
      check,
      passed: false,
      detail: `Vercel linkage check threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function checkVercelEnvVars(vercelProjectId: string): Promise<PreflightCheckResult> {
  const check: PreflightCheck = 'vercel_env_vars'

  const vercelToken = process.env.VERCEL_API_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID

  if (!vercelToken) {
    return {
      check,
      passed: false,
      detail: 'VERCEL_API_TOKEN not set — cannot check env vars',
    }
  }

  try {
    const teamParam = teamId ? `?teamId=${teamId}` : ''
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${vercelProjectId}/env${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    )

    if (!res.ok) {
      return {
        check,
        passed: false,
        detail: `Cannot list env vars for Vercel project ${vercelProjectId} — HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as { envs?: Array<{ key: string }> }
    const existingKeys = new Set((data.envs ?? []).map((e) => e.key))

    const missing = VERCEL_REQUIRED_ENV_KEYS.filter((k) => !existingKeys.has(k))

    if (missing.length > 0) {
      return {
        check,
        passed: false,
        detail: `Required env vars missing from Vercel project ${vercelProjectId}: ${missing.join(', ')}`,
      }
    }

    return {
      check,
      passed: true,
      detail: `All ${VERCEL_REQUIRED_ENV_KEYS.length} required env vars present in Vercel project ${vercelProjectId}`,
    }
  } catch (err) {
    return {
      check,
      passed: false,
      detail: `Vercel env var check threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main preflight runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs all preflight checks for a project before bootstrap/run.
 *
 * Reads canonical integration state from the DB.
 * Fails fast: returns on first failed check (in order: installation → write → linkage → env).
 *
 * @param projectId  Supabase project UUID
 * @param admin      Supabase admin client
 * @param opts       Optional overrides for testing
 */
export async function runPreflight(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  opts?: {
    /** Skip Vercel linkage check (e.g. during initial bootstrap before Vercel project exists) */
    skipVercelLinkage?: boolean
    /** Skip env var check */
    skipEnvVars?: boolean
  },
): Promise<PreflightResult> {
  console.log(`[preflight] Starting preflight for project=${projectId}`)

  // ── Load canonical integration state ──────────────────────────────────────
  const { data: integration, error: intErr } = await admin
    .from('project_integration_state')
    .select('github_installation_id, github_repo_fullname, vercel_project_id')
    .eq('project_id', projectId)
    .maybeSingle()

  if (intErr || !integration) {
    console.error(`[preflight] No canonical integration state for project ${projectId}`)
    return {
      passed: false,
      reason: 'No canonical integration state found',
      missing: 'project_integration_state row',
      failedCheck: 'github_app_installation',
      checks: [
        {
          check: 'github_app_installation',
          passed: false,
          detail: `No project_integration_state row found for project_id=${projectId}. Run bootstrap first.`,
        },
      ],
    }
  }

  const { github_installation_id, github_repo_fullname, vercel_project_id } = integration
  const [owner, repo] = (github_repo_fullname ?? '').split('/')
  const checks: PreflightCheckResult[] = []

  // ── Check 1: GitHub App installation ─────────────────────────────────────
  if (github_installation_id) {
    const c1 = await checkGitHubInstallation(github_installation_id)
    checks.push(c1)
    if (!c1.passed) {
      return buildFailResult(c1, checks, 'github_app_installation', c1.detail)
    }
  } else {
    const c1: PreflightCheckResult = {
      check: 'github_app_installation',
      passed: false,
      detail: 'github_installation_id not set in canonical integration state',
    }
    checks.push(c1)
    return buildFailResult(c1, checks, 'github_app_installation', c1.detail)
  }

  // ── Check 2: Write permission ─────────────────────────────────────────────
  if (owner && repo) {
    const c2 = await checkGitHubWritePermission(owner, repo)
    checks.push(c2)
    if (!c2.passed) {
      return buildFailResult(c2, checks, 'github_write_permission', c2.detail)
    }
  } else {
    const c2: PreflightCheckResult = {
      check: 'github_write_permission',
      passed: false,
      detail: `github_repo_fullname "${github_repo_fullname}" is not in "owner/repo" format`,
    }
    checks.push(c2)
    return buildFailResult(c2, checks, 'github_write_permission', c2.detail)
  }

  // ── Check 3: Vercel/GitHub linkage ────────────────────────────────────────
  if (!opts?.skipVercelLinkage && vercel_project_id && github_repo_fullname) {
    const c3 = await checkVercelGitHubLinkage(vercel_project_id, github_repo_fullname)
    checks.push(c3)
    if (!c3.passed) {
      return buildFailResult(c3, checks, 'vercel_github_linkage', c3.detail)
    }
  } else if (!opts?.skipVercelLinkage) {
    const c3: PreflightCheckResult = {
      check: 'vercel_github_linkage',
      passed: false,
      detail: `vercel_project_id or github_repo_fullname missing in canonical state`,
    }
    checks.push(c3)
    return buildFailResult(c3, checks, 'vercel_github_linkage', c3.detail)
  }

  // ── Check 4: Vercel env vars ──────────────────────────────────────────────
  if (!opts?.skipEnvVars && vercel_project_id) {
    const c4 = await checkVercelEnvVars(vercel_project_id)
    checks.push(c4)
    if (!c4.passed) {
      return buildFailResult(c4, checks, 'vercel_env_vars', c4.detail)
    }
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  console.log(`[preflight] ALL checks PASSED for project=${projectId}`)
  return {
    passed: true,
    checks,
    integration: {
      githubInstallationId: github_installation_id,
      githubRepoFullname: github_repo_fullname,
      vercelProjectId: vercel_project_id,
      githubLinkedToVercel: !opts?.skipVercelLinkage,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildFailResult(
  failedCheck: PreflightCheckResult,
  checks: PreflightCheckResult[],
  checkName: PreflightCheck,
  detail: string,
): PreflightResult {
  console.error(`[preflight] BLOCKED — ${checkName}: ${detail}`)
  return {
    passed: false,
    reason: `Preflight check failed: ${checkName}`,
    missing: detail,
    failedCheck: checkName,
    checks,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task status helper: mark task as blocked_preflight in DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a task as blocked_preflight when a preflight check fails.
 * Call this in dispatch/task or orchestration before starting a run.
 */
export async function markTaskBlockedPreflight(
  taskId: string,
  preflightResult: PreflightResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<void> {
  const { error } = await admin
    .from('tasks')
    .update({
      status: 'blocked_preflight',
      error_message: preflightResult.missing ?? preflightResult.reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    console.error(
      `[preflight] Failed to mark task ${taskId} as blocked_preflight: ${error.message}`,
    )
  } else {
    console.log(
      `[preflight] Task ${taskId} marked blocked_preflight — ${preflightResult.failedCheck}: ${preflightResult.missing}`,
    )
  }
}
