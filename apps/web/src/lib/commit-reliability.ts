/**
 * commit-reliability.ts — Block G4
 * Commit Reliability Protocol enforcement layer.
 *
 * Implements:
 *   1. ensureFreshToken()     — always fetch a new installation token, never reuse
 *   2. createStubFile()       — push placeholder to repo before CREATE task dispatch
 *   3. verifyCommitDelivery() — confirm file exists on GitHub after commit
 *   4. logCommitDelivery()    — persist evidence to commit_delivery_logs
 *   5. escalateToIncident()   — create P1 incident on repeated failure
 *   6. getFailureCount()      — count unverified deliveries for a task
 *
 * Consumed by:
 *   - /api/dispatch/task (stub gate)
 *   - /api/agent/generate (verification gate + escalation)
 *
 * RULE-11: Stub file must exist before CREATE_NEW_FILE task
 * RULE-14: Verify GitHub App token age before code sprint
 *
 * @module commit-reliability
 */

import { createSign } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitDeliveryLog {
  task_id: string
  project_id?: string | null
  repo_name: string
  branch_name: string
  target_path: string
  stub_created: boolean
  token_refreshed: boolean
  commit_sha?: string | null
  commit_verified: boolean
  verification_notes?: string | null
  escalated?: boolean
  incident_id?: string | null
}

export interface StubResult {
  success: boolean
  commitSha?: string
  error?: string
  tokenRefreshed: boolean
}

export interface VerifyResult {
  verified: boolean
  sha?: string
  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: GitHub App JWT (mirrors github-commit.ts — no shared state)
// ─────────────────────────────────────────────────────────────────────────────

function _base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function _normaliseKey(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').trim()
  if (!pem.startsWith('-----')) {
    try { pem = Buffer.from(pem, 'base64').toString('utf-8').trim() } catch { /* leave */ }
  }
  return pem
}

function _makeJWT(appId: string, pem: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = _base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = _base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const input = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(input)
  return `${input}.${_base64url(sign.sign(pem))}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ensureFreshToken
//    Always fetches a new installation token. NEVER caches. Throws on failure.
//    RULE-14: Cached tokens are forbidden — freshness is guaranteed by always
//    calling this function, which never stores or reuses a prior token.
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureFreshToken(): Promise<{ token: string; obtainedAt: number }> {
  const appId        = process.env.GITHUB_APP_ID
  const rawKey       = process.env.GITHUB_APP_PRIVATE_KEY
  const installId    = process.env.GITHUB_INSTALLATION_ID ?? process.env.GITHUB_APP_INSTALLATION_ID

  if (!appId || !rawKey || !installId) {
    throw new Error(
      `[commit-reliability] ensureFreshToken: missing env vars — ` +
      `GITHUB_APP_ID=${!!appId}, GITHUB_APP_PRIVATE_KEY=${!!rawKey}, ` +
      `GITHUB_INSTALLATION_ID=${!!installId}`
    )
  }

  const pem = _normaliseKey(rawKey)
  const jwt = _makeJWT(appId, pem)

  const res = await fetch(
    `https://api.github.com/app/installations/${installId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(
      `[commit-reliability] ensureFreshToken: installation token exchange failed ` +
      `${res.status} — ${body.slice(0, 200)}`
    )
  }

  const data = (await res.json()) as { token: string }
  const obtainedAt = Math.floor(Date.now() / 1000)

  console.log(
    `[commit-reliability] Fresh installation token obtained at ${new Date().toISOString()} ` +
    `(expires ~${new Date((obtainedAt + 3600) * 1000).toISOString()})`
  )

  return { token: data.token, obtainedAt }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. createStubFile
//    Pushes a placeholder file to GitHub before a CREATE task dispatches.
//    RULE-11: Stub must exist before CREATE_NEW_FILE task.
// ─────────────────────────────────────────────────────────────────────────────

export async function createStubFile(
  taskId: string,
  filePath: string,
  owner?: string,
  repo?: string,
  branch?: string,
): Promise<StubResult> {
  const resolvedOwner  = owner  ?? process.env.GITHUB_REPO_OWNER ?? ''
  const resolvedRepo   = repo   ?? process.env.GITHUB_REPO_NAME  ?? ''
  const resolvedBranch = branch ?? process.env.GITHUB_REPO_BRANCH ?? 'main'
  const pathPrefix     = process.env.GITHUB_REPO_PATH_PREFIX ?? ''

  if (!resolvedOwner || !resolvedRepo) {
    return {
      success: false,
      tokenRefreshed: false,
      error: 'Missing GITHUB_REPO_OWNER or GITHUB_REPO_NAME',
    }
  }

  let token: string
  let tokenRefreshed = false

  try {
    const fresh = await ensureFreshToken()
    token = fresh.token
    tokenRefreshed = true
  } catch (err) {
    return {
      success: false,
      tokenRefreshed: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const fullPath = pathPrefix ? `${pathPrefix}${filePath}` : filePath
  const stubContent = [
    `// ${filePath}`,
    `// BuildOS stub — task ${taskId}`,
    `// Generated: ${new Date().toISOString()}`,
    `// This file is a placeholder. It will be replaced by agent execution.`,
    `// DO NOT EDIT MANUALLY. DO NOT COMMIT CONTENT OVER THIS STUB.`,
    ``,
  ].join('\n')

  // GitHub Tree API: create blob → tree → commit → PATCH ref
  const ghBase = `https://api.github.com`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // Get HEAD
    const refRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/ref/heads/${resolvedBranch}`, { headers })
    if (!refRes.ok) throw new Error(`Cannot get HEAD ref: ${refRes.status}`)
    const refData = (await refRes.json()) as { object: { sha: string } }
    const headSha = refData.object.sha

    // Get base tree
    const commitRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/commits/${headSha}`, { headers })
    if (!commitRes.ok) throw new Error(`Cannot get base commit: ${commitRes.status}`)
    const commitData = (await commitRes.json()) as { tree: { sha: string } }
    const baseTreeSha = commitData.tree.sha

    // Create blob
    const blobRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: stubContent, encoding: 'utf-8' }),
    })
    if (!blobRes.ok) throw new Error(`Cannot create blob: ${blobRes.status}`)
    const blobData = (await blobRes.json()) as { sha: string }

    // Create tree
    const treeRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{ path: fullPath, mode: '100644', type: 'blob', sha: blobData.sha }],
      }),
    })
    if (!treeRes.ok) throw new Error(`Cannot create tree: ${treeRes.status}`)
    const treeData = (await treeRes.json()) as { sha: string }

    // Create commit
    const newCommitRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `[BuildOS] stub: ${filePath} — task ${taskId.slice(0, 8)}`,
        tree: treeData.sha,
        parents: [headSha],
      }),
    })
    if (!newCommitRes.ok) throw new Error(`Cannot create commit: ${newCommitRes.status}`)
    const newCommitData = (await newCommitRes.json()) as { sha: string }

    // Patch ref
    const patchRes = await fetch(`${ghBase}/repos/${resolvedOwner}/${resolvedRepo}/git/refs/heads/${resolvedBranch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommitData.sha, force: false }),
    })
    if (!patchRes.ok) throw new Error(`Cannot update branch ref: ${patchRes.status}`)

    console.log(`[commit-reliability] Stub created: ${fullPath} → commit ${newCommitData.sha.slice(0, 8)}`)

    return { success: true, commitSha: newCommitData.sha, tokenRefreshed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[commit-reliability] createStubFile failed:', msg)
    return { success: false, error: msg, tokenRefreshed }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. verifyCommitDelivery
//    After a commit, confirm the file actually exists at the target path.
//    Uses a FRESH token — not the one used to commit.
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyCommitDelivery(
  filePath: string,
  owner?: string,
  repo?: string,
  branch?: string,
): Promise<VerifyResult> {
  const resolvedOwner  = owner  ?? process.env.GITHUB_REPO_OWNER ?? ''
  const resolvedRepo   = repo   ?? process.env.GITHUB_REPO_NAME  ?? ''
  const resolvedBranch = branch ?? process.env.GITHUB_REPO_BRANCH ?? 'main'
  const pathPrefix     = process.env.GITHUB_REPO_PATH_PREFIX ?? ''
  const fullPath       = pathPrefix ? `${pathPrefix}${filePath}` : filePath

  if (!resolvedOwner || !resolvedRepo) {
    return { verified: false, notes: 'Missing GITHUB_REPO_OWNER or GITHUB_REPO_NAME' }
  }

  let token: string
  try {
    const fresh = await ensureFreshToken()
    token = fresh.token
  } catch (err) {
    return {
      verified: false,
      notes: `Token fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  try {
    const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(
      `https://api.github.com/repos/${resolvedOwner}/${resolvedRepo}/contents/${encodedPath}?ref=${resolvedBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (res.ok) {
      const data = (await res.json()) as { sha: string; size: number }
      const notes = `File exists: size=${data.size} sha=${data.sha?.slice(0, 8)}`
      console.log(`[commit-reliability] Verified: ${fullPath} — ${notes}`)
      return { verified: true, sha: data.sha, notes }
    }

    if (res.status === 404) {
      const notes = `File not found at ${fullPath} on branch ${resolvedBranch}`
      console.warn(`[commit-reliability] Verification FAILED: ${notes}`)
      return { verified: false, notes }
    }

    const notes = `GitHub contents API returned ${res.status} for ${fullPath}`
    console.warn(`[commit-reliability] Verification FAILED: ${notes}`)
    return { verified: false, notes }
  } catch (err) {
    const notes = `Verification request threw: ${err instanceof Error ? err.message : String(err)}`
    console.error('[commit-reliability] verifyCommitDelivery error:', notes)
    return { verified: false, notes }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. logCommitDelivery
//    Insert a row into commit_delivery_logs.
//    Non-fatal: a logging failure must never block the caller.
// ─────────────────────────────────────────────────────────────────────────────

export async function logCommitDelivery(
  admin: SupabaseClient,
  log: CommitDeliveryLog,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('commit_delivery_logs')
      .insert(log)
      .select('id')
      .single()

    if (error) {
      console.warn('[commit-reliability] logCommitDelivery insert failed (non-fatal):', error.message)
      return null
    }

    console.log(`[commit-reliability] Delivery log written: id=${data.id} verified=${log.commit_verified}`)
    return data.id as string
  } catch (err) {
    console.warn('[commit-reliability] logCommitDelivery threw (non-fatal):', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. getFailureCount
//    Count unverified commit deliveries for a task (for escalation trigger).
// ─────────────────────────────────────────────────────────────────────────────

export async function getFailureCount(admin: SupabaseClient, taskId: string): Promise<number> {
  try {
    const { count } = await admin
      .from('commit_delivery_logs')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('commit_verified', false)

    return count ?? 0
  } catch {
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. escalateToIncident
//    Create a P1 incident when commit delivery fails repeatedly.
//    Threshold: ESCALATE_AFTER_FAILURES (default 3).
// ─────────────────────────────────────────────────────────────────────────────

const ESCALATE_AFTER_FAILURES = 3

export async function escalateToIncident(
  admin: SupabaseClient,
  taskId: string,
  projectId: string | null | undefined,
  reason: string,
  deliveryLogId?: string | null,
): Promise<string | null> {
  try {
    const failureCount = await getFailureCount(admin, taskId)
    if (failureCount < ESCALATE_AFTER_FAILURES) {
      console.log(
        `[commit-reliability] Failure count ${failureCount}/${ESCALATE_AFTER_FAILURES} for task ${taskId} — ` +
        `escalation threshold not reached`
      )
      return null
    }

    const title = `Commit delivery failure — task ${taskId.slice(0, 8)} (${failureCount} failures)`
    const description = [
      `Task ${taskId} has failed commit verification ${failureCount} times.`,
      `Most recent failure reason: ${reason}`,
      deliveryLogId ? `Delivery log row: ${deliveryLogId}` : '',
      `Project: ${projectId ?? 'unknown'}`,
    ].filter(Boolean).join('\n')

    const { data: incident, error } = await admin
      .from('incidents')
      .insert({
        title,
        description,
        severity: 'P1',
        incident_type: 'workflow',
        status: 'open',
        owner_domain: 'backend',
        related_task_id: taskId,
      })
      .select('id, incident_code')
      .single()

    if (error) {
      console.error('[commit-reliability] escalateToIncident insert failed:', error.message)
      return null
    }

    console.error(
      `[commit-reliability] ⚠ INCIDENT CREATED: ${incident.incident_code} (${incident.id}) ` +
      `— commit delivery failure on task ${taskId} after ${failureCount} attempts`
    )

    // Update delivery log to mark as escalated
    if (deliveryLogId) {
      await admin
        .from('commit_delivery_logs')
        .update({ escalated: true, incident_id: incident.id })
        .eq('id', deliveryLogId)
    }

    return incident.id as string
  } catch (err) {
    console.error('[commit-reliability] escalateToIncident threw:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. extractCreatePaths
//    Parse context_payload to find intended CREATE file paths for stub creation.
//    Returns empty array if no paths are detectable (non-fatal; stub then skipped).
// ─────────────────────────────────────────────────────────────────────────────

export function extractCreatePaths(contextPayload: Record<string, unknown> | null | undefined): string[] {
  if (!contextPayload || typeof contextPayload !== 'object') return []

  const paths: string[] = []

  // Direct file_path field
  const direct = contextPayload.file_path
  if (typeof direct === 'string' && direct.trim()) paths.push(direct.trim())

  // task_contract.file_path
  const tc = contextPayload.task_contract as Record<string, unknown> | undefined
  if (tc) {
    if (typeof tc.file_path === 'string' && tc.file_path.trim()) paths.push(tc.file_path.trim())
    if (typeof tc.target_file === 'string' && tc.target_file.trim()) paths.push(tc.target_file.trim())

    // files_to_create array
    if (Array.isArray(tc.files_to_create)) {
      for (const f of tc.files_to_create) {
        if (typeof f === 'string' && f.trim()) paths.push(f.trim())
        else if (typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>).path === 'string') {
          paths.push(((f as Record<string, unknown>).path as string).trim())
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(paths)]
}
