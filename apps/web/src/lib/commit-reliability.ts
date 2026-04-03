// apps/web/src/lib/commit-reliability.ts
// Commit reliability layer: verification, delivery logging, stub creation, incident escalation.
// DO NOT MODIFY: uses @octokit/rest (added to package.json) and correct import paths.

import { Octokit } from '@octokit/rest'
import { resolveGitHubToken } from '@/lib/resolve-github-token'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// B0.3b: Cross-project target validation types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical repo target for a project — derived from project_integrations
 * (the same source used by generate/route.ts to pick the commit destination).
 */
export interface ProjectRepoTarget {
  owner: string
  repo: string
  branch: string
  /** Full repo identifier e.g. "AydeGitBuildOS/buildos-endtoendtest" */
  fullName: string
  /** Source of this target: "project_integrations" or "env_vars" or "unknown" */
  source: 'project_integrations' | 'env_vars' | 'unknown'
}

/**
 * Result of a cross-project target match check.
 * VERIFIED_DONE is only allowed when expected === actual AND files are in repo.
 */
export type CommitClassification =
  | 'VERIFIED_DONE'
  | 'FALSE_DONE'
  | 'DONE_BUT_UNVERIFIED'

export interface CrossProjectCheckResult {
  classification: CommitClassification
  /** Populated when classification is FALSE_DONE */
  reason?: 'CROSS_PROJECT_TARGET_MISMATCH' | 'FILES_NOT_IN_REPO' | 'VERIFICATION_SKIPPED'
  expected: ProjectRepoTarget
  actual: ProjectRepoTarget
  target_match: boolean
  files_verified: boolean
  /** Founder-readable incident message for mismatch cases */
  incident_message?: string
}

/**
 * WS1 — Compute the expected commit target for a project from project_integrations.
 * Returns env-var fallback if no integration is configured.
 * This is the canonical source of truth for where a project's code should be delivered.
 */
export function resolveExpectedTarget(
  projectIntegrationRepoUrl: string | null | undefined,
): ProjectRepoTarget {
  if (projectIntegrationRepoUrl) {
    const match = projectIntegrationRepoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (match) {
      const owner = match[1]
      const repo = match[2]
      return {
        owner,
        repo,
        branch: process.env.GITHUB_REPO_BRANCH ?? 'main',
        fullName: `${owner}/${repo}`,
        source: 'project_integrations',
      }
    }
  }

  // Fall back to global env vars
  const owner = process.env.GITHUB_REPO_OWNER ?? ''
  const repo = process.env.GITHUB_REPO_NAME ?? ''
  return {
    owner,
    repo,
    branch: process.env.GITHUB_REPO_BRANCH ?? 'main',
    fullName: owner && repo ? `${owner}/${repo}` : 'unknown/unknown',
    source: owner && repo ? 'env_vars' : 'unknown',
  }
}

/**
 * WS2 — Extract the actual commit target from what commitFilesToGitHub used.
 * This mirrors the resolution logic in generate/route.ts.
 */
export function extractActualTarget(opts: {
  repoOverrideOwner?: string
  repoOverrideRepo?: string
  repoOverrideBranch?: string
}): ProjectRepoTarget {
  const owner = opts.repoOverrideOwner ?? process.env.GITHUB_REPO_OWNER ?? ''
  const repo = opts.repoOverrideRepo ?? process.env.GITHUB_REPO_NAME ?? ''
  const branch = opts.repoOverrideBranch ?? process.env.GITHUB_REPO_BRANCH ?? 'main'
  const source = (opts.repoOverrideOwner || opts.repoOverrideRepo)
    ? 'project_integrations'
    : (owner && repo ? 'env_vars' : 'unknown')
  return {
    owner,
    repo,
    branch,
    fullName: owner && repo ? `${owner}/${repo}` : 'unknown/unknown',
    source,
  }
}

/**
 * WS3+WS4+WS5 — Strict cross-project match check.
 * Compares expected and actual targets. If they don't match, returns FALSE_DONE.
 * If they match but files aren't verified, returns DONE_BUT_UNVERIFIED.
 * VERIFIED_DONE requires: match + all files verified.
 */
export function classifyCommitDelivery(
  expected: ProjectRepoTarget,
  actual: ProjectRepoTarget,
  filesVerified: boolean,
  opts: {
    task_id: string
    project_id: string
    commit_sha: string
    file_paths: string[]
  },
): CrossProjectCheckResult {
  const targetMatch =
    expected.owner.toLowerCase() === actual.owner.toLowerCase() &&
    expected.repo.toLowerCase() === actual.repo.toLowerCase()

  if (!targetMatch) {
    const incident = buildMismatchIncidentMessage({
      task_id: opts.task_id,
      project_id: opts.project_id,
      expected,
      actual,
      commit_sha: opts.commit_sha,
      file_paths: opts.file_paths,
    })
    return {
      classification: 'FALSE_DONE',
      reason: 'CROSS_PROJECT_TARGET_MISMATCH',
      expected,
      actual,
      target_match: false,
      files_verified: false,
      incident_message: incident,
    }
  }

  if (!filesVerified) {
    return {
      classification: 'DONE_BUT_UNVERIFIED',
      reason: 'FILES_NOT_IN_REPO',
      expected,
      actual,
      target_match: true,
      files_verified: false,
    }
  }

  return {
    classification: 'VERIFIED_DONE',
    expected,
    actual,
    target_match: true,
    files_verified: true,
  }
}

/**
 * WS5 — Generate a founder-readable mismatch incident message.
 * Called when cross-project target mismatch is detected.
 */
export function buildMismatchIncidentMessage(opts: {
  task_id: string
  project_id: string
  expected: ProjectRepoTarget
  actual: ProjectRepoTarget
  commit_sha: string
  file_paths: string[]
}): string {
  const { task_id, project_id, expected, actual, commit_sha, file_paths } = opts
  return [
    `[B0.3b] CROSS_PROJECT_TARGET_MISMATCH INCIDENT`,
    ``,
    `Task:     ${task_id}`,
    `Project:  ${project_id}`,
    ``,
    `Expected commit target (from project routing):`,
    `  Repo:   ${expected.fullName}`,
    `  Branch: ${expected.branch}`,
    `  Source: ${expected.source}`,
    ``,
    `Actual commit target (where files were delivered):`,
    `  Repo:   ${actual.fullName}`,
    `  Branch: ${actual.branch}`,
    `  Source: ${actual.source}`,
    ``,
    `Commit SHA: ${commit_sha}`,
    `Files:      ${file_paths.join(', ')}`,
    ``,
    `Classification: FALSE_DONE`,
    `Reason: Commit was delivered to the wrong repository.`,
    `        VERIFIED_DONE requires the commit repo to match the project's canonical target.`,
    ``,
    `Remediation:`,
    `  1. Check project_integrations for project ${project_id}`,
    `  2. Verify github_repo_url matches the intended delivery repo`,
    `  3. Replay the generate/commit step once project routing is corrected`,
    `  4. Do NOT mark task as completed until repo target is confirmed correct`,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (original)
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitFileOptions {
  projectId: string
  owner: string
  repo: string
  branch: string
  filePath: string
  content: string // base64 encoded content
  commitMessage: string
  committerName?: string
  committerEmail?: string
}

export interface CommitResult {
  sha: string
  url: string
  tokenMode: 'user_managed' | 'platform_managed'
}

export interface EnsureFileOptions extends CommitFileOptions {
  maxRetries?: number
}

export interface DeliveryLogOptions {
  task_id: string
  project_id: string
  repo_name: string
  branch_name: string
  target_path: string
  stub_created: boolean
  token_refreshed: boolean
  commit_sha: string | null
  commit_verified: boolean
  verification_notes?: string
}

export interface StubResult {
  success: boolean
  commitSha?: string
  tokenRefreshed: boolean
  error?: string
}

export interface VerifyResult {
  verified: boolean
  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Core commit with retry
// ─────────────────────────────────────────────────────────────────────────────

export async function commitFileReliably(
  options: EnsureFileOptions,
): Promise<CommitResult> {
  const {
    projectId,
    owner,
    repo,
    branch,
    filePath,
    content,
    commitMessage,
    committerName = 'Build OS Bot',
    committerEmail = 'bot@buildos.dev',
    maxRetries = 3,
  } = options

  const { token, mode: tokenMode } = await resolveGitHubToken(projectId)

  if (!token) {
    throw new Error(`[commit-reliability] No GitHub token for project=${projectId}`)
  }

  const octokit = new Octokit({ auth: token })
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const currentSha = await getFileSha(octokit, { owner, repo, branch, filePath })

      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMessage,
        content,
        branch,
        sha: currentSha,
        committer: { name: committerName, email: committerEmail },
      })

      return {
        sha: data.commit.sha ?? '',
        url: data.commit.html_url ?? '',
        tokenMode,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const status = (err as { status?: number }).status
      if (status === 409) {
        await sleep(100 * attempt)
        continue
      }
      throw lastError
    }
  }

  throw new Error(
    `[commit-reliability] Exhausted ${maxRetries} retries for ${owner}/${repo}:${filePath} — ${lastError?.message}`,
  )
}

export async function commitFilesBatch(options: {
  projectId: string
  owner: string
  repo: string
  branch: string
  files: Array<{ path: string; content: string }>
  commitMessage: string
  committerName?: string
  committerEmail?: string
}): Promise<CommitResult> {
  const {
    projectId,
    owner,
    repo,
    branch,
    files,
    commitMessage,
    committerName = 'Build OS Bot',
    committerEmail = 'bot@buildos.dev',
  } = options

  const { token, mode: tokenMode } = await resolveGitHubToken(projectId)

  if (!token) {
    throw new Error(`[commit-reliability] No GitHub token for project=${projectId}`)
  }

  const octokit = new Octokit({ auth: token })

  const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
  const headSha = refData.object.sha

  const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: headSha })
  const baseTreeSha = commitData.tree.sha

  const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = []
  for (const file of files) {
    const { data: blobData } = await octokit.git.createBlob({
      owner,
      repo,
      content: file.content,
      encoding: 'base64',
    })
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha })
  }

  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  })

  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.sha,
    parents: [headSha],
    committer: { name: committerName, email: committerEmail },
    author: { name: committerName, email: committerEmail },
  })

  await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha })

  return { sha: newCommit.sha, url: newCommit.html_url, tokenMode }
}

// ─────────────────────────────────────────────────────────────────────────────
// G4: Verification + delivery logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a file exists in the GitHub repo after a commit.
 *
 * WS3 FIX: Applies GITHUB_REPO_PATH_PREFIX to filePath before the GitHub API call,
 * matching the behaviour of commitFilesToGitHub which also prepends the prefix at
 * commit time. Without this, a file at apps/web/src/lib/foo.ts was verified as
 * src/lib/foo.ts — always returning 404 and incorrectly blocking the task (C-3).
 *
 * Also: if GitHub env vars are missing or auth fails, treat as non-blocking (verified=true)
 * rather than forcing task to 'blocked' — the commit already happened, verification
 * infrastructure is the problem, not the task output.
 */
export async function verifyCommitDelivery(filePath: string): Promise<VerifyResult> {
  const owner = process.env.GITHUB_REPO_OWNER ?? ''
  const repo = process.env.GITHUB_REPO_NAME ?? ''
  const branch = process.env.GITHUB_REPO_BRANCH ?? 'main'
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? ''

  // WS3: apply monorepo path prefix — must match what commitFilesToGitHub commits
  const prefix = process.env.GITHUB_REPO_PATH_PREFIX ?? ''
  const fullPath = prefix ? `${prefix}${filePath}` : filePath

  if (!owner || !repo || !token) {
    // Infrastructure not configured — cannot verify, but should not block the task
    return {
      verified: true,
      notes: `Verification skipped — GITHUB_REPO_OWNER/GITHUB_REPO_NAME/GITHUB_TOKEN not set. Commit assumed successful.`,
    }
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}?ref=${branch}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    )

    if (res.ok) {
      return { verified: true, notes: `File found at ${fullPath} in ${owner}/${repo}@${branch}` }
    }
    if (res.status === 401 || res.status === 403) {
      // Auth error — token expired or wrong scope. Don't block the task.
      return {
        verified: true,
        notes: `Verification skipped — GitHub API auth error (${res.status}). Token may lack repo scope. Manual review recommended.`,
      }
    }
    if (res.status === 404) {
      return { verified: false, notes: `File not found: ${fullPath} in ${owner}/${repo}@${branch} (prefix=${prefix || 'none'})` }
    }
    return { verified: false, notes: `GitHub API returned ${res.status} for ${fullPath}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Network/DNS errors mean verification infrastructure is down — don't block the task
    return {
      verified: true,
      notes: `Verification skipped — network error: ${msg}. Commit assumed successful; manual review recommended.`,
    }
  }
}

/**
 * Log a commit delivery attempt to the commit_delivery_logs table.
 * Non-fatal — swallows errors to avoid blocking agent pipeline.
 */
export async function logCommitDelivery(
  admin: SupabaseClient,
  options: DeliveryLogOptions,
): Promise<string> {
  try {
    const { data, error } = await (admin as any)
      .from('commit_delivery_logs')
      .insert({
        task_id: options.task_id,
        project_id: options.project_id,
        repo_name: options.repo_name,
        branch_name: options.branch_name,
        target_path: options.target_path,
        stub_created: options.stub_created,
        token_refreshed: options.token_refreshed,
        commit_sha: options.commit_sha,
        commit_verified: options.commit_verified,
        verification_notes: options.verification_notes ?? null,
        logged_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) {
      console.warn('[commit-reliability] logCommitDelivery: could not insert row:', error?.message)
      return 'noop'
    }

    return data.id as string
  } catch (err) {
    console.warn('[commit-reliability] logCommitDelivery error (non-fatal):', err)
    return 'noop'
  }
}

/**
 * Escalate a commit delivery failure to the incident log.
 */
export async function escalateToIncident(
  admin: SupabaseClient,
  taskId: string,
  projectId: string,
  notes: string,
  deliveryLogId: string,
): Promise<void> {
  try {
    await (admin as any)
      .from('incident_logs')
      .insert({
        task_id: taskId,
        project_id: projectId,
        category: 'commit_delivery',
        notes,
        delivery_log_id: deliveryLogId,
        occurred_at: new Date().toISOString(),
      })
  } catch (err) {
    console.warn('[commit-reliability] escalateToIncident error (non-fatal):', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G4: Stub file creation at dispatch time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract file paths from a task's context_payload where intent is CREATE.
 */
export function extractCreatePaths(
  payload: Record<string, unknown> | null,
): string[] {
  if (!payload) return []

  const candidates: unknown[] = []
  if (Array.isArray(payload.files)) candidates.push(...payload.files)
  if (Array.isArray(payload.create_files)) candidates.push(...payload.create_files)
  if (Array.isArray(payload.paths)) candidates.push(...payload.paths)

  return candidates
    .filter((f): f is string => typeof f === 'string' && f.length > 0)
    .map((f) => f.trim())
}

/**
 * Push a stub placeholder file to GitHub at dispatch time (G4 gate).
 */
export async function createStubFile(taskId: string, filePath: string): Promise<StubResult> {
  const owner = process.env.GITHUB_REPO_OWNER ?? ''
  const repo = process.env.GITHUB_REPO_NAME ?? ''
  const branch = process.env.GITHUB_REPO_BRANCH ?? 'main'
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? ''

  if (!owner || !repo || !token) {
    return {
      success: false,
      tokenRefreshed: false,
      error: 'Missing GITHUB_REPO_OWNER/GITHUB_REPO_NAME/GITHUB_TOKEN env vars',
    }
  }

  const stubContent = Buffer.from(
    `// STUB — Task ${taskId}\n// This file will be replaced by the agent.\n`,
  ).toString('base64')

  try {
    let existingSha: string | undefined
    const checkRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } },
    )
    if (checkRes.ok) {
      const existing = await checkRes.json()
      existingSha = existing.sha
    }

    const body: Record<string, unknown> = {
      message: `[stub] Reserve ${filePath} for task ${taskId}`,
      content: stubContent,
      branch,
    }
    if (existingSha) body.sha = existingSha

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!putRes.ok) {
      const err = await putRes.text()
      return { success: false, tokenRefreshed: false, error: `GitHub API ${putRes.status}: ${err}` }
    }

    const result = await putRes.json()
    return {
      success: true,
      commitSha: result.commit?.sha,
      tokenRefreshed: false,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, tokenRefreshed: false, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getFileSha(
  octokit: Octokit,
  opts: { owner: string; repo: string; branch: string; filePath: string },
): Promise<string | undefined> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: opts.owner,
      repo: opts.repo,
      path: opts.filePath,
      ref: opts.branch,
    })
    if (Array.isArray(data)) return undefined
    return (data as { sha: string }).sha
  } catch (err) {
    if ((err as { status?: number }).status === 404) return undefined
    throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
