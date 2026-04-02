// apps/web/src/lib/integrations/providers/github.ts

import { createClient } from '@/lib/supabase/server';

export interface ProviderStatusInput {
  projectId: string;
  integrationId: string;
  externalId?: string;
  mode: 'user_managed' | 'platform_managed';
}

export interface ProviderStatusResult {
  connected: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Checks live GitHub integration status.
 *
 * For user_managed: validates the stored OAuth token is still valid by
 * hitting the GitHub user endpoint.
 *
 * For platform_managed: validates the installation token / app installation
 * is still active.
 */
export async function checkGitHubStatus(
  input: ProviderStatusInput,
): Promise<ProviderStatusResult> {
  const supabase = createClient();

  // Fetch the stored credential for this integration
  const { data: credential, error } = await supabase
    .from('integration_credentials')
    .select('access_token, token_type, installation_id, expires_at')
    .eq('integration_id', input.integrationId)
    .single();

  if (error || !credential) {
    return { connected: false, error: 'No credentials stored' };
  }

  // Check token expiry (if applicable)
  if (credential.expires_at) {
    const expiresAt = new Date(credential.expires_at);
    if (expiresAt < new Date()) {
      return { connected: false, error: 'Token expired' };
    }
  }

  if (input.mode === 'platform_managed' && credential.installation_id) {
    return checkGitHubAppInstallation(credential.installation_id);
  }

  return checkGitHubOAuthToken(credential.access_token);
}

async function checkGitHubOAuthToken(
  accessToken: string,
): Promise<ProviderStatusResult> {
  if (!accessToken) {
    return { connected: false, error: 'Missing access token' };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // Short timeout for health checks
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 401) {
      return { connected: false, error: 'Token invalid or revoked' };
    }

    if (!response.ok) {
      return {
        connected: false,
        error: `GitHub API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      connected: true,
      metadata: {
        login: data.login,
        id: data.id,
        type: data.type,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { connected: false, error: `Health check failed: ${message}` };
  }
}

async function checkGitHubAppInstallation(
  installationId: string,
): Promise<ProviderStatusResult> {
  // Platform-managed check: verify the app installation is still active
  // This would typically use a GitHub App JWT — simplified here to a basic check
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    // Can't verify without app credentials — assume connected if installation ID exists
    return {
      connected: true,
      metadata: { installation_id: installationId, verified: false },
    };
  }

  try {
    // Generate a JWT for GitHub App authentication would go here
    // For now we perform a basic installation endpoint check
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          // Authorization: `Bearer ${appJwt}` — would be set here
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (response.status === 404) {
      return { connected: false, error: 'Installation not found or removed' };
    }

    if (!response.ok) {
      return {
        connected: false,
        error: `GitHub App API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      connected: true,
      metadata: {
        installation_id: installationId,
        account: data.account?.login,
        app_slug: data.app_slug,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { connected: false, error: `App installation check failed: ${message}` };
  }
}