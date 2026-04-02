// apps/web/src/lib/integrations/providers/vercel.ts

import { createClient } from '@/lib/supabase/server';
import type { ProviderStatusInput, ProviderStatusResult } from './github';

/**
 * Checks live Vercel integration status.
 * Hits the Vercel /v9/projects/{id} or /v2/user endpoint to validate the token.
 */
export async function checkVercelStatus(
  input: ProviderStatusInput,
): Promise<ProviderStatusResult> {
  const supabase = createClient();

  const { data: credential, error } = await supabase
    .from('integration_credentials')
    .select('access_token, team_id, vercel_project_id, expires_at')
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

  // If we have a specific Vercel project ID, verify that project is accessible
  if (input.externalId || credential.vercel_project_id) {
    const projectId = input.externalId ?? credential.vercel_project_id;
    return checkVercelProject(token, projectId, credential.team_id ?? undefined);
  }

  // Fall back to checking token validity via user endpoint
  return checkVercelToken(token);
}

async function checkVercelProject(
  token: string,
  vercelProjectId: string,
  teamId?: string,
): Promise<ProviderStatusResult> {
  try {
    const url = new URL(`https://api.vercel.com/v9/projects/${vercelProjectId}`);
    if (teamId) url.searchParams.set('teamId', teamId);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 401 || response.status === 403) {
      return { connected: false, error: 'Token invalid or insufficient permissions' };
    }

    if (response.status === 404) {
      return { connected: false, error: 'Vercel project not found' };
    }

    if (!response.ok) {
      return {
        connected: false,
        error: `Vercel API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      connected: true,
      metadata: {
        vercel_project_id: data.id,
        name: data.name,
        framework: data.framework,
        node_version: data.nodeVersion,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { connected: false, error: `Vercel health check failed: ${message}` };
  }
}

async function checkVercelToken(token: string): Promise<ProviderStatusResult> {
  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 401) {
      return { connected: false, error: 'Token invalid or revoked' };
    }

    if (!response.ok) {
      return { connected: false, error: `Vercel API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      connected: true,
      metadata: {
        username: data.user?.username,
        email: data.user?.email,
        id: data.user?.id,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { connected: false, error: `Vercel token check failed: ${message}` };
  }
}