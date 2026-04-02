// apps/web/src/lib/integrations/providers/supabase.ts

import { createClient } from '@/lib/supabase/server';
import type { ProviderStatusInput, ProviderStatusResult } from './github';

/**
 * Checks live Supabase integration status.
 * Validates the stored service role key / management API token.
 */
export async function checkSupabaseStatus(
  input: ProviderStatusInput,
): Promise<ProviderStatusResult> {
  const supabase = createClient();

  const { data: credential, error } = await supabase
    .from('integration_credentials')
    .select('access_token, supabase_project_ref, supabase_url, expires_at')
    .eq('integration_id', input.integrationId)
    .single();

  if (error || !credential) {
    return { connected: false, error: 'No credentials stored' };
  }

  if (credential.expires_at) {
    const expiresAt = new Date(credential.expires_at);
    if (expiresAt < new Date()) {
      return { connected: false, error: 'Token expired' };
    }
  }

  const token = credential.access_token;
  if (!token) {
    return { connected: false, error: 'Missing access token' };
  }

  const projectRef =
    input.externalId ?? credential.supabase_project_ref ?? null;

  if (input.mode === 'platform_managed') {
    return checkSupabaseManagementAPI(token, projectRef);
  }

  // User-managed: if we have a project URL + service key, ping the health endpoint
  if (credential.supabase_url) {
    return checkSupabaseProjectHealth(credential.supabase_url, token);
  }

  if (projectRef) {
    return checkSupabaseManagementAPI(token, projectRef);
  }

  return { connected: false, error: 'Insufficient credentials to verify connection' };
}

async function checkSupabaseManagementAPI(
  accessToken: string,
  projectRef: string | null,
): Promise<ProviderStatusResult> {
  try {
    const url = projectRef
      ? `https://api.supabase.com/v1/projects/${projectRef}`
      : 'https://api.supabase.com/v1/projects';

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 401 || response.status === 403) {
      return { connected: false, error: 'Token invalid or insufficient permissions' };
    }

    if (response.status === 404 && projectRef) {
      return { connected: false, error: 'Supabase project not found' };
    }

    if (!response.ok) {
      return {
        connected: false,
        error: `Supabase Management API error: ${response.status}`,
      };
    }

    const data = await response.json();

    if (projectRef) {
      return {
        connected: true,
        metadata: {
          project_ref: data.id ?? projectRef,
          name: data.name,
          region: data.region,
          status: data.status,
          organization_id: data.organization_id,
        },
      };
    }

    // List endpoint
    const projectCount = Array.isArray(data) ? data.length : 0;
    return {
      connected: true,
      metadata: { accessible_projects: projectCount },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      connected: false,
      error: `Supabase management API check failed: ${message}`,
    };
  }
}

async function checkSupabaseProjectHealth(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<ProviderStatusResult> {
  try {
    // Ping the PostgREST health endpoint
    const healthUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/`;

    const response = await fetch(healthUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    // PostgREST returns 200 or a swagger-style response when healthy
    if (response.ok || response.status === 200) {
      return {
        connected: true,
        metadata: { url: supabaseUrl, endpoint_verified: true },
      };
    }

    if (response.status === 401 || response.status === 403) {
      return { connected: false, error: 'Invalid service role key' };
    }

    return {
      connected: false,
      error: `Supabase health check returned ${response.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      connected: false,
      error: `Supabase project health check failed: ${message}`,
    };
  }
}