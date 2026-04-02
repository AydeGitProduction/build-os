// apps/web/src/lib/github-token-resolver.ts

import { resolveProviderOwnership } from './resolve-provider-ownership';
import { dereferenceTokenRef } from './token-vault';

export interface GitHubTokenResolution {
  token: string;
  mode: 'user_managed' | 'platform_managed';
  source: string; // for logging/debugging
}

/**
 * Resolves the GitHub token to use for a provisioning operation.
 *
 * Ownership resolution order:
 *   1. Check provider_connections for user-managed token → use it
 *   2. Fall back to GITHUB_TOKEN env var (platform_managed)
 *
 * @param adminId   - The ID of the admin/user initiating the operation
 * @param projectId - The project being provisioned
 * @returns GitHubTokenResolution with the token and metadata
 * @throws  If no token can be resolved from any source
 */
export async function resolveGitHubToken(
  adminId: string,
  projectId: string
): Promise<GitHubTokenResolution> {
  console.log(
    `[github-token-resolver] Resolving GitHub token — adminId=${adminId} projectId=${projectId}`
  );

  const resolution = await resolveProviderOwnership(adminId, projectId, 'github');

  console.log(
    `[github-token-resolver] Ownership resolution mode="${resolution.mode}" ` +
      `reason="${resolution.reason}" adminId=${adminId} projectId=${projectId}`
  );

  // ── user_managed path ─────────────────────────────────────────────────────
  if (resolution.mode === 'user_managed' && resolution.connection) {
    const { access_token_ref, id: connectionId } = resolution.connection;

    console.log(
      `[github-token-resolver] Using user_managed token — ` +
        `connectionId=${connectionId} tokenRef="${maskTokenRef(access_token_ref)}"`
    );

    try {
      const token = await dereferenceTokenRef(access_token_ref, {
        adminId,
        provider: 'github',
      });

      console.log(
        `[github-token-resolver] Successfully dereferenced user_managed token — ` +
          `connectionId=${connectionId}`
      );

      return {
        token,
        mode: 'user_managed',
        source: `provider_connections/${connectionId}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[github-token-resolver] Failed to dereference user_managed token, ` +
          `falling back to platform_managed — error="${message}"`
      );
      // Fall through to platform_managed below
    }
  }

  // ── platform_managed path ─────────────────────────────────────────────────
  const platformToken = process.env.GITHUB_TOKEN;

  if (!platformToken) {
    const errMsg =
      `[github-token-resolver] No GitHub token available — ` +
      `mode=platform_managed but GITHUB_TOKEN is not set. ` +
      `adminId=${adminId} projectId=${projectId}`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  console.log(
    `[github-token-resolver] Using platform_managed token from GITHUB_TOKEN env var — ` +
      `adminId=${adminId} projectId=${projectId}`
  );

  return {
    token: platformToken,
    mode: 'platform_managed',
    source: 'env:GITHUB_TOKEN',
  };
}

/** Mask token refs in logs to avoid leaking secrets */
function maskTokenRef(ref: string): string {
  if (ref.startsWith('env:') || ref.startsWith('vault:') || ref.startsWith('supabase-vault:')) {
    return ref; // safe to log scheme + identifier
  }
  // raw token — mask all but first 4 chars
  return ref.length > 4 ? `${ref.slice(0, 4)}****` : '****';
}