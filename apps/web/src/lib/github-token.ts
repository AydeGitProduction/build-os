// apps/web/src/lib/github-token.ts

/**
 * Shared token-resolution logic for GitHub operations.
 * Extracted to avoid duplication across provision-github.ts and commit-reliability.ts.
 */

import {
  resolveProviderOwnership,
  type OwnershipResolution,
} from '@/lib/resolve-provider-ownership';

export interface GitHubTokenContext {
  adminId: string;
  projectId: string;
}

export interface ResolvedGitHubToken {
  token: string;
  mode: 'user_managed' | 'platform_managed';
  connectionId: string | null;
}

/**
 * Resolves the GitHub token to use for a given admin + project context.
 * Throws if no token is available from either source.
 */
export async function resolveGitHubToken(
  ctx: GitHubTokenContext,
  logTag: string
): Promise<ResolvedGitHubToken> {
  const resolution = await resolveProviderOwnership(
    ctx.adminId,
    ctx.projectId,
    'github'
  );

  return tokenFromResolution(resolution, logTag);
}

/**
 * Synchronously resolves a token from an already-fetched resolution.
 * Throws if no valid token exists.
 */
export function tokenFromResolution(
  resolution: OwnershipResolution,
  logTag: string
): ResolvedGitHubToken {
  if (resolution.mode === 'user_managed' && resolution.token) {
    console.info(
      `${logTag} [github-token] user_managed | ` +
      `connection=${resolution.connection?.id} | ` +
      `account=${resolution.connection?.provider_account_login ?? 'unknown'}`
    );
    return {
      token: resolution.token,
      mode: 'user_managed',
      connectionId: resolution.connection?.id ?? null,
    };
  }

  // Fall through to platform token
  const envToken = process.env.GITHUB_TOKEN;

  console.info(
    `${logTag} [github-token] platform_managed | env_token_present=${!!envToken}`
  );

  if (!envToken) {
    throw new Error(
      `No GitHub token available for ${logTag}. ` +
      `Resolution mode: ${resolution.mode}. ` +
      `Set GITHUB_TOKEN env var or connect a GitHub account.`
    );
  }

  return {
    token: envToken,
    mode: 'platform_managed',
    connectionId: resolution.connection?.id ?? null,
  };
}