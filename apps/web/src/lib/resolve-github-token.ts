// apps/web/src/lib/resolve-github-token.ts
// Thin wrapper that resolves a GitHub token using the ownership resolver.
// Uses the established ownership-resolver.ts interface (P11.2).
//
// WS3: Platform fallback now mints a PROJECT installation token instead of
// reading GITHUB_TOKEN/GITHUB_PAT (which are never set for project operations).
// This prevents silent empty-token failures on agent commits.

import { createSign, createPrivateKey } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { resolveProviderOwnership } from '@/lib/ownership-resolver'
import type { OwnershipResolution } from '@/types/provider-connections'

export interface GitHubTokenResult {
  token: string
  mode: 'user_managed' | 'platform_managed' | 'project_installation'
  resolution: OwnershipResolution
}

// ─── Internal: mint a PROJECT installation token ─────────────────────────────
// Used as platform-managed fallback when no user token is configured.
// Reads PROJECT_GITHUB_INSTALLATION_ID → GITHUB_APP_INSTALLATION_ID (shim).
// NEVER reads GITHUB_INSTALLATION_ID (platform path).

function normalizeKey(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').trim()
  if (!pem.startsWith('-----')) {
    try { pem = Buffer.from(pem, 'base64').toString('utf-8').trim() } catch { /* leave as-is */ }
  }
  return pem
}

function mintJWT(appId: string, pem: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString('base64url')
  const input   = `${header}.${payload}`
  const key     = createPrivateKey({ key: pem })
  const signer  = createSign('RSA-SHA256')
  signer.update(input)
  return `${input}.${signer.sign(key, 'base64url')}`
}

async function mintProjectInstallationToken(): Promise<string | null> {
  const appId          = process.env.GITHUB_APP_ID
  const rawKey         = process.env.GITHUB_APP_PRIVATE_KEY
  const installationId = process.env.PROJECT_GITHUB_INSTALLATION_ID
    ?? process.env.GITHUB_APP_INSTALLATION_ID  // legacy shim

  if (!appId || !rawKey || !installationId) return null

  try {
    const pem = normalizeKey(rawKey)
    const jwt = mintJWT(appId, pem)
    const res = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json() as { token: string }
    return data.token ?? null
  } catch {
    return null
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Resolves the correct GitHub token for a project.
 *
 * Resolution order:
 *   1. user_managed   — active provider_connections row with access_token_ref
 *   2. project_installation — PROJECT installation token (minted fresh, App JWT)
 *   3. platform_managed — PLATFORM_GITHUB_PAT / GITHUB_TOKEN (last resort)
 *
 * Never throws — falls back gracefully, but logs when token is empty.
 */
export async function resolveGitHubToken(projectId: string): Promise<GitHubTokenResult> {
  const admin = createAdminSupabaseClient()
  const resolution = await resolveProviderOwnership(admin, projectId, 'github')

  // Step 1: user_managed token from provider_connections
  if (resolution.mode === 'user_managed' && resolution.access_token) {
    return { token: resolution.access_token, mode: 'user_managed', resolution }
  }

  // Step 2: WS3 — mint PROJECT installation token (no PAT required)
  const projectToken = await mintProjectInstallationToken()
  if (projectToken) {
    return { token: projectToken, mode: 'project_installation', resolution }
  }

  // Step 3: PLATFORM_GITHUB_PAT / GITHUB_TOKEN — last resort
  // NOTE: GITHUB_TOKEN is the platform PAT (if set). This path is for platform
  // operations only; per-project commits must not silently reach here.
  const envToken = process.env.PLATFORM_GITHUB_PAT
    ?? process.env.GITHUB_TOKEN
    ?? process.env.GITHUB_PAT
    ?? ''

  if (!envToken) {
    console.error(
      '[resolve-github-token] No usable GitHub token resolved for project=%s. ' +
      'Set PROJECT_GITHUB_INSTALLATION_ID + GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY.',
      projectId,
    )
  }

  return { token: envToken, mode: 'platform_managed', resolution }
}
