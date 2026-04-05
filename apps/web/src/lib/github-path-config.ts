/**
 * github-path-config.ts — WS1: GitHub Auth Path Split
 *
 * Splits GitHub authentication into two explicit, non-overlapping paths:
 *
 *   PROJECT PATH  — per-project repo creation, scaffold commits, agent commits
 *                   Owner: AydeGitBuildOS org (installation 120987701)
 *
 *   PLATFORM PATH — Build OS monorepo, platform-level maintenance operations
 *                   Owner: AydeGitProduction user (installation 119933236)
 *
 * ─── New canonical env vars ────────────────────────────────────────────────
 *
 *   PROJECT PATH:
 *     PROJECT_GITHUB_OWNER            e.g. AydeGitBuildOS
 *     PROJECT_GITHUB_INSTALLATION_ID  e.g. 120987701
 *
 *   PLATFORM PATH:
 *     PLATFORM_GITHUB_OWNER           e.g. AydeGitProduction
 *     PLATFORM_GITHUB_REPO            e.g. build-os
 *     PLATFORM_GITHUB_INSTALLATION_ID e.g. 119933236
 *     PLATFORM_GITHUB_PAT             PAT for verify / fallback (optional)
 *
 * ─── Deprecated vars (backward-compat shim only — do not use in new code) ──
 *
 *   GITHUB_ORG                → shim: maps to PROJECT_GITHUB_OWNER
 *   GITHUB_APP_INSTALLATION_ID→ shim: maps to PROJECT_GITHUB_INSTALLATION_ID
 *   GITHUB_INSTALLATION_ID    → shim: maps to PLATFORM_GITHUB_INSTALLATION_ID
 *   GITHUB_REPO_OWNER         → shim: maps to PLATFORM_GITHUB_OWNER
 *   GITHUB_REPO_NAME          → shim: maps to PLATFORM_GITHUB_REPO
 *   GITHUB_TOKEN / GITHUB_PAT → shim: maps to PLATFORM_GITHUB_PAT
 *
 * ─── Rule ──────────────────────────────────────────────────────────────────
 *
 *   Project execution paths MUST call resolveProjectGitHubConfig().
 *   Platform paths MUST call resolvePlatformGitHubConfig().
 *   Neither function reads the other path's vars.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ProjectGitHubConfig {
  /** GitHub org/user where new project repos are created — e.g. AydeGitBuildOS */
  owner: string
  /** GitHub App installation ID for the project org — e.g. 120987701 */
  installationId: string
  /** GitHub App ID (shared credential) */
  appId: string
  /** RSA private key PEM (shared credential) */
  privateKey: string
  /** Default branch for new repos */
  branch: string
}

export interface PlatformGitHubConfig {
  /** Platform monorepo owner — e.g. AydeGitProduction */
  owner: string
  /** Platform monorepo name — e.g. build-os */
  repo: string
  /** GitHub App installation ID for the platform owner — e.g. 119933236 */
  installationId: string
  /** GitHub App ID (shared credential) */
  appId: string
  /** RSA private key PEM (shared credential) */
  privateKey: string
  /** Optional PAT for verification paths */
  pat?: string
  /** Default branch */
  branch: string
  /** Monorepo path prefix — e.g. apps/web/ */
  pathPrefix: string
}

// ─── Resolution functions ─────────────────────────────────────────────────────

/**
 * Resolve PROJECT GitHub config.
 * Only reads PROJECT_* vars.
 * Backward-compat shim: falls back to GITHUB_ORG / GITHUB_APP_INSTALLATION_ID.
 * NEVER reads GITHUB_INSTALLATION_ID (platform path).
 */
export function resolveProjectGitHubConfig(): ProjectGitHubConfig {
  const owner = process.env.PROJECT_GITHUB_OWNER
    ?? process.env.GITHUB_ORG
    ?? ''
  const installationId = process.env.PROJECT_GITHUB_INSTALLATION_ID
    ?? process.env.GITHUB_APP_INSTALLATION_ID
    ?? ''

  // P7.6: Fail-fast — NEVER silently use empty string for required project path vars.
  // If PROJECT_GITHUB_INSTALLATION_ID is missing, commits will silently target the
  // wrong repo or fail with a cryptic auth error. Throw early with a clear message.
  if (!installationId) {
    throw new Error(
      '[github-config] MISSING: PROJECT_GITHUB_INSTALLATION_ID (or GITHUB_APP_INSTALLATION_ID). ' +
      'Set this env var to the GitHub App installation ID for the project org (e.g. 120987701). ' +
      'Project path cannot proceed without it.'
    )
  }
  if (!owner) {
    throw new Error(
      '[github-config] MISSING: PROJECT_GITHUB_OWNER (or GITHUB_ORG). ' +
      'Set this to the GitHub org where project repos are created (e.g. AydeGitBuildOS).'
    )
  }

  // P7.6: Canonical logging — always visible in Vercel function logs
  console.log(
    `[github-config] path=project owner=${owner} installation_id=${installationId} ` +
    `(source: ${process.env.PROJECT_GITHUB_INSTALLATION_ID ? 'PROJECT_GITHUB_INSTALLATION_ID' : 'GITHUB_APP_INSTALLATION_ID (legacy shim)'})`
  )

  return {
    owner,
    installationId,
    appId:      process.env.GITHUB_APP_ID ?? '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY ?? '',
    branch:     process.env.GITHUB_REPO_BRANCH ?? 'main',
  }
}

/**
 * Resolve PLATFORM GitHub config.
 * Only reads PLATFORM_* vars.
 * Backward-compat shim: falls back to GITHUB_INSTALLATION_ID / GITHUB_REPO_*.
 * NEVER reads PROJECT_* vars or GITHUB_ORG.
 */
export function resolvePlatformGitHubConfig(): PlatformGitHubConfig {
  const owner = process.env.PLATFORM_GITHUB_OWNER
    ?? process.env.GITHUB_REPO_OWNER
    ?? ''
  const repo = process.env.PLATFORM_GITHUB_REPO
    ?? process.env.GITHUB_REPO_NAME
    ?? ''
  const installationId = process.env.PLATFORM_GITHUB_INSTALLATION_ID
    ?? process.env.GITHUB_INSTALLATION_ID
    ?? ''

  // P7.6: Fail-fast — platform path requires its own installation ID.
  // PLATFORM_GITHUB_INSTALLATION_ID = 119933236 (AydeGitProduction).
  // Must NEVER fall back to PROJECT_GITHUB_INSTALLATION_ID (project org).
  if (!installationId) {
    throw new Error(
      '[github-config] MISSING: PLATFORM_GITHUB_INSTALLATION_ID (or GITHUB_INSTALLATION_ID). ' +
      'Set this env var to 119933236 (AydeGitProduction installation). ' +
      'Platform path cannot proceed without it.'
    )
  }

  // P7.6: Canonical logging
  console.log(
    `[github-config] path=platform owner=${owner} repo=${repo} installation_id=${installationId} ` +
    `(source: ${process.env.PLATFORM_GITHUB_INSTALLATION_ID ? 'PLATFORM_GITHUB_INSTALLATION_ID' : 'GITHUB_INSTALLATION_ID (legacy shim)'})`
  )

  return {
    owner,
    repo,
    installationId,
    appId:      process.env.GITHUB_APP_ID ?? '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY ?? '',
    pat:        process.env.PLATFORM_GITHUB_PAT ?? process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT,
    branch:     process.env.GITHUB_REPO_BRANCH ?? 'main',
    pathPrefix: process.env.GITHUB_REPO_PATH_PREFIX ?? '',
  }
}

/**
 * Validate that a project config has all required fields.
 * Returns list of missing fields; empty array = valid.
 */
export function validateProjectConfig(cfg: ProjectGitHubConfig): string[] {
  const missing: string[] = []
  if (!cfg.owner)          missing.push('PROJECT_GITHUB_OWNER (or GITHUB_ORG)')
  if (!cfg.installationId) missing.push('PROJECT_GITHUB_INSTALLATION_ID (or GITHUB_APP_INSTALLATION_ID)')
  if (!cfg.appId)          missing.push('GITHUB_APP_ID')
  if (!cfg.privateKey)     missing.push('GITHUB_APP_PRIVATE_KEY')
  return missing
}

/**
 * Validate that a platform config has all required fields.
 * Returns list of missing fields; empty array = valid.
 */
export function validatePlatformConfig(cfg: PlatformGitHubConfig): string[] {
  const missing: string[] = []
  if (!cfg.owner)          missing.push('PLATFORM_GITHUB_OWNER (or GITHUB_REPO_OWNER)')
  if (!cfg.repo)           missing.push('PLATFORM_GITHUB_REPO (or GITHUB_REPO_NAME)')
  if (!cfg.installationId) missing.push('PLATFORM_GITHUB_INSTALLATION_ID (or GITHUB_INSTALLATION_ID)')
  if (!cfg.appId)          missing.push('GITHUB_APP_ID')
  if (!cfg.privateKey)     missing.push('GITHUB_APP_PRIVATE_KEY')
  return missing
}
