// apps/web/src/lib/ownership-resolver.ts

import { SupabaseClient } from '@supabase/supabase-js'
import type { OwnershipResolution, ProviderSlug } from '@/types/provider-connections'
import { getActiveConnection } from '@/lib/provider-connections'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Buffer window (ms) before actual expiry to treat a token as expired */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a token_expires_at timestamp indicates the token is
 * within TOKEN_EXPIRY_BUFFER_MS of expiring (or already expired).
 *
 * If token_expires_at is null/undefined the token is treated as non-expiring
 * and this function returns false (i.e. the token is still usable).
 */
function isTokenExpiredOrExpiringSoon(tokenExpiresAt: string | null | undefined): boolean {
  if (tokenExpiresAt == null) {
    // No expiry recorded — token does not expire
    return false
  }

  const expiryMs = new Date(tokenExpiresAt).getTime()

  if (Number.isNaN(expiryMs)) {
    // Malformed date — treat as expired to be safe
    console.warn('[ownership-resolver] Malformed token_expires_at value:', tokenExpiresAt)
    return true
  }

  const nowPlusBuffer = Date.now() + TOKEN_EXPIRY_BUFFER_MS
  return expiryMs < nowPlusBuffer
}

// ---------------------------------------------------------------------------
// Primary export: resolveProviderOwnership
// ---------------------------------------------------------------------------

/**
 * Resolves the ownership mode and credentials to use when making provider API
 * calls on behalf of a project.
 *
 * Algorithm (WS4-T1):
 *  1. Fetch project → get workspace_id
 *  2. getActiveConnection(admin, workspace_id, provider)
 *  3. If connection found AND connection.status === 'active':
 *       a. Check token expiry — if expiring within 5 min, fall through to step 4
 *       b. Return user_managed resolution with credentials
 *  4. Otherwise return platform_managed with an appropriate fallback_reason
 *
 * NOTE (P11.2): access_token_ref stores the raw token; encryption arrives in P11.3.
 * NOTE: This function NEVER throws — all errors produce a platform_managed result.
 */
export async function resolveProviderOwnership(
  admin: SupabaseClient,
  projectId: string,
  provider: ProviderSlug,
): Promise<OwnershipResolution> {
  // -------------------------------------------------------------------------
  // Step 1: Fetch project → get workspace_id
  // -------------------------------------------------------------------------
  let workspaceId: string

  try {
    const { data: project, error } = await admin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single()

    if (error) {
      console.error('[ownership-resolver] Failed to fetch project', {
        projectId,
        provider,
        error: error.message,
      })
      const resolution: OwnershipResolution = {
        mode: 'platform_managed',
        fallback_reason: 'no_active_connection',
      }
      console.log('[ownership-resolver] Resolved', {
        projectId,
        provider,
        mode: resolution.mode,
        fallback_reason: resolution.fallback_reason,
      })
      return resolution
    }

    if (!project?.workspace_id) {
      console.error('[ownership-resolver] Project has no workspace_id', { projectId, provider })
      const resolution: OwnershipResolution = {
        mode: 'platform_managed',
        fallback_reason: 'no_active_connection',
      }
      console.log('[ownership-resolver] Resolved', {
        projectId,
        provider,
        mode: resolution.mode,
        fallback_reason: resolution.fallback_reason,
      })
      return resolution
    }

    workspaceId = project.workspace_id as string
  } catch (err) {
    console.error('[ownership-resolver] Unexpected error fetching project', {
      projectId,
      provider,
      err,
    })
    const resolution: OwnershipResolution = {
      mode: 'platform_managed',
      fallback_reason: 'no_active_connection',
    }
    console.log('[ownership-resolver] Resolved', {
      projectId,
      provider,
      mode: resolution.mode,
      fallback_reason: resolution.fallback_reason,
    })
    return resolution
  }

  // -------------------------------------------------------------------------
  // Step 2: getActiveConnection(admin, workspace_id, provider)
  // -------------------------------------------------------------------------
  let connection: Awaited<ReturnType<typeof getActiveConnection>>

  try {
    connection = await getActiveConnection(admin, workspaceId, provider)
  } catch (err) {
    console.error('[ownership-resolver] getActiveConnection threw unexpectedly', {
      projectId,
      workspaceId,
      provider,
      err,
    })
    const resolution: OwnershipResolution = {
      mode: 'platform_managed',
      fallback_reason: 'no_active_connection',
    }
    console.log('[ownership-resolver] Resolved', {
      projectId,
      provider,
      mode: resolution.mode,
      fallback_reason: resolution.fallback_reason,
    })
    return resolution
  }

  // -------------------------------------------------------------------------
  // Step 3: If connection found AND connection.status === 'active'
  // -------------------------------------------------------------------------
  if (connection && connection.status === 'active') {
    // Step 3a: Check token expiry
    const expiring = isTokenExpiredOrExpiringSoon(connection.token_expires_at)

    if (!expiring) {
      // Step 3b: Return user_managed resolution
      const resolution: OwnershipResolution = {
        mode: 'user_managed',
        connection_id: connection.id,
        // In P11.2 access_token_ref holds the raw token directly.
        // In P11.3 this will be replaced with a decryption call.
        access_token: connection.access_token_ref ?? undefined,
        team_id: (connection.metadata as Record<string, unknown> | null)?.team_id as
          | string
          | undefined,
        account_name: connection.provider_account_name ?? undefined,
      }

      console.log('[ownership-resolver] Resolved', {
        projectId,
        provider,
        mode: resolution.mode,
        connection_id: resolution.connection_id,
        has_token: resolution.access_token != null,
        has_team_id: resolution.team_id != null,
      })

      return resolution
    }

    // Token is expired / expiring soon — fall through to step 4 with reason
    console.warn('[ownership-resolver] Token expired or expiring soon, falling back', {
      projectId,
      workspaceId,
      provider,
      connection_id: connection.id,
      token_expires_at: connection.token_expires_at,
    })

    const resolution: OwnershipResolution = {
      mode: 'platform_managed',
      fallback_reason: 'token_expired',
    }

    console.log('[ownership-resolver] Resolved', {
      projectId,
      provider,
      mode: resolution.mode,
      fallback_reason: resolution.fallback_reason,
    })

    return resolution
  }

  // -------------------------------------------------------------------------
  // Step 4: Otherwise return platform_managed
  // -------------------------------------------------------------------------
  const fallback_reason = connection ? 'token_expired' : 'no_active_connection'

  const resolution: OwnershipResolution = {
    mode: 'platform_managed',
    fallback_reason,
  }

  console.log('[ownership-resolver] Resolved', {
    projectId,
    provider,
    mode: resolution.mode,
    fallback_reason: resolution.fallback_reason,
  })

  return resolution
}

// ---------------------------------------------------------------------------
// Export: hasUserConnection
// ---------------------------------------------------------------------------

/**
 * Quick check: does this workspace have any active user connection for the
 * given provider?
 *
 * Returns false on any error (never throws).
 */
export async function hasUserConnection(
  admin: SupabaseClient,
  workspaceId: string,
  provider: ProviderSlug,
): Promise<boolean> {
  try {
    const connection = await getActiveConnection(admin, workspaceId, provider)

    if (!connection || connection.status !== 'active') {
      return false
    }

    // Also check the token isn't already expired / expiring soon
    if (isTokenExpiredOrExpiringSoon(connection.token_expires_at)) {
      return false
    }

    return true
  } catch (err) {
    console.error('[ownership-resolver] hasUserConnection error', {
      workspaceId,
      provider,
      err,
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// Export: isResolutionUsable
// ---------------------------------------------------------------------------

/**
 * Validates that a previously-resolved OwnershipResolution is still usable.
 *
 * For user_managed:
 *  - Must have an access_token present
 *  - access_token must not be an empty string
 *  (Token expiry was already checked at resolution time; if the caller caches
 *   a resolution and wants to re-validate, they should call
 *   resolveProviderOwnership() again rather than relying solely on this check.)
 *
 * For platform_managed:
 *  - Always considered usable (the platform credentials are managed externally)
 */
export function isResolutionUsable(resolution: OwnershipResolution): boolean {
  if (resolution.mode === 'platform_managed') {
    // Platform credentials are managed outside this layer — always usable
    return true
  }

  // user_managed: we need a valid token
  if (!resolution.access_token || resolution.access_token.trim() === '') {
    console.warn('[ownership-resolver] isResolutionUsable: user_managed resolution has no token', {
      connection_id: resolution.connection_id,
    })
    return false
  }

  return true
}