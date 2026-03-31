/**
 * BUILD OS — P11.2 Roadmap
 * Provider Connections Foundation
 * Seeded via POST /api/projects/[id]/seed-p11-2
 *
 * Enables users/workspaces to connect their own GitHub and Vercel accounts.
 * System supports: platform-managed, user-managed, and hybrid ownership.
 * This phase is BACKEND + DB + ARCHITECTURE ONLY. No heavy frontend.
 *
 * 7 Workstreams:
 *   WS1 — Provider Connection Model         (5 tasks)
 *   WS2 — Project Integration Mapping       (4 tasks)
 *   WS3 — Deployment Targets Alignment      (3 tasks)
 *   WS4 — Ownership Logic                   (4 tasks)
 *   WS5 — GitHub Connection Backend         (5 tasks)
 *   WS6 — Vercel Connection Backend         (4 tasks)
 *   WS7 — Provisioning Integration          (4 tasks)
 *
 * Total: 1 Epic · 7 Features · 29 Tasks
 */

import type { RoadmapEpic } from './build-os-roadmap'

export const P11_2_EPIC_TITLE = 'P11.2 — Provider Connections Foundation'

export const ROADMAP_P11_2_SUMMARY = {
  epic_count:    1,
  feature_count: 7,
  task_count:    29,
  workstreams:   ['WS1', 'WS2', 'WS3', 'WS4', 'WS5', 'WS6', 'WS7'],
}

export const BUILD_OS_ROADMAP_P11_2: RoadmapEpic[] = [
  {
    title: P11_2_EPIC_TITLE,
    description:
      'Foundation for user-owned provider connections. Users and workspaces can connect their own ' +
      'GitHub accounts (via OAuth) and Vercel accounts (via PAT/token). The system detects the ' +
      'ownership mode per project — user-managed takes priority over platform-managed. ' +
      'All DB schema, backend services, OAuth flows, token storage, and provisioning integration ' +
      'are implemented in this phase. No heavy frontend UI (that is P11.3).',
    order_index: 0,

    features: [

      // ══════════════════════════════════════════════════════════════════════
      // WS1 — Provider Connection Model
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS1 — Provider Connection Model',
        description:
          'Create the provider_connections table and all supporting types/services. ' +
          'This is the core data model for user-owned connections to GitHub, Vercel, and future providers. ' +
          'Every connected account is a row in provider_connections, scoped to a workspace.',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title: 'DB Migration — Create provider_connections table (Migration 055)',
            description: `Create Supabase migration: migrations/20260331000055_provider_connections.sql

OBJECTIVE:
Create the provider_connections table as the single source of truth for all user-managed
provider integrations. This table is workspace-scoped, RLS-protected, and supports
multiple providers and ownership modes.

TABLE DEFINITION:
CREATE TABLE IF NOT EXISTS public.provider_connections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  provider             text NOT NULL CHECK (provider IN ('github', 'vercel', 'netlify', 'openai', 'anthropic', 'stripe', 'sendgrid', 'resend', 'posthog', 'sentry', 'cloudflare')),
  ownership_mode       text NOT NULL DEFAULT 'user_managed' CHECK (ownership_mode IN ('platform_managed', 'user_managed', 'hybrid')),
  connection_scope     text NOT NULL DEFAULT 'workspace' CHECK (connection_scope IN ('workspace', 'project')),
  provider_account_id  text,
  provider_account_name text,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'error')),
  access_token_ref     text,
  refresh_token_ref    text,
  token_expires_at     timestamptz,
  scopes               text[],
  metadata             jsonb NOT NULL DEFAULT '{}',
  error_message        text,
  last_validated_at    timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL
);

INDEXES:
CREATE INDEX IF NOT EXISTS idx_provider_connections_workspace ON provider_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_provider ON provider_connections(workspace_id, provider);
CREATE INDEX IF NOT EXISTS idx_provider_connections_status ON provider_connections(workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_workspace_provider_active
  ON provider_connections(workspace_id, provider)
  WHERE status = 'active';

RLS:
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
-- Policy: workspace members can read their workspace connections
-- Policy: workspace owners/admins can create/update/delete
-- Policy: service_role bypasses all policies

TRIGGER:
Add updated_at trigger (reuse existing trigger function moddatetime if available,
or create: CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;)

NOTES:
- access_token_ref and refresh_token_ref store REFERENCES to encrypted values (not raw tokens)
  The actual tokens are encrypted via Supabase Vault or AES in the credentials table.
  For now: store the token directly in access_token_ref as an encrypted text (AES-256-GCM).
- provider_account_id is the GitHub user/org ID or Vercel user/team ID
- metadata can hold: installation_id (GitHub App), team_id (Vercel), scopes, avatar_url, etc.
- The unique index on (workspace_id, provider) WHERE status='active' ensures one active
  connection per provider per workspace.`,
            agent_role:         'backend_engineer',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.12,
          },

          {
            title: 'TypeScript Types — ProviderConnection interfaces and enums',
            description: `Create src/types/provider-connections.ts with all TypeScript types for the provider_connections system.

OBJECTIVE:
Establish a single source of truth for all provider connection types. Used by all
backend services, API routes, and (eventually) frontend components.

REQUIRED EXPORTS:

export type ProviderSlug = 'github' | 'vercel' | 'netlify' | 'openai' | 'anthropic' | 'stripe' | 'sendgrid' | 'resend' | 'posthog' | 'sentry' | 'cloudflare'
export type OwnershipMode = 'platform_managed' | 'user_managed' | 'hybrid'
export type ConnectionScope = 'workspace' | 'project'
export type ConnectionStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error'

export interface ProviderConnection {
  id: string
  workspace_id: string
  user_id: string | null
  provider: ProviderSlug
  ownership_mode: OwnershipMode
  connection_scope: ConnectionScope
  provider_account_id: string | null
  provider_account_name: string | null
  status: ConnectionStatus
  access_token_ref: string | null
  refresh_token_ref: string | null
  token_expires_at: string | null
  scopes: string[] | null
  metadata: Record<string, unknown>
  error_message: string | null
  last_validated_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface CreateProviderConnectionInput {
  workspace_id: string
  user_id?: string
  provider: ProviderSlug
  ownership_mode?: OwnershipMode
  connection_scope?: ConnectionScope
  provider_account_id?: string
  provider_account_name?: string
  access_token_ref?: string
  refresh_token_ref?: string
  token_expires_at?: string
  scopes?: string[]
  metadata?: Record<string, unknown>
  created_by?: string
}

export interface ConnectionHealth {
  healthy: boolean
  status: ConnectionStatus
  error?: string
  token_expires_at?: string
  validated_at: string
}

export interface OwnershipResolution {
  mode: OwnershipMode
  connection_id?: string
  access_token?: string
  team_id?: string
  account_name?: string
  fallback_reason?: string
}

Also add JSDoc comments explaining the purpose of each type.
File location: apps/web/src/types/provider-connections.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.10,
          },

          {
            title: 'Backend Service — provider-connections.ts CRUD and helpers',
            description: `Create src/lib/provider-connections.ts — the service layer for all provider_connections DB operations.

OBJECTIVE:
Centralize all provider_connections database access behind a clean service API.
All routes and other services must use this module — no raw Supabase queries spread across files.

REQUIRED EXPORTS:

import { SupabaseClient } from '@supabase/supabase-js'
import type { ProviderConnection, CreateProviderConnectionInput, ConnectionStatus } from '@/types/provider-connections'

// Create a new provider connection (status defaults to 'pending')
export async function createProviderConnection(
  admin: SupabaseClient,
  input: CreateProviderConnectionInput
): Promise<ProviderConnection>

// Fetch active connection for a workspace + provider
export async function getActiveConnection(
  admin: SupabaseClient,
  workspaceId: string,
  provider: string
): Promise<ProviderConnection | null>

// Fetch all connections for a workspace
export async function listWorkspaceConnections(
  admin: SupabaseClient,
  workspaceId: string
): Promise<ProviderConnection[]>

// Fetch a single connection by ID (with workspace guard)
export async function getConnectionById(
  admin: SupabaseClient,
  connectionId: string,
  workspaceId: string
): Promise<ProviderConnection | null>

// Update connection status and optional fields
export async function updateConnectionStatus(
  admin: SupabaseClient,
  connectionId: string,
  status: ConnectionStatus,
  fields?: Partial<ProviderConnection>
): Promise<void>

// Activate a connection (status → active, set provider_account_id, account_name)
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
  }
): Promise<ProviderConnection>

// Revoke/expire a connection (status → revoked, clear token refs)
export async function revokeConnection(
  admin: SupabaseClient,
  connectionId: string
): Promise<void>

// Update last_validated_at and status after a health check
export async function recordValidation(
  admin: SupabaseClient,
  connectionId: string,
  healthy: boolean,
  error?: string
): Promise<void>

IMPLEMENTATION NOTES:
- All mutations must check that connectionId belongs to the correct workspaceId (prevent cross-workspace writes)
- Use admin client (service_role) for all operations — RLS is for frontend reads only
- Log all mutations at info level: console.log('[provider-connections] operation', { connectionId, ... })
- Handle and re-throw Supabase errors with a clear prefix: throw new Error('[provider-connections] getActiveConnection failed: ' + err.message)`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },

          {
            title: 'DB Migration — RLS Policies for provider_connections (Migration 055b)',
            description: `Add Row Level Security policies for the provider_connections table.

OBJECTIVE:
Ensure workspace members can read their own connections, workspace admins/owners can manage them,
and no user can read connections from a different workspace.

MIGRATION FILE: add as a separate section in migrations/20260331000055_provider_connections.sql
OR as migrations/20260331000055b_provider_connections_rls.sql

REQUIRED POLICIES:

1. SELECT policy — "workspace_members_can_read_connections"
   USING: workspace_id IN (
     SELECT id FROM workspaces WHERE organization_id IN (
       SELECT organization_id FROM users WHERE id = auth.uid()
     )
   )
   -- Or simpler if user→workspace mapping is direct

2. INSERT policy — "workspace_admins_can_create_connections"
   WITH CHECK: workspace_id IN (
     SELECT id FROM workspaces WHERE organization_id IN (
       SELECT organization_id FROM users WHERE id = auth.uid() AND role IN ('owner', 'admin')
     )
   )

3. UPDATE policy — "workspace_admins_can_update_connections"
   Same predicate as INSERT.

4. DELETE policy — "workspace_admins_can_delete_connections"
   Same predicate as INSERT.

IMPORTANT:
- Service role bypasses all RLS (admin client used for backend ops)
- Verify no policy leaks data across workspaces
- Test with SQL: SET LOCAL role TO authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"<user_id>"}'; SELECT * FROM provider_connections;

Add the RLS policies in the migration file. Mark the migration as idempotent with IF NOT EXISTS / DROP POLICY IF EXISTS patterns.`,
            agent_role:         'backend_engineer',
            task_type:          'schema',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.08,
          },

          {
            title: 'QA — provider_connections isolation and cross-workspace leak tests',
            description: `Write tests to verify that provider_connections is correctly isolated per workspace.

OBJECTIVE:
Ensure no cross-workspace data leakage is possible through the provider_connections API.
Test both RLS-level isolation and service-layer isolation.

TEST FILE: apps/web/src/__tests__/provider-connections.test.ts (or .spec.ts)
Use: Jest + Supabase client (mock or real Supabase test project)

TEST CASES:

1. createProviderConnection — happy path
   - Create a connection for workspace A
   - Fetch with getActiveConnection(workspaceA_id, 'github') → returns connection
   - Fetch with getActiveConnection(workspaceB_id, 'github') → returns null (isolation)

2. getConnectionById — workspace guard
   - Create connection for workspace A
   - Call getConnectionById(connectionId, workspaceB_id) → returns null (not found/wrong workspace)
   - Call getConnectionById(connectionId, workspaceA_id) → returns connection

3. updateConnectionStatus — workspace guard
   - Call updateConnectionStatus on a connection from a different workspace → error thrown
   - Call updateConnectionStatus on own workspace connection → succeeds

4. activateConnection — full lifecycle
   - Create pending connection
   - Call activateConnection with token and account info
   - Verify status = 'active', provider_account_id set, access_token_ref set

5. revokeConnection
   - Activate a connection
   - Revoke it
   - getActiveConnection should return null (status no longer 'active')

6. Unique constraint — one active per workspace per provider
   - Create and activate connection for (workspaceA, github)
   - Attempt to create and activate a second one for (workspaceA, github) → should fail with unique constraint violation

NOTES:
- Use test workspace IDs (not production)
- Use mock tokens (ghp_test_xxxx, vercel_test_xxxx)
- If integration tests are impractical, write unit tests with mocked Supabase client`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        4,
            estimated_cost_usd: 0.16,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS2 — Project Integration Mapping
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS2 — Project Integration Mapping',
        description:
          'Update project_integrations to reference provider_connections. ' +
          'When a project is provisioned using a user-managed connection, ' +
          'that connection ID must be stored in project_integrations for traceability. ' +
          'Also adds is_primary and external identifiers for richer mapping.',
        priority:    'critical',
        order_index: 1,
        tasks: [
          {
            title: 'DB Migration — Add provider_connection_id to project_integrations (Migration 056)',
            description: `Create Supabase migration: migrations/20260331000056_project_integrations_v2.sql

OBJECTIVE:
Extend project_integrations to link back to the provider_connection used to provision it.
This enables ownership traceability: given a project integration, we can find the workspace
connection that was used (user-managed) or know it was platform-managed (NULL).

MIGRATION CHANGES:

1. Add column provider_connection_id (nullable FK):
   ALTER TABLE project_integrations
     ADD COLUMN IF NOT EXISTS provider_connection_id uuid
       REFERENCES provider_connections(id) ON DELETE SET NULL;

2. Add column is_primary (boolean, default true):
   ALTER TABLE project_integrations
     ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;

3. Add column external_project_id (text, nullable):
   ALTER TABLE project_integrations
     ADD COLUMN IF NOT EXISTS external_project_id text;
   -- e.g., GitHub repo ID (numeric), Vercel project ID

4. Add column external_project_name (text, nullable):
   ALTER TABLE project_integrations
     ADD COLUMN IF NOT EXISTS external_project_name text;
   -- e.g., "AydeGitProduction/my-repo", "my-vercel-project"

5. Add indexes:
   CREATE INDEX IF NOT EXISTS idx_pi_provider_connection
     ON project_integrations(provider_connection_id)
     WHERE provider_connection_id IS NOT NULL;

   CREATE INDEX IF NOT EXISTS idx_pi_project_provider
     ON project_integrations(project_id, provider_id);

NOTES:
- provider_connection_id IS NULL means platform-managed (backward compatible)
- All existing rows remain valid — no data migration required
- is_primary allows multiple connections per project/provider pair in future
- external_project_id/name replace the less-structured environment_map fields over time
  (environment_map stays for backward compat)
- Migration must be idempotent (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)`,
            agent_role:         'backend_engineer',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },

          {
            title: 'Backend — Update provision-db.ts to write provider_connection_id',
            description: `Modify src/lib/provision-db.ts to accept and write provider_connection_id when available.

OBJECTIVE:
When provisioning uses a user-managed connection, the provider_connection_id must be
stored in project_integrations so we can trace which workspace connection created the repo.

CURRENT SIGNATURE:
  export async function saveProvisioningResult(
    projectId: string,
    github: GitHubProvisioningInfo,
    vercel: VercelProvisioningInfo
  ): Promise<void>

NEW SIGNATURE (backward compatible):
  export interface ProvisioningConnectionInfo {
    githubConnectionId?: string   // provider_connections.id used for GitHub
    vercelConnectionId?: string   // provider_connections.id used for Vercel
  }

  export async function saveProvisioningResult(
    projectId: string,
    github: GitHubProvisioningInfo,
    vercel: VercelProvisioningInfo,
    connections?: ProvisioningConnectionInfo  // optional — if not provided, assume platform-managed
  ): Promise<void>

CHANGES TO saveProvisioningResult:
1. In the GitHub project_integrations upsert, add:
   provider_connection_id: connections?.githubConnectionId ?? null,
   external_project_id: String(github.repoId),
   external_project_name: github.repoFullName ?? github.repoName,

2. In the Vercel project_integrations upsert, add:
   provider_connection_id: connections?.vercelConnectionId ?? null,
   external_project_id: vercel.vercelProjectId,
   external_project_name: vercel.projectName,

3. Verify that existing callers still work (connections param is optional)

Also update the GitHubProvisioningInfo type to include repoFullName? if it doesn't already.

FILE: apps/web/src/lib/provision-db.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'Backend — Integration query helpers for project_integrations',
            description: `Add query helpers to provision-db.ts (or a new src/lib/project-integrations.ts) for reading project_integrations with provider_connection context.

OBJECTIVE:
Provide a clean API for fetching integration state per project, used by the ownership
resolver and provisioning route.

REQUIRED FUNCTIONS:

// Get all active integrations for a project, with provider_connection info joined
export async function getProjectIntegrations(
  admin: SupabaseClient,
  projectId: string
): Promise<ProjectIntegrationRow[]>

// Where ProjectIntegrationRow includes:
interface ProjectIntegrationRow {
  id: string
  project_id: string
  provider_id: string
  provider_connection_id: string | null
  credential_id: string | null
  status: string
  is_primary: boolean
  external_project_id: string | null
  external_project_name: string | null
  environment_map: Record<string, unknown>
  // Joined from provider_connections (if provider_connection_id is not null):
  connection?: {
    provider: string
    ownership_mode: string
    provider_account_name: string | null
    status: string
  }
}

// Get a single active integration by project + provider name
export async function getProjectIntegrationByProvider(
  admin: SupabaseClient,
  projectId: string,
  providerName: string   // 'github' or 'vercel'
): Promise<ProjectIntegrationRow | null>

Implementation note:
Use Supabase join syntax: select('*, provider_connections(provider, ownership_mode, provider_account_name, status)')
to fetch the connection details in one query.

FILE: apps/web/src/lib/project-integrations.ts (new file)`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'QA — Verify project_integrations mapping and FK integrity',
            description: `Write tests verifying that project_integrations correctly stores provider_connection_id and maintains referential integrity.

OBJECTIVE:
Confirm that:
1. Platform-managed provisioning → provider_connection_id IS NULL
2. User-managed provisioning → provider_connection_id is set to the connection ID
3. The FK constraint is respected (cannot set provider_connection_id to a non-existent connection)
4. getProjectIntegrationByProvider returns the correct row with joined connection data

TEST CASES:

1. saveProvisioningResult without connections param
   → project_integrations rows have provider_connection_id = null

2. saveProvisioningResult with connections.githubConnectionId set
   → GitHub project_integrations row has provider_connection_id = that ID
   → external_project_id = String(github.repoId)
   → external_project_name = repoFullName

3. saveProvisioningResult with invalid connection ID (foreign key violation)
   → should throw or return error (DB constraint)

4. getProjectIntegrationByProvider('github')
   → returns row with correct external_project_id
   → if provider_connection_id is set, connection field is present

5. Idempotency: call saveProvisioningResult twice for same project
   → upsert semantics, no duplicate rows, second call updates existing

FILE: apps/web/src/__tests__/project-integrations.test.ts`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.12,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS3 — Deployment Targets Alignment
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS3 — Deployment Targets Alignment',
        description:
          'Extend deployment_targets to track which provider_connection was used for deployment. ' +
          'Ensures environment binding is correct and provider-scoped. ' +
          'Supports future multi-provider deployments per project.',
        priority:    'high',
        order_index: 2,
        tasks: [
          {
            title: 'DB Migration — Add provider_connection_id to deployment_targets (Migration 057)',
            description: `Create Supabase migration: migrations/20260331000057_deployment_targets_v2.sql

OBJECTIVE:
Link deployment_targets back to the provider_connection that manages the deployment.
This enables: (a) health checks using the correct credentials, (b) re-deployment with
the right token, (c) knowing which targets are user-managed vs. platform-managed.

MIGRATION CHANGES:

1. Add column provider_connection_id (nullable FK):
   ALTER TABLE deployment_targets
     ADD COLUMN IF NOT EXISTS provider_connection_id uuid
       REFERENCES provider_connections(id) ON DELETE SET NULL;

2. Add column deployment_region (text, nullable):
   ALTER TABLE deployment_targets
     ADD COLUMN IF NOT EXISTS deployment_region text;
   -- e.g., 'iad1', 'sfo1', 'fra1' for Vercel

3. Add column framework (text, nullable):
   ALTER TABLE deployment_targets
     ADD COLUMN IF NOT EXISTS framework text;
   -- e.g., 'nextjs', 'remix', 'static'

4. Add index:
   CREATE INDEX IF NOT EXISTS idx_dt_provider_connection
     ON deployment_targets(provider_connection_id)
     WHERE provider_connection_id IS NOT NULL;

5. Update the status check constraint to ensure it covers all current values:
   ALTER TABLE deployment_targets DROP CONSTRAINT IF EXISTS deployment_targets_status_check;
   ALTER TABLE deployment_targets ADD CONSTRAINT deployment_targets_status_check
     CHECK (status IN ('inactive', 'deploying', 'live', 'failed', 'paused'));

NOTES:
- provider_connection_id = NULL means platform-managed deployment (backward compat)
- All existing rows remain valid
- Idempotent: use IF NOT EXISTS, DROP CONSTRAINT IF EXISTS
- Migration number: 057`,
            agent_role:         'backend_engineer',
            task_type:          'schema',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.07,
          },

          {
            title: 'Backend — Update provision-db.ts deployment_targets write',
            description: `Update saveProvisioningResult in provision-db.ts to write provider_connection_id to deployment_targets.

OBJECTIVE:
When a Vercel project is provisioned using a user-managed connection, the deployment_target
row must record which connection was used.

CHANGES:
In the deployment_targets upsert section of saveProvisioningResult, add:
  provider_connection_id: connections?.vercelConnectionId ?? null,
  framework: 'nextjs',  // always nextjs for now

Also update target_config jsonb to include:
  target_config: {
    vercel_project_id: vercel.vercelProjectId,
    project_url: vercel.productionUrl,
    ownership_mode: connections?.vercelConnectionId ? 'user_managed' : 'platform_managed',
  }

Verify the environment_id FK is correctly populated:
The current code uses a hardcoded PRODUCTION_ENVIRONMENT_ID.
Add a NOTE comment: "TODO P11.3: dynamically resolve environment_id from project environments".

FILE: apps/web/src/lib/provision-db.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.10,
          },

          {
            title: 'QA — deployment_targets alignment validation',
            description: `Write tests to verify deployment_targets rows are correctly populated with provider_connection_id.

TEST CASES:

1. Platform-managed provisioning
   → deployment_targets row has provider_connection_id = null
   → target_config.ownership_mode = 'platform_managed'

2. User-managed provisioning (vercelConnectionId provided)
   → deployment_targets row has provider_connection_id = vercelConnectionId
   → target_config.ownership_mode = 'user_managed'

3. Re-provisioning (idempotency)
   → Second call with same projectId → existing row is upserted, not duplicated
   → provider_connection_id is updated correctly

4. FK integrity
   → Setting provider_connection_id to a revoked connection ID → row is inserted (FK allows it, but status reflects)
   → Setting to non-existent UUID → FK violation error

FILE: apps/web/src/__tests__/deployment-targets.test.ts`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.10,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS4 — Ownership Logic
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS4 — Ownership Logic',
        description:
          'Implement the ownership resolution layer that decides whether to use a user-managed ' +
          'provider connection or fall back to platform-managed credentials. ' +
          'This layer is called by the provisioning route before making any external API calls.',
        priority:    'critical',
        order_index: 3,
        tasks: [
          {
            title: 'Architecture — Document ownership resolution algorithm',
            description: `Create src/docs/ownership-resolution.md — the canonical spec for how ownership is decided.

OBJECTIVE:
Document the decision algorithm so developers implement it correctly and future changes
are made deliberately. This is the source of truth for ownership logic.

DOCUMENT CONTENT:

## Ownership Resolution Algorithm

### Decision Matrix

Given: projectId, provider ('github' | 'vercel')

1. Resolve workspaceId from projectId
   → SELECT workspace_id FROM projects WHERE id = projectId

2. Query provider_connections for active user-managed connection:
   → SELECT * FROM provider_connections
     WHERE workspace_id = workspaceId
       AND provider = provider
       AND status = 'active'
       AND ownership_mode IN ('user_managed', 'hybrid')
     ORDER BY created_at DESC
     LIMIT 1

3. If connection found:
   → mode = 'user_managed'
   → Use connection.access_token_ref as the API token
   → Use connection.metadata.team_id as teamId (Vercel)
   → Use connection.metadata.installation_id for GitHub App flows
   → Return OwnershipResolution { mode: 'user_managed', connection_id, access_token, ... }

4. If no connection found (or connection found but token is expired/revoked):
   → mode = 'platform_managed'
   → Use GITHUB_TOKEN env var (or GitHub App) for GitHub
   → Use VERCEL_TOKEN env var for Vercel
   → Return OwnershipResolution { mode: 'platform_managed', fallback_reason: 'no_active_connection' }

### Hybrid Mode
If ownership_mode = 'hybrid':
  - Use user-managed token for GitHub operations
  - Use platform-managed token for Vercel (or vice versa)
  - Not fully implemented in P11.2; hybrid is stored but treated as user_managed

### Token Expiry Handling
If connection.token_expires_at < now() + 5 minutes:
  - Do not use this connection
  - Return platform_managed fallback
  - Log: "[ownership-resolver] Connection {id} token expiring soon, falling back to platform"

### Cross-Workspace Safety
The resolver MUST verify the workspace_id matches the project's workspace.
Never return a connection from a different workspace.

Include: sequence diagram in ASCII art, fallback rationale, notes on hybrid mode.

FILE: apps/web/src/docs/ownership-resolution.md (create docs/ folder if needed)`,
            agent_role:         'architect',
            task_type:          'document',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.12,
          },

          {
            title: 'Backend Service — ownership-resolver.ts',
            description: `Create src/lib/ownership-resolver.ts implementing the ownership resolution algorithm from WS4-T1.

OBJECTIVE:
Provide a single function resolveProviderOwnership() that the provisioning route calls
before making any GitHub or Vercel API call. Returns the credentials and mode to use.

IMPLEMENTATION:

import { SupabaseClient } from '@supabase/supabase-js'
import type { OwnershipResolution, ProviderSlug } from '@/types/provider-connections'
import { getActiveConnection } from '@/lib/provider-connections'

export async function resolveProviderOwnership(
  admin: SupabaseClient,
  projectId: string,
  provider: ProviderSlug
): Promise<OwnershipResolution>

ALGORITHM (implement exactly as documented in WS4-T1):

1. Fetch project → get workspace_id
2. getActiveConnection(admin, workspace_id, provider)
3. If connection found AND connection.status === 'active':
   a. Check token expiry (if token_expires_at is set and < now + 5min → skip)
   b. Return {
        mode: 'user_managed',
        connection_id: connection.id,
        access_token: connection.access_token_ref,   // decrypted token
        team_id: connection.metadata?.team_id as string | undefined,
        account_name: connection.provider_account_name ?? undefined,
      }
4. Otherwise:
   Return {
     mode: 'platform_managed',
     fallback_reason: connection ? 'token_expired' : 'no_active_connection',
   }

ALSO EXPORT:

// Quick check: does this workspace have any active user connection for provider?
export async function hasUserConnection(
  admin: SupabaseClient,
  workspaceId: string,
  provider: ProviderSlug
): Promise<boolean>

// Validate that a resolved ownership is usable (token not expired, etc.)
export function isResolutionUsable(resolution: OwnershipResolution): boolean

IMPORTANT:
- Log every resolution: console.log('[ownership-resolver] Resolved', { projectId, provider, mode: resolution.mode })
- Never throw — return platform_managed on any error, log the error
- In P11.2 phase: access_token_ref stores the raw token (encryption comes in P11.3)

FILE: apps/web/src/lib/ownership-resolver.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.20,
          },

          {
            title: 'Backend — Ownership mode validation and safety checks',
            description: `Add cross-workspace safety validation to the ownership resolver and related services.

OBJECTIVE:
Prevent credential leakage across workspaces. Every access to provider_connections must
validate that the requesting project belongs to the same workspace as the connection.

IMPLEMENTATION:

In ownership-resolver.ts:
1. After fetching the project, verify that connection.workspace_id === project.workspace_id
   If mismatch: log error + return platform_managed (never expose wrong connection)

2. Add function validateOwnershipClaim(admin, connectionId, workspaceId):
   → Fetches connection and verifies workspace_id matches
   → Used by API routes that accept a connectionId from the client

In provider-connections.ts:
3. Add guard to all mutation functions: verify workspaceId matches connection.workspace_id
   before any write operation. Throw '[provider-connections] Workspace mismatch' on failure.

4. Add function getTokenForConnection(admin, connectionId, workspaceId): Promise<string>
   → Fetches connection with workspace guard
   → Returns access_token_ref (the raw token for P11.2)
   → Throws if connection not found, revoked, or workspace mismatch

NOTES:
- These checks are defense-in-depth (RLS also protects, but service layer is safer)
- Add console.error logs for any workspace mismatch: '[ownership-resolver] SECURITY: workspace mismatch'
- This is non-negotiable for multi-tenant safety

FILE: apps/web/src/lib/ownership-resolver.ts + apps/web/src/lib/provider-connections.ts (updates)`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'QA — Ownership resolver tests: fallback, isolation, expiry',
            description: `Write comprehensive tests for the ownership resolution system.

OBJECTIVE:
Verify the three key behaviors: correct user-managed resolution, correct platform fallback,
and cross-workspace isolation.

TEST CASES:

1. User-managed — active connection exists
   - Create active connection for (workspaceA, 'github') with token 'ghp_test'
   - resolveProviderOwnership(projectInWorkspaceA, 'github')
   → mode = 'user_managed', access_token = 'ghp_test', connection_id set

2. Platform fallback — no connection
   - No provider_connections for workspaceB
   - resolveProviderOwnership(projectInWorkspaceB, 'github')
   → mode = 'platform_managed', fallback_reason = 'no_active_connection'

3. Platform fallback — token expired
   - Create active connection but with token_expires_at = 1 minute ago
   - resolveProviderOwnership(...)
   → mode = 'platform_managed', fallback_reason = 'token_expired'

4. Cross-workspace isolation
   - Create connection for workspaceA
   - Call resolveProviderOwnership with projectId from workspaceB
   → mode = 'platform_managed' (isolation enforced)
   → NO connection from workspaceA leaked

5. Revoked connection
   - Create connection, then revoke it (status = 'revoked')
   - resolveProviderOwnership(...)
   → mode = 'platform_managed', fallback_reason = 'no_active_connection'

6. Error resilience
   - Simulate DB error in getActiveConnection
   - resolveProviderOwnership(...)
   → mode = 'platform_managed' (never throws, logs error)

FILE: apps/web/src/__tests__/ownership-resolver.test.ts`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'critical',
            order_index:        3,
            estimated_cost_usd: 0.14,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS5 — GitHub Connection Backend
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS5 — GitHub Connection Backend',
        description:
          'Implement GitHub OAuth connection flow and storage. ' +
          'Users authorize BuildOS to access their GitHub account. ' +
          'The connection is stored in provider_connections with the installation_id and OAuth token. ' +
          'This phase uses GitHub OAuth App (not GitHub App) for user-level access.',
        priority:    'critical',
        order_index: 4,
        tasks: [
          {
            title: 'Backend Service — github-connection.ts OAuth flow',
            description: `Create src/lib/github-connection.ts implementing GitHub OAuth connection.

OBJECTIVE:
Implement the full GitHub OAuth App flow: generate authorization URL, handle callback,
exchange code for token, fetch user info, and store the connection.

REQUIRED EXPORTS:

import { SupabaseClient } from '@supabase/supabase-js'
import type { ProviderConnection } from '@/types/provider-connections'

// Step 1: Generate GitHub OAuth authorization URL
export function generateGitHubAuthUrl(params: {
  workspaceId: string
  userId: string
  returnUrl: string
  state?: string          // additional state to encode
}): string
// Returns: https://github.com/login/oauth/authorize?client_id=...&scope=repo,user&state=...
// GITHUB_CLIENT_ID env var required
// State should be: base64(JSON.stringify({ workspaceId, userId, returnUrl, nonce: uuid }))

// Step 2: Validate OAuth state (prevent CSRF)
export function validateOAuthState(
  state: string,
  expectedWorkspaceId: string
): { valid: boolean; decoded?: { workspaceId: string; userId: string; returnUrl: string } }

// Step 3: Exchange code for access token
export async function exchangeGitHubCode(code: string): Promise<{
  access_token: string
  token_type: string
  scope: string
}>
// POST https://github.com/login/oauth/access_token
// GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET env vars required
// Accept: application/json

// Step 4: Fetch GitHub user info
export async function fetchGitHubUser(token: string): Promise<{
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}>
// GET https://api.github.com/user
// Authorization: Bearer {token}

// Step 5: Store connection
export async function storeGitHubConnection(
  admin: SupabaseClient,
  params: {
    workspaceId: string
    userId: string
    token: string
    scopes: string
    githubUser: { id: number; login: string; name?: string | null; email?: string | null }
  }
): Promise<ProviderConnection>
// Calls activateConnection() from provider-connections.ts
// provider_account_id = String(githubUser.id)
// provider_account_name = githubUser.login
// access_token_ref = token (raw in P11.2)
// metadata = { login: githubUser.login, name: githubUser.name, email: githubUser.email }

// Step 6: Validate existing connection
export async function validateGitHubConnection(
  connectionId: string,
  workspaceId: string,
  admin: SupabaseClient
): Promise<{ healthy: boolean; login?: string; error?: string }>
// Fetch token from connection, call GET /user, record result

ENV VARS REQUIRED:
GITHUB_CLIENT_ID — OAuth App client ID
GITHUB_CLIENT_SECRET — OAuth App client secret
(Different from GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY used for provisioning)

FILE: apps/web/src/lib/github-connection.ts`,
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.28,
          },

          {
            title: 'API Route — POST /api/integrations/github/connect (initiate OAuth)',
            description: `Create apps/web/src/app/api/integrations/github/connect/route.ts

OBJECTIVE:
Provide an API endpoint that generates the GitHub OAuth URL and redirects the user
(or returns the URL for frontend to redirect).

ENDPOINT: POST /api/integrations/github/connect

REQUEST BODY:
{
  workspace_id: string
  return_url?: string   // where to redirect after OAuth (defaults to /settings/integrations)
}

AUTH: requires authenticated user (JWT via Supabase)

LOGIC:
1. Verify user is authenticated
2. Verify user has access to workspace_id (is member)
3. Generate OAuth URL via generateGitHubAuthUrl(...)
4. Return: { oauth_url: string, state: string }
   (Frontend handles the redirect to GitHub)

RESPONSE (200):
{
  oauth_url: "https://github.com/login/oauth/authorize?...",
  state: "<base64_encoded_state>"
}

ERRORS:
- 401: not authenticated
- 403: user is not a member of workspace_id
- 400: missing workspace_id
- 500: GITHUB_CLIENT_ID not configured

FILE: apps/web/src/app/api/integrations/github/connect/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'API Route — GET /api/integrations/github/callback (OAuth callback)',
            description: `Create apps/web/src/app/api/integrations/github/callback/route.ts

OBJECTIVE:
Handle the GitHub OAuth callback. Exchange the code for a token, fetch user info,
store the connection, and redirect to the return URL.

ENDPOINT: GET /api/integrations/github/callback

QUERY PARAMS:
- code: string (from GitHub)
- state: string (base64 JSON with workspaceId, userId, returnUrl)

LOGIC:
1. Parse and validate state using validateOAuthState(state, ...)
2. Check for error param (user denied access → redirect with error)
3. Call exchangeGitHubCode(code)
4. Call fetchGitHubUser(token)
5. Call storeGitHubConnection(admin, { workspaceId, userId, token, scopes, githubUser })
6. Redirect to returnUrl + "?github_connected=true&account=" + githubUser.login
   OR returnUrl + "?github_error=" + error.message if any step fails

IMPORTANT:
- Never expose the access token in the redirect URL
- If storeGitHubConnection fails because a connection already exists:
  → Revoke the old connection first, then create new one
  → (One active connection per workspace per provider)
- Log all steps at info level
- On any error: redirect to returnUrl + "?github_error=..." (don't return JSON — it's a browser redirect)

FILE: apps/web/src/app/api/integrations/github/callback/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.18,
          },

          {
            title: 'API Route — GET /api/integrations/github/status (connection health)',
            description: `Create apps/web/src/app/api/integrations/github/status/route.ts

OBJECTIVE:
Let frontends (and internal checks) query the health of the workspace's GitHub connection.

ENDPOINT: GET /api/integrations/github/status?workspace_id={id}

AUTH: authenticated user who is a member of workspace_id

LOGIC:
1. Fetch active connection for (workspace_id, 'github')
2. If no connection: return { connected: false }
3. If connection found: call validateGitHubConnection(...)
4. Update connection health in DB (recordValidation)
5. Return status

RESPONSE (200):
{
  connected: boolean,
  account_name?: string,    // GitHub username
  scopes?: string[],
  status?: 'active' | 'expired' | 'error',
  last_validated_at?: string,
  error?: string
}

This endpoint is designed to be called by settings pages / frontend polling.
Keep it fast — validate once per 5 minutes max (add last_validated_at check).

FILE: apps/web/src/app/api/integrations/github/status/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.12,
          },

          {
            title: 'QA — GitHub connection flow tests (unit + integration)',
            description: `Write tests for the GitHub connection flow.

TEST CASES:

1. generateGitHubAuthUrl
   - Returns URL with correct client_id, scope, state
   - State is base64-decodable to { workspaceId, userId, returnUrl }

2. validateOAuthState
   - Valid state, correct workspaceId → { valid: true, decoded }
   - Tampered workspaceId in state → { valid: false }
   - Malformed state → { valid: false }

3. exchangeGitHubCode (mocked HTTP)
   - Success: returns { access_token, scope }
   - GitHub returns error: throws with message

4. storeGitHubConnection (mocked Supabase)
   - Calls createProviderConnection then activateConnection
   - provider_account_id = String(githubUser.id)
   - access_token_ref = token

5. /api/integrations/github/connect (integration test)
   - Missing workspace_id → 400
   - Unauthenticated → 401
   - Valid → 200 with oauth_url

6. /api/integrations/github/callback (mocked code exchange)
   - Invalid state → redirect with github_error
   - Valid code → stores connection, redirects to returnUrl?github_connected=true

FILE: apps/web/src/__tests__/github-connection.test.ts`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        4,
            estimated_cost_usd: 0.18,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS6 — Vercel Connection Backend
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS6 — Vercel Connection Backend',
        description:
          'Implement Vercel token-based connection. ' +
          'Users paste their Vercel API token (and optional team ID). ' +
          'The system validates the token, fetches account info, and stores the connection. ' +
          'This is simpler than OAuth — Vercel PATs are long-lived and user-controlled.',
        priority:    'critical',
        order_index: 5,
        tasks: [
          {
            title: 'Backend Service — vercel-connection.ts token connection',
            description: `Create src/lib/vercel-connection.ts implementing Vercel PAT connection.

OBJECTIVE:
Allow users to connect their Vercel account by providing a personal access token (and
optionally a team ID). The system validates the token, fetches user/team info, and stores
the connection as an active provider_connection.

REQUIRED EXPORTS:

// Connect a Vercel account via PAT
export async function connectVercelToken(
  admin: SupabaseClient,
  params: {
    workspaceId: string
    userId: string
    token: string          // Vercel personal access token
    teamId?: string        // Vercel team ID (optional)
  }
): Promise<ProviderConnection>

IMPLEMENTATION:
1. Validate token by calling GET https://api.vercel.com/v2/user
   Headers: { Authorization: 'Bearer {token}' }
   If 401 → throw Error('[vercel-connection] Invalid Vercel token')
2. If teamId provided: call GET https://api.vercel.com/v2/teams/{teamId}
   Verify token has access to that team
3. Fetch user info: { id, username, email, name }
4. Revoke any existing active Vercel connection for the workspace
5. Create and activate new connection:
   provider_account_id = user.id (or team.id if teamId provided)
   provider_account_name = teamId ? team.name : user.username
   access_token_ref = token
   metadata = { user_id: user.id, username: user.username, team_id: teamId, team_name: team.name }
   scopes = ['full_access']  // PATs have full access

// Validate an existing Vercel connection
export async function validateVercelConnection(
  connectionId: string,
  workspaceId: string,
  admin: SupabaseClient
): Promise<{ healthy: boolean; username?: string; team?: string; error?: string }>

IMPLEMENTATION:
1. getTokenForConnection(admin, connectionId, workspaceId)
2. GET /v2/user with token
3. If 200: recordValidation(admin, connectionId, true), return { healthy: true, username }
4. If 401: recordValidation(admin, connectionId, false, 'Token invalid'), return { healthy: false }

ENV VARS: none required (user provides their own token)

FILE: apps/web/src/lib/vercel-connection.ts`,
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.20,
          },

          {
            title: 'API Route — POST /api/integrations/vercel/connect',
            description: `Create apps/web/src/app/api/integrations/vercel/connect/route.ts

OBJECTIVE:
API endpoint for users to connect their Vercel account by submitting a PAT.

ENDPOINT: POST /api/integrations/vercel/connect

REQUEST BODY:
{
  workspace_id: string
  token: string          // Vercel PAT (or: vercel_XXXXXXXXXX format)
  team_id?: string       // Optional Vercel team ID
}

AUTH: authenticated user + workspace membership

LOGIC:
1. Verify user is authenticated and is member of workspace_id
2. Validate: token must start with 'vercel_' OR be a valid JWT-like string
3. Call connectVercelToken(admin, { workspaceId, userId, token, teamId })
4. Return connection info (without the raw token)

RESPONSE (201):
{
  connection_id: string,
  account_name: string,     // Vercel username or team name
  team_id?: string,
  status: 'active'
}

ERRORS:
- 400: missing workspace_id or token
- 400: invalid token format
- 401: not authenticated
- 403: user is not a member of workspace
- 422: token is invalid (Vercel API rejected it)
- 409: connection already exists (active) → caller should disconnect first

FILE: apps/web/src/app/api/integrations/vercel/connect/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'API Route — GET /api/integrations/vercel/status + DELETE /api/integrations/vercel/disconnect',
            description: `Create apps/web/src/app/api/integrations/vercel/status/route.ts
and apps/web/src/app/api/integrations/vercel/disconnect/route.ts

OBJECTIVE:
Status check and disconnection endpoints for Vercel connections.

STATUS ENDPOINT: GET /api/integrations/vercel/status?workspace_id={id}
AUTH: authenticated workspace member

LOGIC:
1. Fetch active Vercel connection for workspace
2. If none: return { connected: false }
3. Call validateVercelConnection(...) — rate-limited: only re-validate if last_validated_at > 5 min ago
4. Return status

RESPONSE (200):
{
  connected: boolean,
  account_name?: string,
  team_id?: string,
  status?: 'active' | 'expired' | 'error',
  last_validated_at?: string,
  error?: string
}

DISCONNECT ENDPOINT: POST /api/integrations/vercel/disconnect
AUTH: authenticated workspace admin or owner

REQUEST BODY:
{ workspace_id: string }

LOGIC:
1. Verify user is workspace admin/owner
2. Fetch active Vercel connection
3. Call revokeConnection(admin, connectionId)
4. Return { disconnected: true }

FILE:
  apps/web/src/app/api/integrations/vercel/status/route.ts
  apps/web/src/app/api/integrations/vercel/disconnect/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.14,
          },

          {
            title: 'QA — Vercel connection tests: connect, validate, disconnect',
            description: `Write tests for the Vercel connection flow.

TEST CASES:

1. connectVercelToken — happy path (mocked Vercel API)
   - Token = 'vercel_test_token'
   - Mocked GET /v2/user returns { id: 'usr_123', username: 'testuser' }
   - Connection created with status = 'active'
   - provider_account_name = 'testuser'
   - access_token_ref = 'vercel_test_token'

2. connectVercelToken — with teamId
   - Mocked GET /v2/teams/team_123 returns { id: 'team_123', name: 'My Team' }
   - provider_account_id = 'team_123'
   - metadata.team_name = 'My Team'

3. connectVercelToken — invalid token (Vercel returns 401)
   - Throws '[vercel-connection] Invalid Vercel token'

4. Duplicate connection
   - Connect once (active connection created)
   - Connect again → old connection revoked, new connection active
   - listWorkspaceConnections returns only 1 active Vercel connection

5. validateVercelConnection — healthy
   - Mocked /v2/user returns 200 → { healthy: true, username: 'testuser' }
   - last_validated_at updated in DB

6. validateVercelConnection — token revoked
   - Mocked /v2/user returns 401 → { healthy: false, error: 'Token invalid' }
   - Connection status updated to 'error'

7. /api/integrations/vercel/connect (integration test)
   - Missing token → 400
   - Valid token + valid workspace → 201 with connection_id

8. /api/integrations/vercel/disconnect
   - Admin user → 200, connection revoked
   - Non-admin user → 403

FILE: apps/web/src/__tests__/vercel-connection.test.ts`,
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.16,
          },
        ],
      },

      // ══════════════════════════════════════════════════════════════════════
      // WS7 — Provisioning Integration
      // ══════════════════════════════════════════════════════════════════════
      {
        title: 'WS7 — Provisioning Integration',
        description:
          'Update the provisioning pipeline to use the ownership resolver. ' +
          'When a workspace has user-managed connections, provisioning must use those credentials ' +
          'instead of platform defaults. Platform-managed remains the fallback.',
        priority:    'critical',
        order_index: 6,
        tasks: [
          {
            title: 'Backend — Update provision/route.ts with ownership-aware provisioning',
            description: `Modify apps/web/src/app/api/projects/[id]/provision/route.ts to call the ownership resolver.

OBJECTIVE:
Before calling provisionGitHubRepo or provisionVercelProject, resolve the ownership mode.
Use user-managed credentials when available; fall back to platform-managed.

CHANGES:

1. Import resolveProviderOwnership from '@/lib/ownership-resolver'

2. Before GitHub provisioning, add:
   const githubOwnership = await resolveProviderOwnership(admin, projectId, 'github')
   Log: console.log('[provision/route] GitHub ownership:', githubOwnership.mode)

3. Pass the resolved token to GitHub provisioning:
   const githubToken = githubOwnership.mode === 'user_managed'
     ? githubOwnership.access_token
     : undefined  // provisionGitHubRepo uses env vars when undefined

4. Before Vercel provisioning, add:
   const vercelOwnership = await resolveProviderOwnership(admin, projectId, 'vercel')

5. Pass resolved Vercel token and teamId:
   const vercelToken = vercelOwnership.mode === 'user_managed'
     ? vercelOwnership.access_token
     : undefined
   const vercelTeamId = vercelOwnership.mode === 'user_managed'
     ? vercelOwnership.team_id
     : process.env.VERCEL_TEAM_ID

6. Update saveProvisioningResult call to pass connection IDs:
   await saveProvisioningResult(projectId, githubResult, vercelResult, {
     githubConnectionId: githubOwnership.connection_id,
     vercelConnectionId: vercelOwnership.connection_id,
   })

7. Add ownership info to the success response:
   ownership: {
     github: githubOwnership.mode,
     vercel: vercelOwnership.mode,
   }

BACKWARD COMPATIBILITY:
- When no user connections exist → ownership resolves to platform_managed → existing behavior unchanged
- Existing callers unaffected (provision endpoint signature unchanged)

FILE: apps/web/src/app/api/projects/[id]/provision/route.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.16,
          },

          {
            title: 'Backend — Update github-provision.ts to accept override token',
            description: `Modify apps/web/src/lib/github-provision.ts to accept an optional override token.

OBJECTIVE:
Allow the provision route to inject a user-provided token into the GitHub provisioning flow.
The override token bypasses the env var resolution when provided.

CHANGES TO GitHubProvisionInput:
  interface GitHubProvisionInput {
    id: string
    slug: string
    name: string
    overrideToken?: string    // User-managed GitHub PAT — takes highest priority
    overrideOrg?: string      // Optional: use this org instead of GITHUB_ORG env var
  }

CHANGES TO resolveGitHubToken():
  Current priority: (1) GITHUB_TOKEN env var, (2) GitHub App
  New priority: (1) overrideToken from input, (2) GITHUB_TOKEN env var, (3) GitHub App

  Modify resolveGitHubToken to accept an optional overrideToken:
  async function resolveGitHubToken(overrideToken?: string): Promise<string> {
    if (overrideToken) return overrideToken
    // ... existing logic
  }

CHANGES TO provisionGitHubRepo:
  - Accept overrideToken from input
  - Pass to resolveGitHubToken(input.overrideToken)
  - If overrideOrg provided: use it instead of process.env.GITHUB_ORG

  Also: update the org detection to use overrideOrg if set:
    const org = input.overrideOrg || process.env.GITHUB_ORG
    if (!org) throw new GitHubAuthError('No GitHub org configured...')

BACKWARD COMPATIBILITY:
- If overrideToken is not provided: existing env var logic unchanged
- All existing callers (tests, provision route) still work

FILE: apps/web/src/lib/github-provision.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.12,
          },

          {
            title: 'Backend — Update vercel-provision.ts to accept override token',
            description: `Modify apps/web/src/lib/vercel-provision.ts to accept override token and teamId.

OBJECTIVE:
Allow the provision route to inject user-provided Vercel credentials into the provisioning flow.

CHANGES TO ProvisionOptions:
  interface ProvisionOptions {
    ...existing fields...
    overrideToken?: string    // User-managed Vercel token — takes highest priority
    // teamId already exists — no change needed (it's already a param)
  }

CHANGES TO getToken():
  Export a new version that accepts override:
  function resolveVercelToken(overrideToken?: string): string {
    if (overrideToken) return overrideToken
    const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN
    if (!token) throw new VercelAuthError('VERCEL_TOKEN not set', 401)
    return token
  }

CHANGES TO provisionVercelProject:
  - Accept overrideToken in ProvisionOptions
  - Use resolveVercelToken(options.overrideToken) instead of getToken()

Also update getVercelProjectInfo and injectVercelEnvVars to accept optional overrideToken.

BACKWARD COMPATIBILITY:
- If overrideToken not provided: existing behavior unchanged
- All existing callers still work

FILE: apps/web/src/lib/vercel-provision.ts`,
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.12,
          },

          {
            title: 'Integration Test — E2E ownership-aware provisioning with fallback',
            description: `Write an integration test that verifies ownership-aware provisioning end-to-end.

OBJECTIVE:
Confirm the full provision flow works correctly in both user-managed and platform-managed modes.
This is the critical acceptance test for the entire P11.2 milestone.

TEST SCENARIO A — Platform fallback (no user connection):
1. Create project in workspace with no provider_connections
2. Call POST /api/projects/{id}/provision with x-buildos-secret
3. Expect:
   - Response 200 with success: true
   - Response.ownership.github = 'platform_managed'
   - Response.ownership.vercel = 'platform_managed'
   - project_integrations has both rows with provider_connection_id = null

TEST SCENARIO B — User-managed GitHub (mocked):
1. Create active github provider_connection for the project's workspace
   with access_token_ref = 'ghp_test_user_token'
2. Call provision endpoint
3. Expect:
   - GitHub provisioning uses 'ghp_test_user_token' (verify via mock/spy)
   - Response.ownership.github = 'user_managed'
   - project_integrations GitHub row has provider_connection_id = connection.id

TEST SCENARIO C — No cross-workspace leakage:
1. Workspace A has active GitHub connection
2. Project belongs to Workspace B
3. Call provision for Workspace B's project
4. GitHub provisioning uses platform_managed (not workspace A's token)

TEST SCENARIO D — Fallback when token expired:
1. Create connection with token_expires_at = 1 hour ago
2. Call provision
3. Expect: platform_managed fallback used

NOTES:
- Use real DB (test project) or fully mocked Supabase
- Mock the actual GitHub API and Vercel API calls (don't create real repos)
- Focus on ownership resolution correctness, not GitHub/Vercel API behavior

FILE: apps/web/src/__tests__/provisioning-ownership.test.ts (or e2e/)`,
            agent_role:         'integration_engineer',
            task_type:          'test',
            priority:           'critical',
            order_index:        3,
            estimated_cost_usd: 0.20,
          },
        ],
      },
    ],
  },
]
