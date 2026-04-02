// apps/web/src/lib/token-vault.ts

/**
 * Dereferences an access_token_ref to an actual token string.
 *
 * Supported ref schemes:
 *   - "env:<VAR_NAME>"         → reads process.env[VAR_NAME]
 *   - "vault:<secret_id>"      → fetches from secrets manager (stubbed)
 *   - "<raw_token>"            → treated as a literal token (dev/test only)
 */
export async function dereferenceTokenRef(
  tokenRef: string,
  context: { adminId: string; provider: string }
): Promise<string> {
  if (!tokenRef) {
    throw new Error(
      `[token-vault] Empty tokenRef for provider=${context.provider} admin=${context.adminId}`
    );
  }

  // Env var indirection: "env:MY_SECRET_VAR"
  if (tokenRef.startsWith('env:')) {
    const varName = tokenRef.slice(4);
    const value = process.env[varName];
    if (!value) {
      throw new Error(
        `[token-vault] Env var "${varName}" referenced by tokenRef is not set`
      );
    }
    return value;
  }

  // Vault indirection: "vault:<secret_id>" — extend for your secrets manager
  if (tokenRef.startsWith('vault:')) {
    const secretId = tokenRef.slice(6);
    return fetchFromVault(secretId, context);
  }

  // Supabase Vault (future): "supabase-vault:<secret_id>"
  if (tokenRef.startsWith('supabase-vault:')) {
    const secretId = tokenRef.slice(15);
    return fetchFromSupabaseVault(secretId);
  }

  // Fallback: treat as raw token (only safe in dev/test)
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[token-vault] Raw token refs are not allowed in production. ` +
        `Use "env:<VAR>" or "vault:<id>" scheme.`
    );
  }

  console.warn(
    `[token-vault] Using raw tokenRef as literal token — ` +
      `provider=${context.provider} (dev/test only)`
  );
  return tokenRef;
}

async function fetchFromVault(
  secretId: string,
  context: { adminId: string; provider: string }
): Promise<string> {
  // TODO: wire to your actual secrets manager (AWS Secrets Manager, GCP Secret Manager, etc.)
  // Example AWS Secrets Manager:
  //
  // import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
  // const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  // const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  // return result.SecretString ?? '';
  throw new Error(
    `[token-vault] Vault backend not configured for secretId="${secretId}" ` +
      `provider=${context.provider} admin=${context.adminId}`
  );
}

async function fetchFromSupabaseVault(secretId: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase.rpc('vault.decrypted_secrets', {
    secret_id: secretId,
  });
  if (error) throw new Error(`[token-vault] Supabase Vault error: ${error.message}`);
  return data?.secret ?? '';
}