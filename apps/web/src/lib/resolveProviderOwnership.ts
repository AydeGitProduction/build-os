// src/lib/resolveProviderOwnership.ts

export type OwnershipModel = 'user_managed' | 'platform_managed';

export interface ProviderConnectionMetadata {
  access_token?: string;
  token?: string;
  team_id?: string;
  org_id?: string;
  [key: string]: unknown;
}

export interface ResolvedOwnership {
  model: OwnershipModel;
  /** Resolved API token — from user connection OR platform env var */
  token: string;
  /** Optional team/org identifier from user connection metadata */
  teamId?: string;
  /** Raw connection metadata (user_managed only) */
  metadata?: ProviderConnectionMetadata;
}

export interface ProviderConnection {
  id: string;
  provider: string;
  ownership_model: OwnershipModel;
  metadata: ProviderConnectionMetadata;
  encrypted_token?: string;
  project_id: string;
  admin_id: string;
}

export class OwnershipResolutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CONNECTION_NOT_FOUND'
      | 'TOKEN_MISSING'
      | 'PROVIDER_MISMATCH'
      | 'PLATFORM_TOKEN_MISSING'
  ) {
    super(message);
    this.name = 'OwnershipResolutionError';
  }
}

// src/lib/resolveProviderOwnership.ts (continued)

import { createClient } from '@supabase/supabase-js';
import { decrypt } from './encryption';
import {
  OwnershipResolutionError,
  ResolvedOwnership,
  ProviderConnection,
} from './types/ownership';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolves provider ownership for a given admin + project + provider combination.
 *
 * - user_managed: returns decrypted token + team_id from the stored connection record
 * - platform_managed: falls through to the corresponding platform env var
 *
 * @param adminId  - UUID of the admin/workspace owner
 * @param projectId - UUID of the project being provisioned
 * @param provider  - Provider slug, e.g. 'vercel', 'github', 'aws'
 */
export async function resolveProviderOwnership(
  adminId: string,
  projectId: string,
  provider: string
): Promise<ResolvedOwnership> {
  // 1. Look up the connection record for this admin + project + provider
  const { data: connection, error } = await supabase
    .from('provider_connections')
    .select('*')
    .eq('admin_id', adminId)
    .eq('project_id', projectId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    throw new OwnershipResolutionError(
      `Database error resolving ownership for provider "${provider}": ${error.message}`,
      'CONNECTION_NOT_FOUND'
    );
  }

  // 2. No connection record found → treat as platform_managed
  if (!connection) {
    return resolvePlatformManaged(provider);
  }

  const conn = connection as ProviderConnection;

  // 3. Explicit ownership model routing
  if (conn.ownership_model === 'user_managed') {
    return resolveUserManaged(conn, provider);
  }

  // 4. platform_managed (or any unknown value defaults to platform)
  return resolvePlatformManaged(provider);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveUserManaged(
  conn: ProviderConnection,
  provider: string
): Promise<ResolvedOwnership> {
  // Prefer encrypted_token field; fall back to metadata.access_token / metadata.token
  let token: string | undefined;

  if (conn.encrypted_token) {
    try {
      token = await decrypt(conn.encrypted_token);
    } catch (err) {
      throw new OwnershipResolutionError(
        `Failed to decrypt token for user-managed "${provider}" connection (id=${conn.id}): ${(err as Error).message}`,
        'TOKEN_MISSING'
      );
    }
  } else if (conn.metadata?.access_token) {
    token = conn.metadata.access_token as string;
  } else if (conn.metadata?.token) {
    token = conn.metadata.token as string;
  }

  if (!token) {
    throw new OwnershipResolutionError(
      `No token found for user-managed "${provider}" connection (id=${conn.id}). ` +
        'Ensure encrypted_token or metadata.access_token is populated.',
      'TOKEN_MISSING'
    );
  }

  // team_id may be stored as team_id or org_id in metadata
  const teamId =
    (conn.metadata?.team_id as string | undefined) ??
    (conn.metadata?.org_id as string | undefined);

  return {
    model: 'user_managed',
    token,
    teamId,
    metadata: conn.metadata,
  };
}

function resolvePlatformManaged(provider: string): ResolvedOwnership {
  const envVarMap: Record<string, string> = {
    vercel: 'VERCEL_TOKEN',
    github: 'GITHUB_TOKEN',
    aws: 'AWS_ACCESS_KEY_ID', // AWS uses a different pattern; handled separately
    stripe: 'STRIPE_SECRET_KEY',
    sendgrid: 'SENDGRID_API_KEY',
  };

  const envVarName = envVarMap[provider.toLowerCase()];

  if (!envVarName) {
    throw new OwnershipResolutionError(
      `No platform env var mapping found for provider "${provider}".`,
      'PROVIDER_MISMATCH'
    );
  }

  const token = process.env[envVarName];

  if (!token) {
    throw new OwnershipResolutionError(
      `Platform-managed token missing: environment variable "${envVarName}" is not set.`,
      'PLATFORM_TOKEN_MISSING'
    );
  }

  return {
    model: 'platform_managed',
    token,
    // No teamId for platform-managed — use platform's own team/account
    teamId: process.env[`${provider.toUpperCase()}_TEAM_ID`],
  };
}