// src/lib/ownership/resolve-provider-ownership.ts
import { AdminClient } from '@/lib/supabase/admin-client';
import { decrypt } from '@/lib/crypto/token-encryption';
import { OwnershipMode, ResolvedOwnership } from './types';

export class OwnershipResolutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_CONNECTION'
      | 'DECRYPTION_FAILED'
      | 'NO_PLATFORM_TOKEN'
      | 'INVALID_METADATA'
      | 'DB_ERROR',
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OwnershipResolutionError';
  }
}

/**
 * Resolves provider credentials for a given project.
 *
 * Resolution order:
 * 1. Look up provider_connections row for (projectId, provider)
 * 2. If found and mode === 'user_managed' → decrypt stored token + return metadata
 * 3. If found and mode === 'platform_managed' → fall through to env var
 * 4. If not found → fall through to env var (treat as platform_managed)
 *
 * @param admin  - Supabase admin client (service role)
 * @param projectId - Internal project UUID
 * @param provider  - Provider key, e.g. 'vercel' | 'github' | 'aws'
 */
export async function resolveProviderOwnership(
  admin: AdminClient,
  projectId: string,
  provider: string,
): Promise<ResolvedOwnership> {
  // ── 1. Fetch connection row ───────────────────────────────────────────────
  let connection: {
    id: string;
    mode: OwnershipMode;
    encrypted_token: string | null;
    metadata: Record<string, unknown>;
  } | null = null;

  try {
    const { data, error } = await admin
      .from('provider_connections')
      .select('id, mode, encrypted_token, metadata')
      .eq('project_id', projectId)
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      throw new OwnershipResolutionError(
        `DB error fetching provider connection for ${provider}/${projectId}: ${error.message}`,
        'DB_ERROR',
        { projectId, provider, pgError: error },
      );
    }

    connection = data ?? null;
  } catch (err) {
    if (err instanceof OwnershipResolutionError) throw err;
    throw new OwnershipResolutionError(
      `Unexpected error querying provider_connections: ${String(err)}`,
      'DB_ERROR',
      { projectId, provider },
    );
  }

  // ── 2. user_managed path ─────────────────────────────────────────────────
  if (connection && connection.mode === 'user_managed') {
    if (!connection.encrypted_token) {
      throw new OwnershipResolutionError(
        `user_managed connection for ${provider}/${projectId} has no encrypted token`,
        'DECRYPTION_FAILED',
        { connectionId: connection.id },
      );
    }

    let token: string;
    try {
      token = await decrypt(connection.encrypted_token);
    } catch (err) {
      throw new OwnershipResolutionError(
        `Failed to decrypt token for ${provider}/${projectId}: ${String(err)}`,
        'DECRYPTION_FAILED',
        { connectionId: connection.id },
      );
    }

    return {
      mode: 'user_managed',
      token,
      metadata: connection.metadata ?? {},
      connectionId: connection.id,
    };
  }

  // ── 3. platform_managed / no-connection path ─────────────────────────────
  const envVarMap: Record<string, string> = {
    vercel: 'VERCEL_TOKEN',
    github: 'GITHUB_TOKEN',
    aws: 'AWS_ACCESS_KEY_ID', // illustrative; real AWS uses STS
    cloudflare: 'CLOUDFLARE_API_TOKEN',
    supabase: 'SUPABASE_SERVICE_ROLE_KEY',
  };

  const envKey = envVarMap[provider];
  if (!envKey) {
    throw new OwnershipResolutionError(
      `No platform token env var mapping for provider "${provider}"`,
      'NO_PLATFORM_TOKEN',
      { provider },
    );
  }

  const platformToken = process.env[envKey];
  if (!platformToken) {
    throw new OwnershipResolutionError(
      `Platform token env var ${envKey} is not set and no user_managed connection exists for ${provider}/${projectId}`,
      'NO_PLATFORM_TOKEN',
      { provider, projectId, envKey },
    );
  }

  return {
    mode: 'platform_managed',
    token: platformToken,
    metadata: connection?.metadata ?? {},
    connectionId: connection?.id,
  };
}