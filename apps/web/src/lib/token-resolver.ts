// apps/web/src/lib/token-resolver.ts

/**
 * Resolves an access_token_ref to an actual token string.
 *
 * access_token_ref may be:
 *   - A Vault path:        "vault:secret/github/user-123"
 *   - An env var ref:      "env:GITHUB_TOKEN_USER_123"
 *   - A direct value:      anything else (legacy / dev mode)
 */

const VAULT_PREFIX = 'vault:';
const ENV_PREFIX = 'env:';

export async function resolveAccessToken(accessTokenRef: string): Promise<string> {
  if (!accessTokenRef) {
    throw new Error('[token-resolver] access_token_ref is empty or undefined');
  }

  if (accessTokenRef.startsWith(VAULT_PREFIX)) {
    return resolveFromVault(accessTokenRef.slice(VAULT_PREFIX.length));
  }

  if (accessTokenRef.startsWith(ENV_PREFIX)) {
    return resolveFromEnv(accessTokenRef.slice(ENV_PREFIX.length));
  }

  // Direct value — acceptable in dev/test, logged as warning in production
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[token-resolver] access_token_ref appears to be a raw token value in production. ' +
      'Consider migrating to vault: or env: refs for security.'
    );
  }
  return accessTokenRef;
}

async function resolveFromVault(vaultPath: string): Promise<string> {
  // Integrate with your secret management solution (HashiCorp Vault, AWS SSM, etc.)
  // This is a placeholder that can be swapped for real vault client.
  const { getSecret } = await import('./vault-client');
  const secret = await getSecret(vaultPath);
  if (!secret) {
    throw new Error(`[token-resolver] Vault path "${vaultPath}" returned empty secret`);
  }
  return secret;
}

function resolveFromEnv(envVarName: string): string {
  const value = process.env[envVarName];
  if (!value) {
    throw new Error(
      `[token-resolver] env var "${envVarName}" referenced by access_token_ref is not set`
    );
  }
  return value;
}