// apps/web/src/types/provider-connections.ts

/**
 * @fileoverview TypeScript type definitions for the provider_connections system.
 *
 * This file is the single source of truth for all provider connection types.
 * It is used by all backend services, API routes, and frontend components.
 *
 * @module provider-connections
 */

// ---------------------------------------------------------------------------
// Union Types / Enums
// ---------------------------------------------------------------------------

/**
 * Identifies a supported third-party provider that can be connected to the
 * platform.  Each slug maps to a concrete integration implementation and a
 * row in the `providers` reference table.
 *
 * - `github`      – Source-control & CI/CD (OAuth app / GitHub App)
 * - `vercel`      – Serverless deployment platform
 * - `netlify`     – JAMstack deployment & edge platform
 * - `openai`      – OpenAI API (GPT models, embeddings, etc.)
 * - `anthropic`   – Anthropic API (Claude models)
 * - `stripe`      – Payment processing & billing
 * - `sendgrid`    – Transactional email delivery
 * - `resend`      – Modern transactional email delivery
 * - `posthog`     – Product analytics & feature flags
 * - `sentry`      – Error monitoring & performance tracing
 * - `cloudflare`  – DNS, CDN, Workers, and edge infrastructure
 */
export type ProviderSlug =
  | 'github'
  | 'vercel'
  | 'netlify'
  | 'openai'
  | 'anthropic'
  | 'stripe'
  | 'sendgrid'
  | 'resend'
  | 'posthog'
  | 'sentry'
  | 'cloudflare'

/**
 * Describes who owns and manages the credentials for a provider connection.
 *
 * - `platform_managed` – The platform holds a single set of credentials shared
 *   across all workspaces (e.g. a platform-level API key injected at runtime).
 *   Users never see or rotate these credentials.
 *
 * - `user_managed`     – The workspace owner supplies their own credentials
 *   (OAuth token or API key).  The platform stores only an encrypted reference.
 *
 * - `hybrid`           – The platform provides a baseline connection, but the
 *   workspace can optionally override it with their own credentials.  When a
 *   user-supplied credential is present it takes precedence; otherwise the
 *   platform credential is used as a fallback.
 */
export type OwnershipMode = 'platform_managed' | 'user_managed' | 'hybrid'

/**
 * Defines the blast-radius of a connection — which resources can use it.
 *
 * - `workspace` – The connection is available to every project within the
 *   workspace.  Typically used for shared infrastructure credentials.
 *
 * - `project`   – The connection is scoped to a single project.  Enables
 *   per-project credential isolation when different projects must use
 *   different provider accounts.
 */
export type ConnectionScope = 'workspace' | 'project'

/**
 * Represents the lifecycle state of a provider connection.
 *
 * State machine transitions:
 * ```
 *   pending ──► active ──► expired
 *                 │          │
 *                 ▼          ▼
 *               revoked    error
 * ```
 *
 * - `pending`  – Connection record has been created but the OAuth flow or API
 *   key validation has not yet completed successfully.
 *
 * - `active`   – Credentials are valid and the connection is ready for use.
 *
 * - `expired`  – The access token has passed its expiry time and must be
 *   refreshed before the connection can be used again.
 *
 * - `revoked`  – The user or an administrator explicitly disconnected the
 *   provider, or the provider revoked the OAuth grant.  The connection
 *   should not be used and may be archived.
 *
 * - `error`    – A validation or refresh attempt failed with an unrecoverable
 *   error.  The `error_message` field will contain additional context.
 */
export type ConnectionStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error'

// ---------------------------------------------------------------------------
// Core Entity Interface
// ---------------------------------------------------------------------------

/**
 * Full representation of a provider connection as stored in the database and
 * returned by API read operations.
 *
 * Sensitive credentials (access tokens, refresh tokens) are **never** stored
 * directly.  Instead, `access_token_ref` and `refresh_token_ref` hold opaque
 * references (e.g. Vault secret paths or KMS-encrypted blob IDs) that the
 * secrets service resolves at runtime.
 *
 * @example
 * ```ts
 * const conn: ProviderConnection = {
 *   id: 'conn_01HZ...',
 *   workspace_id: 'ws_01HZ...',
 *   user_id: null,
 *   provider: 'github',
 *   ownership_mode: 'user_managed',
 *   connection_scope: 'workspace',
 *   provider_account_id: '12345678',
 *   provider_account_name: 'acme-org',
 *   status: 'active',
 *   access_token_ref: 'vault:secret/data/connections/conn_01HZ.../access',
 *   refresh_token_ref: null,
 *   token_expires_at: null,
 *   scopes: ['repo', 'read:org'],
 *   metadata: { installation_id: 987654 },
 *   error_message: null,
 *   last_validated_at: '2024-06-01T12:00:00Z',
 *   created_at: '2024-05-15T09:00:00Z',
 *   updated_at: '2024-06-01T12:00:00Z',
 *   created_by: 'user_01HZ...',
 * }
 * ```
 */
export interface ProviderConnection {
  /** Unique identifier for this connection record (ULID / UUID). */
  id: string

  /** The workspace this connection belongs to. */
  workspace_id: string

  /**
   * The user who authorised the connection via OAuth or supplied the API key.
   * `null` for platform-managed connections where no individual user OAuth
   * flow was performed.
   */
  user_id: string | null

  /** The provider this connection authenticates against. */
  provider: ProviderSlug

  /**
   * Describes how credentials are managed.
   * @see OwnershipMode
   */
  ownership_mode: OwnershipMode

  /**
   * Determines which resources within the workspace can use this connection.
   * @see ConnectionScope
   */
  connection_scope: ConnectionScope

  /**
   * The provider's own identifier for the authenticated account, organisation,
   * or team (e.g. GitHub user/org ID, Stripe account ID).
   * `null` if the provider does not expose an account identifier.
   */
  provider_account_id: string | null

  /**
   * Human-readable name for the connected provider account
   * (e.g. GitHub username, Vercel team slug, Stripe account name).
   * `null` if not available from the provider.
   */
  provider_account_name: string | null

  /**
   * Current lifecycle state of the connection.
   * @see ConnectionStatus
   */
  status: ConnectionStatus

  /**
   * Opaque reference to the stored access token in the secrets backend.
   * **Never** contains the raw token value.
   * `null` for connections that do not use OAuth access tokens (e.g. API-key
   * only integrations where the key is stored differently).
   */
  access_token_ref: string | null

  /**
   * Opaque reference to the stored refresh token in the secrets backend.
   * `null` for providers that do not issue refresh tokens.
   */
  refresh_token_ref: string | null

  /**
   * ISO-8601 timestamp at which the access token will expire.
   * `null` for non-expiring tokens (API keys, long-lived tokens).
   */
  token_expires_at: string | null

  /**
   * OAuth scopes granted by the user, or the permission set associated with
   * the API key.  `null` if scopes are not tracked for this provider.
   *
   * @example ['repo', 'read:org', 'workflow']
   */
  scopes: string[] | null

  /**
   * Arbitrary provider-specific metadata stored alongside the connection.
   * Common uses include GitHub App installation IDs, Vercel team IDs,
   * Stripe Connect account types, etc.
   *
   * @example { installation_id: 123456, team_id: 'team_abc' }
   */
  metadata: Record<string, unknown>

  /**
   * Human-readable error description populated when `status` is `'error'`.
   * `null` when the connection is healthy.
   */
  error_message: string | null

  /**
   * ISO-8601 timestamp of the most recent successful validation check.
   * `null` if the connection has never been validated.
   */
  last_validated_at: string | null

  /** ISO-8601 timestamp when this record was first created. */
  created_at: string

  /** ISO-8601 timestamp of the most recent update to this record. */
  updated_at: string

  /**
   * User ID of the actor who created this connection record.
   * `null` for system-initiated or migration-created connections.
   */
  created_by: string | null
}

// ---------------------------------------------------------------------------
// Input / Mutation Types
// ---------------------------------------------------------------------------

/**
 * Validated input payload for creating a new provider connection.
 *
 * All fields that have sensible defaults (ownership_mode, connection_scope,
 * metadata) are optional here; the service layer applies defaults before
 * persisting.
 *
 * @example
 * ```ts
 * const input: CreateProviderConnectionInput = {
 *   workspace_id: 'ws_01HZ...',
 *   provider: 'vercel',
 *   ownership_mode: 'user_managed',
 *   connection_scope: 'workspace',
 *   access_token_ref: 'vault:secret/data/connections/pending/vercel-oauth',
 *   scopes: ['deployments:read', 'deployments:write'],
 *   created_by: 'user_01HZ...',
 * }
 * ```
 */
export interface CreateProviderConnectionInput {
  /** The workspace this connection will belong to. */
  workspace_id: string

  /**
   * The user authorising the connection.
   * Omit for platform-managed connections.
   */
  user_id?: string

  /** The provider to connect to. */
  provider: ProviderSlug

  /**
   * How credentials will be managed.
   * Defaults to `'user_managed'` if omitted.
   */
  ownership_mode?: OwnershipMode

  /**
   * Resource scope for the connection.
   * Defaults to `'workspace'` if omitted.
   */
  connection_scope?: ConnectionScope

  /** Provider's identifier for the connected account. */
  provider_account_id?: string

  /** Human-readable name for the connected account. */
  provider_account_name?: string

  /**
   * Opaque reference to the access token in the secrets backend.
   * Should be pre-stored by the caller before creating the connection record.
   */
  access_token_ref?: string

  /**
   * Opaque reference to the refresh token in the secrets backend.
   * Omit for providers that do not issue refresh tokens.
   */
  refresh_token_ref?: string

  /**
   * ISO-8601 expiry timestamp for the access token.
   * Omit for non-expiring tokens.
   */
  token_expires_at?: string

  /** OAuth scopes or API key permission set. */
  scopes?: string[]

  /** Provider-specific metadata to store alongside the connection. */
  metadata?: Record<string, unknown>

  /**
   * ID of the user creating this record.
   * Omit for system-generated connections.
   */
  created_by?: string
}

/**
 * Input payload for updating an existing provider connection.
 *
 * All fields are optional; only the supplied fields will be updated.
 * `id` is required to identify the target record.
 *
 * @example
 * ```ts
 * const update: UpdateProviderConnectionInput = {
 *   id: 'conn_01HZ...',
 *   status: 'active',
 *   access_token_ref: 'vault:secret/data/connections/conn_01HZ.../access-v2',
 *   token_expires_at: '2025-01-01T00:00:00Z',
 *   last_validated_at: new Date().toISOString(),
 * }
 * ```
 */
export interface UpdateProviderConnectionInput {
  /** ID of the connection to update. */
  id: string

  /** Updated connection status. */
  status?: ConnectionStatus

  /** Updated access token reference. */
  access_token_ref?: string

  /** Updated refresh token reference. */
  refresh_token_ref?: string

  /** Updated token expiry timestamp (ISO-8601). */
  token_expires_at?: string

  /** Updated list of granted scopes. */
  scopes?: string[]

  /** Updated provider account identifier. */
  provider_account_id?: string

  /** Updated provider account display name. */
  provider_account_name?: string

  /** Partial metadata update (merged with existing metadata by the service layer). */
  metadata?: Record<string, unknown>

  /** Error description to record when transitioning to `'error'` status. */
  error_message?: string | null

  /** ISO-8601 timestamp of the most recent successful validation. */
  last_validated_at?: string
}

// ---------------------------------------------------------------------------
// Health & Validation Types
// ---------------------------------------------------------------------------

/**
 * Result of a connection health-check or token-validation operation.
 *
 * Returned by the `validateConnection` service method and the
 * `GET /api/connections/:id/health` endpoint.
 *
 * @example
 * ```ts
 * const health: ConnectionHealth = {
 *   healthy: true,
 *   status: 'active',
 *   token_expires_at: '2025-06-01T00:00:00Z',
 *   validated_at: '2024-06-01T12:00:00Z',
 * }
 * ```
 */
export interface ConnectionHealth {
  /**
   * `true` if the connection is usable right now; `false` if any issue
   * prevents the credentials from being used successfully.
   */
  healthy: boolean

  /**
   * The connection status recorded after this validation attempt.
   * Will match the `status` field on the `ProviderConnection` record after
   * the health-check is persisted.
   */
  status: ConnectionStatus

  /**
   * Human-readable error description when `healthy` is `false`.
   * Omitted on successful checks.
   */
  error?: string

  /**
   * ISO-8601 expiry of the access token, if known.
   * Omitted for non-expiring credentials.
   */
  token_expires_at?: string

  /** ISO-8601 timestamp at which this health-check was performed. */
  validated_at: string
}

// ---------------------------------------------------------------------------
// Ownership Resolution Types
// ---------------------------------------------------------------------------

/**
 * Result of resolving which credentials should be used for a provider call.
 *
 * The ownership-resolution service inspects the workspace's configuration and
 * any active connections to determine the correct credentials for a given
 * provider + workspace combination.  Consumers use this result to make
 * authenticated API calls without needing to understand the ownership model.
 *
 * @example Platform-managed fallback:
 * ```ts
 * const resolution: OwnershipResolution = {
 *   mode: 'platform_managed',
 *   access_token: 'ghp_platform_token...',
 *   fallback_reason: 'No user-managed connection found for workspace',
 * }
 * ```
 *
 * @example User-managed connection:
 * ```ts
 * const resolution: OwnershipResolution = {
 *   mode: 'user_managed',
 *   connection_id: 'conn_01HZ...',
 *   access_token: 'ghp_user_token...',
 *   account_name: 'acme-org',
 * }
 * ```
 */
export interface OwnershipResolution {
  /**
   * The ownership mode that was ultimately resolved.
   * For `hybrid` configurations this will be the effective mode used, not
   * necessarily the mode configured on the workspace.
   */
  mode: OwnershipMode

  /**
   * ID of the `ProviderConnection` record whose credentials are being used.
   * Omitted for fully platform-managed credentials that have no corresponding
   * connection record.
   */
  connection_id?: string

  /**
   * The resolved access token value (decrypted / fetched from secrets backend)
   * ready for use in provider API calls.
   *
   * **Security note:** This value must never be logged or returned to clients.
   * It should be consumed immediately and discarded.
   */
  access_token?: string

  /**
   * Provider-specific team identifier, where applicable
   * (e.g. Vercel team ID, GitHub organisation ID).
   */
  team_id?: string

  /**
   * Human-readable name of the resolved account or organisation.
   * Useful for logging and audit trails.
   */
  account_name?: string

  /**
   * Explanation of why a fallback resolution strategy was used.
   * Only populated when the primary resolution path was unavailable
   * (e.g. user-managed connection expired → fell back to platform credentials).
   */
  fallback_reason?: string
}

// ---------------------------------------------------------------------------
// Filter / Query Types
// ---------------------------------------------------------------------------

/**
 * Query filters for listing provider connections.
 *
 * All fields are optional; omitting a field means "no filter on that column".
 * Multiple fields are combined with AND semantics.
 *
 * @example
 * ```ts
 * const filters: ProviderConnectionFilters = {
 *   workspace_id: 'ws_01HZ...',
 *   provider: 'github',
 *   status: 'active',
 * }
 * ```
 */
export interface ProviderConnectionFilters {
  /** Filter by workspace. */
  workspace_id?: string

  /** Filter by provider type. */
  provider?: ProviderSlug

  /** Filter by ownership mode. */
  ownership_mode?: OwnershipMode

  /** Filter by connection scope. */
  connection_scope?: ConnectionScope

  /** Filter by connection status. */
  status?: ConnectionStatus

  /** Filter by the user who authorised the connection. */
  user_id?: string
}

// ---------------------------------------------------------------------------
// Type Guard Utilities
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown value to `ProviderSlug`.
 *
 * @example
 * ```ts
 * if (isProviderSlug(input.provider)) {
 *   // input.provider is typed as ProviderSlug here
 * }
 * ```
 */
export function isProviderSlug(value: unknown): value is ProviderSlug {
  return (
    typeof value === 'string' &&
    (
      [
        'github',
        'vercel',
        'netlify',
        'openai',
        'anthropic',
        'stripe',
        'sendgrid',
        'resend',
        'posthog',
        'sentry',
        'cloudflare',
      ] as const
    ).includes(value as ProviderSlug)
  )
}

/**
 * Narrows an unknown value to `ConnectionStatus`.
 *
 * @example
 * ```ts
 * if (isConnectionStatus(row.status)) {
 *   // row.status is typed as ConnectionStatus here
 * }
 * ```
 */
export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return (
    typeof value === 'string' &&
    (['pending', 'active', 'expired', 'revoked', 'error'] as const).includes(
      value as ConnectionStatus,
    )
  )
}

/**
 * Narrows an unknown value to `OwnershipMode`.
 */
export function isOwnershipMode(value: unknown): value is OwnershipMode {
  return (
    typeof value === 'string' &&
    (
      ['platform_managed', 'user_managed', 'hybrid'] as const
    ).includes(value as OwnershipMode)
  )
}

/**
 * Narrows an unknown value to `ConnectionScope`.
 */
export function isConnectionScope(value: unknown): value is ConnectionScope {
  return (
    typeof value === 'string' &&
    (['workspace', 'project'] as const).includes(value as ConnectionScope)
  )
}

// ---------------------------------------------------------------------------
// Convenience / Derived Types
// ---------------------------------------------------------------------------

/**
 * A subset of `ProviderConnection` containing only the fields needed to
 * display a connection in a UI list view.  Avoids transmitting sensitive
 * reference fields to the client unnecessarily.
 */
export type ProviderConnectionSummary = Pick<
  ProviderConnection,
  | 'id'
  | 'workspace_id'
  | 'provider'
  | 'ownership_mode'
  | 'connection_scope'
  | 'provider_account_name'
  | 'status'
  | 'scopes'
  | 'last_validated_at'
  | 'created_at'
  | 'updated_at'
>

/**
 * `ProviderConnection` enriched with a pre-fetched `ConnectionHealth` snapshot.
 * Returned by endpoints that combine a connection lookup with a live health-check.
 */
export type ProviderConnectionWithHealth = ProviderConnection & {
  /** The most recent health-check result for this connection. */
  health: ConnectionHealth
}

/**
 * All string-typed timestamps on `ProviderConnection` for use in date-handling
 * utilities.
 */
export type ProviderConnectionTimestampKey = Extract<
  keyof ProviderConnection,
  'token_expires_at' | 'last_validated_at' | 'created_at' | 'updated_at'
>

/**
 * A record mapping each `ProviderSlug` to an array of connections.
 * Useful for grouping a workspace's connections by provider.
 *
 * @example
 * ```ts
 * const grouped: ConnectionsByProvider = {
 *   github: [conn1],
 *   vercel: [conn2, conn3],
 *   // ...other providers may be absent or empty
 * }
 * ```
 */
export type ConnectionsByProvider = Partial<Record<ProviderSlug, ProviderConnection[]>>