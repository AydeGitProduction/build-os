/**
 * github-app-token.ts — WS1: GitHub Token Lifecycle
 *
 * RULES:
 *  - GitHub App installation token is PRIMARY auth path
 *  - PAT (GITHUB_TOKEN / GITHUB_PAT) is FALLBACK only — never default
 *  - NEVER long-cache installation tokens (they expire in 1h; mint fresh per operation)
 *  - On 401/403: discard token → mint new JWT → mint new install token → retry ONCE
 *  - Log auth_refresh event on every retry attempt
 *
 * Usage:
 *   const token = await getInstallationToken()
 *   // use token ... if 401/403 comes back:
 *   const token2 = await refreshInstallationToken()
 *
 * Or use the higher-order wrapper:
 *   const result = await withGitHubAuth(async (token) => {
 *     return ghFetch('/repos/...', token, 'GET')
 *   })
 */

import { createSign } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GitHubAuthConfig {
  appId: string
  privateKeyPem: string
  installationId: string
}

export interface GitHubAuthResult {
  token: string
  mode: 'app_installation' | 'pat_fallback'
  source: string
  mintedAt: number // epoch ms
}

export interface GitHubApiResponse<T = unknown> {
  ok: boolean
  status: number
  data: T
}

// ─────────────────────────────────────────────────────────────────────────────
// Private key normalisation
// ─────────────────────────────────────────────────────────────────────────────

function normalizeKey(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').trim()
  if (!pem.startsWith('-----')) {
    try {
      const decoded = Buffer.from(pem.replace(/\s/g, ''), 'base64').toString('utf8')
      if (decoded.includes('-----BEGIN')) return decoded.replace(/\r\n/g, '\n').trim()
    } catch {
      // leave as-is
    }
  }
  return pem.replace(/\r\n/g, '\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT signing (RS256, no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function signJWT(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const signing = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signing)
  return `${signing}.${b64url(signer.sign(privateKeyPem))}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: mint fresh installation token (NEVER cached)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mints a FRESH GitHub App installation access token.
 * This is called on every critical repo operation — no caching.
 * Installation tokens expire in 1h; minting fresh avoids stale-token 401s.
 */
export async function mintInstallationToken(cfg: GitHubAuthConfig): Promise<string> {
  const jwt = signJWT(cfg.appId, cfg.privateKeyPem)

  const res = await fetch(
    `https://api.github.com/app/installations/${cfg.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `[github-app-token] Installation token mint failed: HTTP ${res.status} — ${body.slice(0, 300)}`,
    )
  }

  const data = (await res.json()) as { token: string }
  return data.token
}

// ─────────────────────────────────────────────────────────────────────────────
// Env-var config loader
// ─────────────────────────────────────────────────────────────────────────────

function loadAppConfig(): GitHubAuthConfig | null {
  const appId = process.env.GITHUB_APP_ID
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY
  const installationId =
    process.env.GITHUB_INSTALLATION_ID ?? process.env.GITHUB_APP_INSTALLATION_ID

  if (!appId || !rawKey || !installationId) return null

  return {
    appId,
    privateKeyPem: normalizeKey(rawKey),
    installationId,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary entry point: get a fresh token (App preferred, PAT fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a fresh GitHub auth token.
 *  - App installation token is PRIMARY (minted fresh every call)
 *  - PAT is FALLBACK only — used when App env vars are missing
 *  - Never returns a cached / potentially-expired installation token
 */
export async function getGitHubToken(): Promise<GitHubAuthResult> {
  const cfg = loadAppConfig()

  if (cfg) {
    try {
      const token = await mintInstallationToken(cfg)
      console.log(
        `[github-app-token] Fresh installation token minted — installationId=${cfg.installationId}`,
      )
      return {
        token,
        mode: 'app_installation',
        source: `github_app/${cfg.installationId}`,
        mintedAt: Date.now(),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[github-app-token] Installation token mint FAILED: ${msg}`)
      console.warn('[github-app-token] Falling back to PAT')
    }
  } else {
    console.warn(
      '[github-app-token] GitHub App env vars missing (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_INSTALLATION_ID) — using PAT fallback',
    )
  }

  // PAT fallback (LAST RESORT)
  const pat = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT
  if (!pat) {
    throw new Error(
      '[github-app-token] No GitHub auth available: App env vars missing AND no GITHUB_TOKEN/GITHUB_PAT set',
    )
  }

  console.warn('[github-app-token] Using PAT fallback — app_installation preferred in production')
  return {
    token: pat,
    mode: 'pat_fallback',
    source: process.env.GITHUB_TOKEN ? 'env:GITHUB_TOKEN' : 'env:GITHUB_PAT',
    mintedAt: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry: forced refresh on 401 / 403
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discards the current token and mints a brand-new one.
 * Called when a GitHub API call returns 401 or 403.
 * Logs auth_refresh event for every call.
 */
export async function refreshGitHubToken(
  reason: '401' | '403' | string,
  context?: string,
): Promise<GitHubAuthResult> {
  console.log(
    `[github-app-token] auth_refresh event — reason=${reason} context=${context ?? 'unknown'}`,
  )
  // Simply mint fresh — the old token is not stored anywhere, so "discard" is implicit
  return getGitHubToken()
}

// ─────────────────────────────────────────────────────────────────────────────
// Higher-order wrapper: auto-retry on 401/403
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs a GitHub API operation with automatic one-shot retry on 401/403.
 *
 * Retry flow (per spec):
 *   1. discard token (implicit — not cached)
 *   2. mint new JWT
 *   3. mint new installation token
 *   4. retry ONCE
 *
 * @param operation  Async function receiving a fresh token; must return { status, ... }
 * @param context    Label for log output (e.g. 'commitFiles', 'verifyRepo')
 */
export async function withGitHubAuth<T extends { status: number }>(
  operation: (token: string) => Promise<T>,
  context = 'unknown',
): Promise<T> {
  // First attempt — fresh token
  const firstAuth = await getGitHubToken()
  console.log(
    `[github-app-token] [${context}] First attempt — mode=${firstAuth.mode} source=${firstAuth.source}`,
  )
  const firstResult = await operation(firstAuth.token)

  if (firstResult.status !== 401 && firstResult.status !== 403) {
    return firstResult
  }

  // 401 / 403 — trigger one-shot refresh
  console.warn(
    `[github-app-token] [${context}] Received HTTP ${firstResult.status} — triggering auth_refresh`,
  )
  const refreshedAuth = await refreshGitHubToken(String(firstResult.status), context)

  console.log(
    `[github-app-token] [${context}] Retry attempt — mode=${refreshedAuth.mode} source=${refreshedAuth.source}`,
  )
  const retryResult = await operation(refreshedAuth.token)

  if (retryResult.status === 401 || retryResult.status === 403) {
    throw new Error(
      `[github-app-token] [${context}] Auth failed after one-shot refresh (HTTP ${retryResult.status}). ` +
        `Check GitHub App installation and permissions.`,
    )
  }

  return retryResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: authenticated GitHub fetch with auto-retry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Makes a GitHub API request with automatic auth refresh on 401/403.
 * Single entry point for all GitHub API calls in the system.
 */
export async function ghFetchWithAuth<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  body?: unknown,
  context = 'ghFetch',
): Promise<GitHubApiResponse<T>> {
  return withGitHubAuth(async (token) => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data: data as T }
  }, context)
}
