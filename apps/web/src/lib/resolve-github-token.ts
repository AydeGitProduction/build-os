// apps/web/src/lib/resolve-github-token.ts
// Thin wrapper that resolves a GitHub token using the ownership resolver.
// Uses the established ownership-resolver.ts interface (P11.2).

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { resolveProviderOwnership } from '@/lib/ownership-resolver'
import type { OwnershipResolution } from '@/types/provider-connections'

export interface GitHubTokenResult {
  token: string
  mode: 'user_managed' | 'platform_managed'
  resolution: OwnershipResolution
}

/**
 * Resolves the correct GitHub token for a project.
 *
 * user_managed:   uses the workspace's active provider_connections row
 * platform_managed: falls through to process.env.GITHUB_TOKEN
 *
 * Never throws — falls back to platform token if anything fails.
 */
export async function resolveGitHubToken(projectId: string): Promise<GitHubTokenResult> {
  const admin = createAdminSupabaseClient()
  const resolution = await resolveProviderOwnership(admin, projectId, 'github')

  if (resolution.mode === 'user_managed' && resolution.access_token) {
    return {
      token: resolution.access_token,
      mode: 'user_managed',
      resolution,
    }
  }

  // Platform-managed fallback
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT ?? ''
  return {
    token: envToken,
    mode: 'platform_managed',
    resolution,
  }
}
