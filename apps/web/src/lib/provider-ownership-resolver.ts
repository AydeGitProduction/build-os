// apps/web/src/lib/provider-ownership-resolver.ts

import { createClient } from '@supabase/supabase-js';

export type OwnershipMode = 'user_managed' | 'platform_managed';

export interface ProviderConnection {
  id: string;
  provider: string;
  access_token_ref: string | null;
  ownership_mode: OwnershipMode;
  user_id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface OwnershipResolution {
  mode: OwnershipMode;
  connection: ProviderConnection | null;
  token: string | null;
  resolvedAt: string;
  source: 'user_connection' | 'platform_env' | 'fallback';
}

export interface ResolveOwnershipOptions {
  /** Admin/service-role Supabase client */
  adminClient: ReturnType<typeof createClient>;
  /** User ID (admin or acting user) */
  userId: string;
  /** Optional project ID to scope the lookup */
  projectId: string | null;
  /** Provider key e.g. 'github', 'gitlab' */
  provider: string;
  /** Whether to fall through to env var on failure */
  allowPlatformFallback?: boolean;
}

/**
 * Resolves which ownership mode should be used for a given provider
 * and returns the appropriate token/connection.
 *
 * Resolution logic:
 *  1. Look up active provider connection for (userId, projectId, provider)
 *  2. If found with access_token_ref → user_managed
 *  3. Otherwise → platform_managed (env var fallback)
 */
export async function resolveProviderOwnership(
  options: ResolveOwnershipOptions
): Promise<OwnershipResolution> {
  const {
    adminClient,
    userId,
    projectId,
    provider,
    allowPlatformFallback = true,
  } = options;

  const resolvedAt = new Date().toISOString();

  try {
    // Build query — scope to userId, provider, and optionally projectId
    let query = adminClient
      .from('provider_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (projectId) {
      // Prefer project-scoped connection; fall back to user-level
      const { data: projectScoped, error: projectError } = await query
        .eq('project_id', projectId)
        .maybeSingle();

      if (projectError) {
        console.warn(
          `[ownership-resolver] Error querying project-scoped connection for ` +
          `user=${userId} project=${projectId} provider=${provider}:`,
          projectError.message
        );
      }

      if (projectScoped) {
        return buildResolution(projectScoped, resolvedAt, allowPlatformFallback);
      }

      // Retry without project scope (user-level connection)
      const { data: userScoped, error: userError } = await adminClient
        .from('provider_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('is_active', true)
        .is('project_id', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (userError) {
        console.warn(
          `[ownership-resolver] Error querying user-level connection for ` +
          `user=${userId} provider=${provider}:`,
          userError.message
        );
      }

      if (userScoped) {
        return buildResolution(userScoped, resolvedAt, allowPlatformFallback);
      }
    } else {
      const { data: conn, error } = await query.maybeSingle();

      if (error) {
        console.warn(
          `[ownership-resolver] Error querying connection for ` +
          `user=${userId} provider=${provider}:`,
          error.message
        );
      }

      if (conn) {
        return buildResolution(conn, resolvedAt, allowPlatformFallback);
      }
    }

    // No connection found — fall through to platform_managed
    return buildPlatformManagedResolution(provider, resolvedAt, allowPlatformFallback);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[ownership-resolver] Unexpected error resolving ownership for ` +
      `user=${userId} project=${projectId ?? 'none'} provider=${provider}: ${message}`
    );
    // Safe fallback to platform_managed
    return buildPlatformManagedResolution(provider, resolvedAt, allowPlatformFallback);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildResolution(
  connection: ProviderConnection,
  resolvedAt: string,
  allowPlatformFallback: boolean
): OwnershipResolution {
  if (connection.access_token_ref && connection.access_token_ref.trim() !== '') {
    console.info(
      `[ownership-resolver] Resolved mode=user_managed ` +
      `provider=${connection.provider} ` +
      `connection_id=${connection.id} ` +
      `project=${connection.project_id ?? 'user-level'}`
    );
    return {
      mode: 'user_managed',
      connection,
      token: connection.access_token_ref,
      resolvedAt,
      source: 'user_connection',
    };
  }

  // Connection exists but has no token ref — fall through
  console.warn(
    `[ownership-resolver] Connection ${connection.id} found for ` +
    `provider=${connection.provider} but access_token_ref is empty; ` +
    `falling through to platform_managed`
  );
  return buildPlatformManagedResolution(connection.provider, resolvedAt, allowPlatformFallback);
}

function buildPlatformManagedResolution(
  provider: string,
  resolvedAt: string,
  allowPlatformFallback: boolean
): OwnershipResolution {
  const envToken = getEnvToken(provider);

  if (!allowPlatformFallback || !envToken) {
    console.warn(
      `[ownership-resolver] Resolved mode=platform_managed ` +
      `provider=${provider} — no token available ` +
      `(allowFallback=${allowPlatformFallback} hasEnvToken=${!!envToken})`
    );
    return {
      mode: 'platform_managed',
      connection: null,
      token: null,
      resolvedAt,
      source: 'fallback',
    };
  }

  console.info(
    `[ownership-resolver] Resolved mode=platform_managed ` +
    `provider=${provider} source=env`
  );
  return {
    mode: 'platform_managed',
    connection: null,
    token: envToken,
    resolvedAt,
    source: 'platform_env',
  };
}

function getEnvToken(provider: string): string | null {
  const envMap: Record<string, string | undefined> = {
    github: process.env.GITHUB_TOKEN,
    gitlab: process.env.GITLAB_TOKEN,
    bitbucket: process.env.BITBUCKET_TOKEN,
  };
  return envMap[provider] ?? null;
}