/**
 * github-commit.ts — P0 Code Generation Pipeline
 * GitHub App authentication + Tree API commit.
 *
 * Flow:
 *   1. Sign GitHub App JWT (RS256)
 *   2. Exchange for installation access token
 *   3. GET current branch HEAD commit SHA
 *   4. POST tree with modified files
 *   5. POST commit
 *   6. PATCH branch ref
 *
 * Env vars required:
 *   GITHUB_APP_ID              — numeric GitHub App ID
 *   GITHUB_APP_PRIVATE_KEY     — PEM private key (raw or \\n-escaped)
 *   GITHUB_INSTALLATION_ID     — installation ID for the target repo
 *   GITHUB_REPO_OWNER          — repo owner (org or user)
 *   GITHUB_REPO_NAME           — repo name
 *   GITHUB_REPO_BRANCH         — branch to commit to (default: master)
 */

import { createSign } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitFile {
  path: string
  content: string
}

export interface CommitResult {
  success: boolean
  commitSha?: string
  commitUrl?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub App JWT
// ─────────────────────────────────────────────────────────────────────────────

function normalisePrivateKey(raw: string): string {
  // Vercel stores multi-line env vars with literal \n — convert to real newlines
  // Also handle base64-encoded PEM
  let pem = raw.replace(/\\n/g, '\n').trim()

  // If it looks like base64 without PEM headers, try to decode
  if (!pem.startsWith('-----')) {
    try {
      pem = Buffer.from(pem, 'base64').toString('utf-8').trim()
    } catch {
      // leave as-is
    }
  }

  return pem
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createAppJWT(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const signingInput = `${header}.${payload}`

  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = sign.sign(privateKeyPem)
  return `${signingInput}.${base64url(sig)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ghFetch(
  path: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

async function getInstallationToken(appId: string, installationId: string, privateKeyPem: string): Promise<string> {
  const jwt = createAppJWT(appId, privateKeyPem)
  const res = await ghFetch(`/app/installations/${installationId}/access_tokens`, jwt, 'POST')
  if (!res.ok) {
    throw new Error(`Failed to get installation token: ${res.status} — ${JSON.stringify(res.data)}`)
  }
  return (res.data as { token: string }).token
}

// ─────────────────────────────────────────────────────────────────────────────
// Main commit function
// ─────────────────────────────────────────────────────────────────────────────

/** Per-project repo override — supersedes global env vars when provided */
export interface CommitRepoOverride {
  owner?: string
  repo?: string
  installationId?: string
  branch?: string
  /** When true, suppresses the GITHUB_REPO_PATH_PREFIX env var prefix (use for standalone project repos) */
  noPathPrefix?: boolean
}

export async function commitFilesToGitHub(
  files: CommitFile[],
  commitMessage: string,
  /** Optional path prefix to prepend to all file paths before committing.
   *  Use when project_files stores normalised paths (e.g. src/lib/foo.ts)
   *  but the repo has them under a monorepo workspace (e.g. apps/web/src/lib/foo.ts).
   *  Falls back to GITHUB_REPO_PATH_PREFIX env var if not provided.
   *  Pass '' or set repoOverride.noPathPrefix=true to disable for standalone repos.
   */
  pathPrefix?: string,
  /** Optional per-project repo override — use instead of global env vars */
  repoOverride?: CommitRepoOverride,
): Promise<CommitResult> {
  const prefix = repoOverride?.noPathPrefix
    ? ''
    : (pathPrefix ?? process.env.GITHUB_REPO_PATH_PREFIX ?? '')
  // ── 1. Config validation ───────────────────────────────────────────────────
  const appId = process.env.GITHUB_APP_ID
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY
  // Support both naming conventions: GITHUB_INSTALLATION_ID and GITHUB_APP_INSTALLATION_ID
  const installationId = repoOverride?.installationId
    ?? process.env.GITHUB_INSTALLATION_ID
    ?? process.env.GITHUB_APP_INSTALLATION_ID
  const owner = repoOverride?.owner ?? process.env.GITHUB_REPO_OWNER
  const repo = repoOverride?.repo ?? process.env.GITHUB_REPO_NAME
  const branch = repoOverride?.branch ?? process.env.GITHUB_REPO_BRANCH || 'main'

  const missing = [
    !appId && 'GITHUB_APP_ID',
    !rawKey && 'GITHUB_APP_PRIVATE_KEY',
    !installationId && 'GITHUB_INSTALLATION_ID (or GITHUB_APP_INSTALLATION_ID)',
    !owner && 'GITHUB_REPO_OWNER',
    !repo && 'GITHUB_REPO_NAME',
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      success: false,
      error: `GitHub commit skipped — missing env vars: ${missing.join(', ')}`,
    }
  }

  if (files.length === 0) {
    return { success: false, error: 'No files to commit' }
  }

  try {
    const privateKeyPem = normalisePrivateKey(rawKey!)
    const token = await getInstallationToken(appId!, installationId!, privateKeyPem)

    // ── 2. Get current HEAD SHA ───────────────────────────────────────────────
    const refRes = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token, 'GET')
    if (!refRes.ok) {
      throw new Error(`Cannot get branch ref: ${refRes.status}`)
    }
    const headSha = (refRes.data as { object: { sha: string } }).object.sha

    // ── 3. Get base tree SHA ──────────────────────────────────────────────────
    const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits/${headSha}`, token, 'GET')
    if (!commitRes.ok) {
      throw new Error(`Cannot get base commit: ${commitRes.status}`)
    }
    const baseTreeSha = (commitRes.data as { tree: { sha: string } }).tree.sha

    // ── 4. Create new tree ────────────────────────────────────────────────────
    const treeItems = files.map(f => ({
      path: prefix ? `${prefix}${f.path}` : f.path,
      mode: '100644',
      type: 'blob',
      content: f.content,
    }))

    const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, token, 'POST', {
      base_tree: baseTreeSha,
      tree: treeItems,
    })
    if (!treeRes.ok) {
      throw new Error(`Cannot create tree: ${treeRes.status} — ${JSON.stringify(treeRes.data)}`)
    }
    const newTreeSha = (treeRes.data as { sha: string }).sha

    // ── 5. Create commit ──────────────────────────────────────────────────────
    const newCommitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, token, 'POST', {
      message: commitMessage,
      tree: newTreeSha,
      parents: [headSha],
    })
    if (!newCommitRes.ok) {
      throw new Error(`Cannot create commit: ${newCommitRes.status}`)
    }
    const newCommitSha = (newCommitRes.data as { sha: string; html_url: string }).sha
    const newCommitUrl = (newCommitRes.data as { sha: string; html_url: string }).html_url

    // ── 6. Update branch ref ─────────────────────────────────────────────────
    const patchRes = await ghFetch(
      `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      token,
      'PATCH',
      { sha: newCommitSha, force: false },
    )
    if (!patchRes.ok) {
      throw new Error(`Cannot update branch ref: ${patchRes.status}`)
    }

    console.log(`[github-commit] Committed ${files.length} file(s) → ${newCommitSha.slice(0, 8)}`)
    return { success: true, commitSha: newCommitSha, commitUrl: newCommitUrl }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[github-commit] Commit failed:', msg)
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel deploy trigger (supports both deploy hook URL and Deployments API)
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerVercelDeploy(): Promise<{ triggered: boolean; deploymentUrl?: string; error?: string }> {
  // Strategy 1: deploy hook URL (simple POST)
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
  if (hookUrl) {
    try {
      const res = await fetch(hookUrl, { method: 'POST' })
      if (res.ok) {
        console.log('[github-commit] Vercel deploy hook triggered')
        return { triggered: true }
      }
    } catch {
      // fall through to Strategy 2
    }
  }

  // Strategy 2: Vercel Deployments API — redeploy latest production deployment
  const vercelToken = process.env.VERCEL_API_TOKEN
  const projectId   = process.env.VERCEL_PROJECT_ID
  const teamId      = process.env.VERCEL_TEAM_ID

  if (!vercelToken || !projectId) {
    return { triggered: false, error: 'No VERCEL_DEPLOY_HOOK_URL, VERCEL_API_TOKEN, or VERCEL_PROJECT_ID configured' }
  }

  try {
    // Get latest READY production deployment
    const teamParam = teamId ? `&teamId=${teamId}` : ''
    const listRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1&state=READY&target=production${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    )
    if (!listRes.ok) {
      return { triggered: false, error: `Cannot list deployments: ${listRes.status}` }
    }
    const listData = (await listRes.json()) as { deployments: { uid: string; url: string }[] }
    const latest = listData.deployments?.[0]
    if (!latest) {
      return { triggered: false, error: 'No existing production deployment found to redeploy' }
    }

    // Trigger redeploy
    const redeployRes = await fetch(
      `https://api.vercel.com/v13/deployments?forceNew=1${teamParam}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deploymentId: latest.uid, name: 'web', target: 'production' }),
      },
    )
    if (!redeployRes.ok) {
      const errBody = await redeployRes.text()
      return { triggered: false, error: `Redeploy API returned ${redeployRes.status}: ${errBody.slice(0, 200)}` }
    }
    const redeployData = (await redeployRes.json()) as { id: string; url: string }
    const deployUrl = `https://${redeployData.url}`
    console.log(`[github-commit] Vercel redeploy triggered → ${deployUrl}`)
    return { triggered: true, deploymentUrl: deployUrl }
  } catch (err) {
    return { triggered: false, error: err instanceof Error ? err.message : String(err) }
  }
}
