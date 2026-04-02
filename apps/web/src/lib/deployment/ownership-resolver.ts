// src/lib/deployment/ownership-resolver.ts

import { createClient } from '@supabase/supabase-js';

export type OwnershipMode = 'user_managed' | 'platform_managed';

export interface ResolvedOwnership {
  mode: OwnershipMode;
  token: string;
  teamId?: string;
  accountId?: string;
  connectionId?: string;
}

export interface ProviderConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class OwnershipResolutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_CONNECTION'
      | 'INACTIVE_CONNECTION'
      | 'MISSING_TOKEN'
      | 'NO_PLATFORM_TOKEN'
      | 'RESOLUTION_FAILED',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OwnershipResolutionError';
  }
}

/**
 * Resolves provider ownership for a given admin user and project.
 *
 * Resolution order:
 * 1. Check if admin has an active provider connection → user_managed
 * 2. Fall through to platform env var → platform_managed
 * 3. Throw if neither is available
 */
export async function resolveProviderOwnership(
  adminUserId: string,
  projectId: string,
  provider: 'vercel' | 'netlify' | 'aws' | 'gcp'
): Promise<ResolvedOwnership> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Attempt to find an active user-managed connection
  const { data: connection, error } = await supabase
    .from('provider_connections')
    .select('*')
    .eq('user_id', adminUserId)
    .eq('provider', provider)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new OwnershipResolutionError(
      `Failed to query provider connections: ${error.message}`,
      'RESOLUTION_FAILED',
      { adminUserId, projectId, provider, supabaseError: error }
    );
  }

  if (connection) {
    const token = connection.access_token;
    if (!token) {
      throw new OwnershipResolutionError(
        `User-managed connection found for ${provider} but access_token is missing`,
        'MISSING_TOKEN',
        { connectionId: connection.id, adminUserId, projectId }
      );
    }

    const metadata = (connection.metadata ?? {}) as Record<string, unknown>;

    return {
      mode: 'user_managed',
      token,
      teamId: (metadata.team_id as string) ?? undefined,
      accountId: (metadata.account_id as string) ?? undefined,
      connectionId: connection.id,
    };
  }

  // 2. Fall through to platform-managed token
  const platformToken = getPlatformToken(provider);
  if (!platformToken) {
    throw new OwnershipResolutionError(
      `No active ${provider} connection for user and no platform token configured`,
      'NO_PLATFORM_TOKEN',
      { adminUserId, projectId, provider, envVar: getPlatformEnvVarName(provider) }
    );
  }

  return {
    mode: 'platform_managed',
    token: platformToken,
    teamId: getPlatformTeamId(provider),
  };
}

function getPlatformToken(provider: string): string | undefined {
  switch (provider) {
    case 'vercel':
      return process.env.VERCEL_TOKEN;
    case 'netlify':
      return process.env.NETLIFY_TOKEN;
    case 'aws':
      return process.env.AWS_ACCESS_KEY_ID;
    case 'gcp':
      return process.env.GCP_SERVICE_ACCOUNT_KEY;
    default:
      return undefined;
  }
}

function getPlatformTeamId(provider: string): string | undefined {
  switch (provider) {
    case 'vercel':
      return process.env.VERCEL_TEAM_ID;
    case 'netlify':
      return process.env.NETLIFY_TEAM_ID;
    default:
      return undefined;
  }
}

function getPlatformEnvVarName(provider: string): string {
  switch (provider) {
    case 'vercel':
      return 'VERCEL_TOKEN';
    case 'netlify':
      return 'NETLIFY_TOKEN';
    case 'aws':
      return 'AWS_ACCESS_KEY_ID';
    default:
      return `${provider.toUpperCase()}_TOKEN`;
  }
}