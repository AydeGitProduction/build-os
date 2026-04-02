// apps/web/src/lib/resolve-github-token.ts

import { resolveProviderOwnership, OwnershipResolution } from './resolve-provider-ownership';

export interface GitHubTokenResult {
  token: string;
  ownershipMode: 'user_managed' | 'platform_managed';
  resolvedBy: OwnershipResolution['resolvedBy'];
  source: 'connection_access_token' | 'env_GITHUB_TOKEN';
}

/**
 * Resolves the correct GitHub token for a given admin + project context.
 *
 * - user_managed:    uses connection.access_token_ref from DB
 * - platform_managed: falls through to process.env.GITHUB_TOKEN
 *
 * Throws if no token can be found regardless of mode.
 */
export async function resolveGitHubToken(
  adminId: string,
  projectId: string
): Promise<GitHubTokenResult> {
  const resolution = await resolveProviderOwnership(adminId, projectId, 'github');

  const logPrefix = `[github-token-resolver] admin=${adminId} project=${projectId}`;

  console.log(
    `${logPrefix} | mode=${resolution.mode} resolvedBy=${resolution.resolvedBy}`
  );

  if (resolution.mode === 'user_managed') {
    const accessToken = resolution.connection?.access_token_ref;

    if (!accessToken) {
      console.error(
        `${logPrefix} | user_managed but connection.access_token_ref is null/empty — ` +
          `connection_id=${resolution.connection?.id ?? 'none'}`
      );
      throw new Error(
        `[resolveGitHubToken] user_managed connection found for project=${projectId} ` +
          `but access_token_ref is missing. Check provider_connections table.`
      );
    }

    console.log(
      `${logPrefix} | resolved token source=connection_access_token ` +
        `connection_id=${resolution.connection?.id}`
    );

    return {
      token: accessToken,
      ownershipMode: 'user_managed',
      resolvedBy: resolution.resolvedBy,
      source: 'connection_access_token',
    };
  }

  // platform_managed — fall through to env var
  const envToken = process.env.GITHUB_TOKEN;

  if (!envToken) {
    console.error(
      `${logPrefix} | platform_managed but GITHUB_TOKEN env var is not set`
    );
    throw new Error(
      `[resolveGitHubToken] platform_managed mode for project=${projectId} ` +
        `but GITHUB_TOKEN environment variable is not configured.`
    );
  }

  console.log(
    `${logPrefix} | resolved token source=env_GITHUB_TOKEN resolvedBy=${resolution.resolvedBy}`
  );

  return {
    token: envToken,
    ownershipMode: 'platform_managed',
    resolvedBy: resolution.resolvedBy,
    source: 'env_GITHUB_TOKEN',
  };
}