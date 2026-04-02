// apps/web/src/lib/resolve-provider-ownership.ts

import { createClient } from '@supabase/supabase-js';

export type OwnershipMode = 'user_managed' | 'platform_managed';

export interface ProviderConnection {
  id: string;
  provider: string;
  access_token_ref: string;
  owner_id: string;
  project_id?: string;
  mode: OwnershipMode;
  created_at: string;
  updated_at: string;
}

export interface OwnershipResolution {
  mode: OwnershipMode;
  connection?: ProviderConnection;
  reason: string;
}

/**
 * Resolves how a provider's credentials should be obtained for a given
 * admin user and project combination.
 *
 * - user_managed:  A provider_connection row exists for this user/project,
 *                  use connection.access_token_ref as the credential.
 * - platform_managed: Fall through to platform env vars (e.g. GITHUB_TOKEN).
 */
export async function resolveProviderOwnership(
  adminId: string,
  projectId: string,
  provider: string
): Promise<OwnershipResolution> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn(
      '[resolveProviderOwnership] Supabase env vars missing, falling back to platform_managed'
    );
    return {
      mode: 'platform_managed',
      reason: 'supabase_env_missing',
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Look for a user-managed connection scoped to this project first,
    // then fall back to a user-level connection (no project scope).
    const { data, error } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('owner_id', adminId)
      .eq('provider', provider)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order('project_id', { ascending: false, nullsFirst: false }) // project-scoped first
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[resolveProviderOwnership] DB query error:', error.message);
      return {
        mode: 'platform_managed',
        reason: `db_error: ${error.message}`,
      };
    }

    if (data) {
      return {
        mode: 'user_managed',
        connection: data as ProviderConnection,
        reason: 'provider_connection_found',
      };
    }

    return {
      mode: 'platform_managed',
      reason: 'no_provider_connection',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[resolveProviderOwnership] Unexpected error:', message);
    return {
      mode: 'platform_managed',
      reason: `unexpected_error: ${message}`,
    };
  }
}