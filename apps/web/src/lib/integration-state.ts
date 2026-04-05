/**
 * integration-state.ts — WS3: Canonical Integration State
 *
 * Single source of truth for per-project integration data.
 * ALL downstream systems (agent/output, dispatch, scaffold, QA, guardian)
 * MUST read integration data from this module — never from project_integrations,
 * deployment_targets, or env vars directly.
 *
 * Schema: project_integration_state (migration: MIGRATE-AUTH-INTEGRATION.sql)
 *   - project_id              (FK → projects.id, UNIQUE)
 *   - github_installation_id  (string)
 *   - github_repo_fullname    (string, "owner/repo")
 *   - vercel_project_id       (string)
 *   - env_template_version    (string, semver, e.g. "1.0.0")
 *   - last_verified_at        (timestamptz)
 *   - created_at / updated_at
 *
 * No dual truth sources: project_integrations and deployment_targets remain
 * for legacy FK constraints but are NOT the authority — this table is.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectIntegrationState {
  project_id: string
  github_installation_id: string
  github_repo_fullname: string    // "owner/repo"
  vercel_project_id: string
  env_template_version: string    // semver, current: "1.0.0"
  last_verified_at: string | null // ISO 8601
  created_at: string
  updated_at: string
}

export interface UpsertIntegrationStateInput {
  project_id: string
  github_installation_id?: string
  github_repo_fullname?: string
  vercel_project_id?: string
  env_template_version?: string
  /** If true, updates last_verified_at to now() */
  markVerified?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the canonical integration state for a project.
 * Returns null if no record exists (project not yet bootstrapped).
 *
 * ALL downstream systems must call this — not project_integrations directly.
 */
export async function getIntegrationState(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<ProjectIntegrationState | null> {
  const { data, error } = await admin
    .from('project_integration_state')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    console.error(
      `[integration-state] Failed to read state for project ${projectId}: ${error.message}`,
    )
    return null
  }

  return data as ProjectIntegrationState | null
}

/**
 * Reads integration state and throws if not found.
 * Use when the caller cannot proceed without integration state.
 */
export async function requireIntegrationState(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<ProjectIntegrationState> {
  const state = await getIntegrationState(projectId, admin)
  if (!state) {
    throw new Error(
      `[integration-state] No canonical integration state for project ${projectId}. ` +
        `Run bootstrap first or call upsertIntegrationState after provisioning.`,
    )
  }
  return state
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts the canonical integration state for a project.
 * Safe to call multiple times — idempotent via ON CONFLICT (project_id).
 *
 * Call after:
 *   - GitHub repo is provisioned (set github_installation_id + github_repo_fullname)
 *   - Vercel project is provisioned (set vercel_project_id)
 *   - Env vars are injected (set env_template_version)
 *   - Preflight passes (set markVerified=true)
 */
export async function upsertIntegrationState(
  input: UpsertIntegrationStateInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<ProjectIntegrationState | null> {
  const now = new Date().toISOString()

  const upsertData: Record<string, unknown> = {
    project_id: input.project_id,
    updated_at: now,
  }

  if (input.github_installation_id !== undefined) {
    upsertData.github_installation_id = input.github_installation_id
  }
  if (input.github_repo_fullname !== undefined) {
    upsertData.github_repo_fullname = input.github_repo_fullname
  }
  if (input.vercel_project_id !== undefined) {
    upsertData.vercel_project_id = input.vercel_project_id
  }
  if (input.env_template_version !== undefined) {
    upsertData.env_template_version = input.env_template_version
  }
  if (input.markVerified) {
    upsertData.last_verified_at = now
  }

  const { data, error } = await admin
    .from('project_integration_state')
    .upsert(upsertData, { onConflict: 'project_id' })
    .select('*')
    .single()

  if (error) {
    console.error(
      `[integration-state] Upsert failed for project ${input.project_id}: ${error.message}`,
    )
    return null
  }

  console.log(
    `[integration-state] Upserted canonical state for project ${input.project_id}:`,
    {
      github_installation_id: data.github_installation_id,
      github_repo_fullname: data.github_repo_fullname,
      vercel_project_id: data.vercel_project_id,
      env_template_version: data.env_template_version,
      last_verified_at: data.last_verified_at,
    },
  )

  return data as ProjectIntegrationState
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap integration: migrate from legacy tables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads existing data from project_integrations + deployment_targets and
 * writes it into project_integration_state. Use during migration or when
 * project_integration_state row is missing for an already-bootstrapped project.
 *
 * This is safe to call on every bootstrap — it's idempotent.
 */
export async function syncIntegrationStateFromLegacy(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
): Promise<ProjectIntegrationState | null> {
  console.log(
    `[integration-state] Syncing from legacy tables for project ${projectId}`,
  )

  // Read from project_integrations (GitHub)
  const { data: piRow } = await admin
    .from('project_integrations')
    .select('environment_map, status')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .maybeSingle()

  // Read from deployment_targets (Vercel)
  const { data: dtRow } = await admin
    .from('deployment_targets')
    .select('target_config, provider')
    .eq('project_id', projectId)
    .eq('provider', 'vercel')
    .eq('status', 'live')
    .maybeSingle()

  // WS5: sync must use PROJECT installation ID — the one that can write to project repos.
  // NEVER reads GITHUB_INSTALLATION_ID (platform path).
  const ghInstallId =
    (process.env.PROJECT_GITHUB_INSTALLATION_ID ?? process.env.GITHUB_APP_INSTALLATION_ID) || ''
  const ghRepoFullname =
    (piRow?.environment_map as { github_repo_url?: string })?.github_repo_url
      ? extractFullname(
          (piRow.environment_map as { github_repo_url?: string }).github_repo_url ?? '',
        )
      : ''
  const vercelProjectId =
    (dtRow?.target_config as { vercel_project_id?: string })?.vercel_project_id ?? ''

  if (!ghRepoFullname && !vercelProjectId) {
    console.warn(
      `[integration-state] Nothing to sync from legacy tables for project ${projectId}`,
    )
    return null
  }

  return upsertIntegrationState(
    {
      project_id: projectId,
      github_installation_id: ghInstallId,
      github_repo_fullname: ghRepoFullname,
      vercel_project_id: vercelProjectId,
      env_template_version: '0.0.0', // unknown — will be set by bootstrap
    },
    admin,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractFullname(repoUrl: string): string {
  // Handles: https://github.com/org/repo, git@github.com:org/repo.git, org/repo
  const match = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (match) return match[1]
  // Already "org/repo" format
  if (repoUrl.includes('/') && !repoUrl.includes('://')) return repoUrl
  return ''
}
