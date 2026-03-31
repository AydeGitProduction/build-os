// src/lib/provider-connections.ts
//
// Service layer for all provider_connections DB operations.
//
// RULES:
//   - ALL database access for provider_connections goes through this module.
//   - Always use the admin (service_role) SupabaseClient — RLS is for frontend.
//   - All mutations verify connectionId belongs to the expected workspaceId.
//   - Errors are re-thrown with a '[provider-connections]' prefix.
//   - All mutations are logged at info level via console.log.
//
// Phase: P11.2 — Provider Connections Foundation
// Workstream: WS1 — Provider Connection Model

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProviderConnection,
  CreateProviderConnectionInput,
  ConnectionStatus,
} from '@/types/provider-connections'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * The canonical table name. Centralised so a rename only touches one place.
 */
const TABLE = 'provider_connections'

/**
 * Fetch a raw connection row by ID and workspace, using the admin client.
 * Returns null if not found. Throws on DB error.
 *
 * Used internally as the basis for workspace-ownership guards.
 */
async function _fetchConnectionRow(
  admin: SupabaseClient,
  connectionId: string,
  workspaceId: string,
): Promise<ProviderConnection | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[provider-connections] _fetchConnectionRow failed: ${error.message}`,
    )
  }

  return data as ProviderConnection | null
}

/**
 * Assert that a connection exists for the given connectionId + workspaceId.
 * Throws a descriptive error (rather than silently no-oping) if the row
 * is not found, which surfaces cross-workspace misuse or stale IDs.
 */
async function _assertOwnership(
  admin: SupabaseClient,
  connectionId: string,
  workspaceId: string,
  operationName: string,
): Promise<ProviderConnection> {
  const row = await _fetchConnectionRow(admin, connectionId, workspaceId)

  if (!row) {
    throw new Error(
      `[provider-connections] ${operationName} failed: ` +
        `connection '${connectionId}' not found or does not belong to ` +
        `workspace '${workspaceId}'`,
    )
  }

  return row
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new provider connection.
 *
 * Status defaults to 'pending'. The caller may supply optional token
 * references if they are already known at creation time (unusual but
 * supported for programmatic integrations).
 *
 * @param admin     Service-role Supabase client.
 * @param input     Fields for the new connection row.
 * @returns         The newly created ProviderConnection row.
 */
export async function createProviderConnection(
  admin: SupabaseClient,
  input: CreateProviderConnectionInput,
): Promise<ProviderConnection> {
  const payload = {
    workspace_id: input.workspace_id,
    provider: input.provider,
    status: 'pending' as ConnectionStatus,
    provider_account_id: input.provider_account_id ?? null,
    provider_account_name: input.provider_account_name ?? null,
    access_token_ref: input.access_token_ref ?? null,
    refresh_token_ref: input.refresh_token_ref ?? null,
    token_expires_at: input.token_expires_at ?? null,
    scopes: input.scopes ?? null,
    metadata: input.metadata ?? null,
    last_validated_at: null,
    last_validation_error: null,
  }

  const { data, error } = await admin
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(
      `[provider-connections] createProviderConnection failed: ${error.message}`,
    )
  }

  const connection = data as ProviderConnection

  console.log('[provider-connections] createProviderConnection', {
    connectionId: connection.id,
    workspaceId: connection.workspace_id,
    provider: connection.provider,
    status: connection.status,
  })

  return connection
}

/**
 * Fetch the single *active* connection for a workspace + provider pair.
 *
 * Returns null if no active connection exists. If multiple active rows
 * exist (data integrity issue), the most recently updated one is returned.
 *
 * @param admin        Service-role Supabase client.
 * @param workspaceId  Owning workspace.
 * @param provider     Provider slug, e.g. 'github', 'slack'.
 */
export async function getActiveConnection(
  admin: SupabaseClient,
  workspaceId: string,
  provider: string,
): Promise<ProviderConnection | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[provider-connections] getActiveConnection failed: ${error.message}`,
    )
  }

  return data as ProviderConnection | null
}

/**
 * Fetch all connections (any status) for a workspace, ordered by
 * provider then creation date.
 *
 * @param admin        Service-role Supabase client.
 * @param workspaceId  Owning workspace.
 */
export async function listWorkspaceConnections(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<ProviderConnection[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('provider', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(
      `[provider-connections] listWorkspaceConnections failed: ${error.message}`,
    )
  }

  return (data ?? []) as ProviderConnection[]
}

/**
 * Fetch a single connection by its ID, with a workspace ownership guard.
 *
 * Returns null if the connection does not exist *or* does not belong to
 * the specified workspace (no cross-workspace leakage).
 *
 * @param admin         Service-role Supabase client.
 * @param connectionId  UUID of the target connection.
 * @param workspaceId   Expected owning workspace.
 */
export async function getConnectionById(
  admin: SupabaseClient,
  connectionId: string,
  workspaceId: string,
): Promise<ProviderConnection | null> {
  // _fetchConnectionRow already filters on both id and workspace_id.
  try {
    return await _fetchConnectionRow(admin, connectionId, workspaceId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[provider-connections] getConnectionById failed: ${message}`,
    )
  }
}

/**
 * Update the status of a connection, with optional additional field updates.
 *
 * Performs a workspace-ownership check before writing to prevent
 * cross-workspace mutations.
 *
 * @param admin         Service-role Supabase client.
 * @param connectionId  Target connection UUID.
 * @param status        New ConnectionStatus value.
 * @param fields        Optional additional columns to update simultaneously.
 */
export async function updateConnectionStatus(
  admin: SupabaseClient,
  connectionId: string,
  status: ConnectionStatus,
  fields?: Partial<ProviderConnection>,
): Promise<void> {
  // Derive workspaceId for the ownership check.
  // When `fields` carries a workspace_id we use that; otherwise we must
  // look it up first. In practice callers should always know the workspace.
  // We do a lightweight fetch to get it when not provided.
  let workspaceId: string | undefined = fields?.workspace_id

  if (!workspaceId) {
    // Minimal fetch — only need workspace_id for the guard.
    const { data, error } = await admin
      .from(TABLE)
      .select('workspace_id')
      .eq('id', connectionId)
      .maybeSingle()

    if (error) {
      throw new Error(
        `[provider-connections] updateConnectionStatus lookup failed: ${error.message}`,
      )
    }

    if (!data) {
      throw new Error(
        `[provider-connections] updateConnectionStatus failed: ` +
          `connection '${connectionId}' not found`,
      )
    }

    workspaceId = (data as { workspace_id: string }).workspace_id
  }

  // Now assert ownership.
  await _assertOwnership(admin, connectionId, workspaceId, 'updateConnectionStatus')

  // Build the update payload. Strip out immutable fields that must not be
  // overwritten (id, workspace_id, created_at) even if accidentally passed.
  const { id: _id, workspace_id: _ws, created_at: _ca, ...safeFields } =
    fields ?? {}

  const payload: Record<string, unknown> = {
    ...safeFields,
    status,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await admin
    .from(TABLE)
    .update(payload)
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    throw new Error(
      `[provider-connections] updateConnectionStatus failed: ${updateError.message}`,
    )
  }

  console.log('[provider-connections] updateConnectionStatus', {
    connectionId,
    workspaceId,
    status,
    extraFields: Object.keys(safeFields),
  })
}

/**
 * Activate a connection after a successful OAuth callback or token exchange.
 *
 * Sets status → 'active' and records the provider account identity plus
 * token references. Any pre-existing validation errors are cleared.
 *
 * @param admin         Service-role Supabase client.
 * @param connectionId  Target connection UUID.
 * @param info          Identity and token data from the OAuth provider.
 * @returns             The updated ProviderConnection row.
 */
export async function activateConnection(
  admin: SupabaseClient,
  connectionId: string,
  info: {
    provider_account_id: string
    provider_account_name: string
    access_token_ref: string
    token_expires_at?: string
    scopes?: string[]
    metadata?: Record<string, unknown>
  },
): Promise<ProviderConnection> {
  // Fetch current row to get workspaceId for the ownership guard.
  const { data: currentRow, error: fetchError } = await admin
    .from(TABLE)
    .select('workspace_id')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(
      `[provider-connections] activateConnection lookup failed: ${fetchError.message}`,
    )
  }

  if (!currentRow) {
    throw new Error(
      `[provider-connections] activateConnection failed: ` +
        `connection '${connectionId}' not found`,
    )
  }

  const workspaceId = (currentRow as { workspace_id: string }).workspace_id

  // Ownership guard.
  await _assertOwnership(admin, connectionId, workspaceId, 'activateConnection')

  const payload: Record<string, unknown> = {
    status: 'active' as ConnectionStatus,
    provider_account_id: info.provider_account_id,
    provider_account_name: info.provider_account_name,
    access_token_ref: info.access_token_ref,
    token_expires_at: info.token_expires_at ?? null,
    scopes: info.scopes ?? null,
    // Preserve existing metadata if none supplied; merge would require
    // a read-modify-write — callers should pass the full desired metadata.
    ...(info.metadata !== undefined ? { metadata: info.metadata } : {}),
    // Clear any previous validation error on successful activation.
    last_validation_error: null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from(TABLE)
    .update(payload)
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) {
    throw new Error(
      `[provider-connections] activateConnection failed: ${error.message}`,
    )
  }

  const connection = data as ProviderConnection

  console.log('[provider-connections] activateConnection', {
    connectionId,
    workspaceId,
    provider: connection.provider,
    providerAccountId: info.provider_account_id,
    providerAccountName: info.provider_account_name,
  })

  return connection
}

/**
 * Revoke a connection — marks it as revoked and clears all token references.
 *
 * This does NOT call the provider's revocation endpoint; that is the
 * responsibility of the caller (e.g. an OAuth revocation route).
 *
 * @param admin         Service-role Supabase client.
 * @param connectionId  Target connection UUID.
 */
export async function revokeConnection(
  admin: SupabaseClient,
  connectionId: string,
): Promise<void> {
  // Fetch current row to get workspaceId for the ownership guard.
  const { data: currentRow, error: fetchError } = await admin
    .from(TABLE)
    .select('workspace_id, provider')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(
      `[provider-connections] revokeConnection lookup failed: ${fetchError.message}`,
    )
  }

  if (!currentRow) {
    throw new Error(
      `[provider-connections] revokeConnection failed: ` +
        `connection '${connectionId}' not found`,
    )
  }

  const { workspace_id: workspaceId, provider } = currentRow as {
    workspace_id: string
    provider: string
  }

  // Ownership guard.
  await _assertOwnership(admin, connectionId, workspaceId, 'revokeConnection')

  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'revoked' as ConnectionStatus,
      // Clear token references — they are no longer valid.
      access_token_ref: null,
      refresh_token_ref: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)

  if (error) {
    throw new Error(
      `[provider-connections] revokeConnection failed: ${error.message}`,
    )
  }

  console.log('[provider-connections] revokeConnection', {
    connectionId,
    workspaceId,
    provider,
  })
}

/**
 * Record the result of a periodic health/token-validation check.
 *
 * - On success: sets status → 'active', updates last_validated_at, clears error.
 * - On failure: sets status → 'error', updates last_validated_at, stores error.
 *
 * Healthy checks on already-active connections are cheap no-ops in terms of
 * status change but always refresh last_validated_at.
 *
 * @param admin         Service-role Supabase client.
 * @param connectionId  Target connection UUID.
 * @param healthy       Whether the health check succeeded.
 * @param error         Optional error message when healthy === false.
 */
export async function recordValidation(
  admin: SupabaseClient,
  connectionId: string,
  healthy: boolean,
  error?: string,
): Promise<void> {
  // Fetch current row for ownership guard + current status context.
  const { data: currentRow, error: fetchError } = await admin
    .from(TABLE)
    .select('workspace_id, provider, status')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(
      `[provider-connections] recordValidation lookup failed: ${fetchError.message}`,
    )
  }

  if (!currentRow) {
    throw new Error(
      `[provider-connections] recordValidation failed: ` +
        `connection '${connectionId}' not found`,
    )
  }

  const { workspace_id: workspaceId, provider, status: currentStatus } =
    currentRow as { workspace_id: string; provider: string; status: ConnectionStatus }

  // Ownership guard.
  await _assertOwnership(admin, connectionId, workspaceId, 'recordValidation')

  // Determine new status:
  //   - Healthy + currently 'error'  → restore to 'active'
  //   - Healthy + any other status   → leave status unchanged (don't stomp 'revoked')
  //   - Unhealthy + not 'revoked'    → set to 'error'
  //   - Unhealthy + 'revoked'        → leave as 'revoked' (already intentionally revoked)
  let newStatus: ConnectionStatus = currentStatus

  if (healthy) {
    if (currentStatus === 'error') {
      newStatus = 'active'
    }
    // Otherwise preserve existing status.
  } else {
    if (currentStatus !== 'revoked') {
      newStatus = 'error'
    }
  }

  const now = new Date().toISOString()

  const { error: updateError } = await admin
    .from(TABLE)
    .update({
      status: newStatus,
      last_validated_at: now,
      last_validation_error: healthy ? null : (error ?? 'Unknown validation error'),
      updated_at: now,
    })
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    throw new Error(
      `[provider-connections] recordValidation failed: ${updateError.message}`,
    )
  }

  console.log('[provider-connections] recordValidation', {
    connectionId,
    workspaceId,
    provider,
    healthy,
    previousStatus: currentStatus,
    newStatus,
    ...(error ? { validationError: error } : {}),
  })
}