// apps/web/src/lib/provision-github.ts
// GitHub repository provisioning using ownership resolver for token selection.
// DO NOT MODIFY: uses fetch (no @octokit/rest) and correct import paths.

import { resolveGitHubToken } from '@/lib/resolve-github-token'

export interface ProvisionGitHubOptions {
  projectId: string
  orgOrOwner: string
  repoName: string
  isPrivate?: boolean
  description?: string
}

export interface ProvisionGitHubResult {
  repoUrl: string
  cloneUrl: string
  defaultBranch: string
  tokenMode: 'user_managed' | 'platform_managed'
}

/**
 * Provisions a GitHub repository for a project.
 * Uses ownership resolver to determine whether to use user or platform token.
 */
export async function provisionGitHub(
  options: ProvisionGitHubOptions,
): Promise<ProvisionGitHubResult> {
  const { projectId, orgOrOwner, repoName, isPrivate = true, description = '' } = options

  const { token, mode: tokenMode } = await resolveGitHubToken(projectId)

  if (!token) {
    throw new Error(
      `[provision-github] No GitHub token available for project=${projectId} (mode=${tokenMode})`,
    )
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }

  const body = JSON.stringify({ name: repoName, private: isPrivate, description })

  // Try org first, fall back to personal account
  const res = await fetch(`https://api.github.com/orgs/${orgOrOwner}/repos`, {
    method: 'POST',
    headers,
    body,
  })

  if (!res.ok) {
    const userRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body,
    })

    if (!userRes.ok) {
      const err = await userRes.text()
      throw new Error(`[provision-github] Repo creation failed: ${err}`)
    }

    const repo = await userRes.json()
    return {
      repoUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch ?? 'main',
      tokenMode,
    }
  }

  const repo = await res.json()
  return {
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: repo.default_branch ?? 'main',
    tokenMode,
  }
}
