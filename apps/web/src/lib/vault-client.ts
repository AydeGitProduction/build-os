// src/lib/vault-client.ts
//
// Thin wrapper around token-vault.ts for backward compatibility.
// Files that import { getSecret } from './vault-client' are using an older
// naming convention. The canonical implementation is token-vault.ts.

/**
 * Retrieve a secret by its vault path.
 * Supports the same schemes as dereferenceTokenRef:
 *   - "env:<VAR_NAME>"    → process.env[VAR_NAME]
 *   - "vault:<id>"        → secrets manager (stubbed for non-Vault envs)
 *   - "<raw_value>"       → literal passthrough (dev only)
 */
export async function getSecret(vaultPath: string): Promise<string | null> {
  if (!vaultPath) return null

  // Env var indirection: "env:MY_SECRET"
  if (vaultPath.startsWith('env:')) {
    return process.env[vaultPath.slice(4)] ?? null
  }

  // Vault path: "vault:secret/path" — stubbed; extend with real Vault SDK if needed
  if (vaultPath.startsWith('vault:')) {
    console.warn('[vault-client] Vault integration not configured — vault path:', vaultPath)
    return null
  }

  // Legacy: treat as literal token (dev/test only)
  return vaultPath || null
}
