// /apps/web/src/lib/provision-db.ts

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Well-known provider UUIDs — DO NOT change these values
// ---------------------------------------------------------------------------
const GITHUB_PROVIDER_ID = 'a0000000-0000-0000-0000-000000000001';
const VERCEL_PROVIDER_ID = 'a0000000-0000-0000-0000-000000000002';

// Well-known environment UUID for the production environment
const PRODUCTION_ENVIRONMENT_ID = '6766fc48-d89b-4a73-bfb0-a2b851de0ad9';

// ---------------------------------------------------------------------------
// Supabase admin client (service-role key — bypasses RLS)
// ---------------------------------------------------------------------------
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      '[provision-db] Missing environment variable: NEXT_PUBLIC_SUPABASE_URL'
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      '[provision-db] Missing environment variable: SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable automatic session persistence — admin client must never
      // store or refresh tokens; it only uses the service-role key.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubProvisioningInfo {
  repoId: number;
  repoName: string;
  repoUrl: string;
}

interface VercelProvisioningInfo {
  vercelProjectId: string;
  projectName: string;
  productionUrl: string;
}

// ---------------------------------------------------------------------------
// saveProvisioningResult
// ---------------------------------------------------------------------------

/**
 * Persists the result of a successful project provisioning run.
 *
 * Writes / updates:
 *   • project_integrations  — one row for GitHub, one row for Vercel
 *   • deployment_targets    — one row for the production environment
 *
 * All operations use upsert semantics so the function is safely idempotent;
 * re-running provisioning for the same project will update existing rows
 * rather than fail with a uniqueness violation.
 *
 * @param projectId  UUID of the project in the `projects` table.
 * @param github     Details of the GitHub repository that was created.
 * @param vercel     Details of the Vercel project that was created.
 */
export async function saveProvisioningResult(
  projectId: string,
  github: GitHubProvisioningInfo,
  vercel: VercelProvisioningInfo
): Promise<void> {
  const supabase = getAdminClient();

  // -------------------------------------------------------------------------
  // 1. Upsert project_integrations — GitHub
  // -------------------------------------------------------------------------
  const { error: githubIntegrationError } = await supabase
    .from('project_integrations')
    .upsert(
      {
        project_id: projectId,
        provider_id: GITHUB_PROVIDER_ID,
        status: 'active',
        environment_map: {
          github_repo_id: github.repoId,
          github_repo_name: github.repoName,
          github_repo_url: github.repoUrl,
        },
        // updated_at is handled by the DB trigger / default, but we set it
        // explicitly here so the upsert conflict-update path also refreshes it.
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'project_id,provider_id',
        // ignoreDuplicates: false  ← default; we want to UPDATE on conflict
      }
    );

  if (githubIntegrationError) {
    throw new Error(
      `[provision-db] Failed to upsert GitHub project_integration for project ${projectId}: ${githubIntegrationError.message}`
    );
  }

  // -------------------------------------------------------------------------
  // 2. Upsert project_integrations — Vercel
  // -------------------------------------------------------------------------
  const { error: vercelIntegrationError } = await supabase
    .from('project_integrations')
    .upsert(
      {
        project_id: projectId,
        provider_id: VERCEL_PROVIDER_ID,
        status: 'active',
        environment_map: {
          vercel_project_id: vercel.vercelProjectId,
          vercel_project_name: vercel.projectName,
          production_url: vercel.productionUrl,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'project_id,provider_id',
      }
    );

  if (vercelIntegrationError) {
    throw new Error(
      `[provision-db] Failed to upsert Vercel project_integration for project ${projectId}: ${vercelIntegrationError.message}`
    );
  }

  // -------------------------------------------------------------------------
  // 3. Upsert deployment_targets — production environment
  // -------------------------------------------------------------------------
  const { error: deploymentTargetError } = await supabase
    .from('deployment_targets')
    .upsert(
      {
        project_id: projectId,
        environment_id: PRODUCTION_ENVIRONMENT_ID,
        provider: 'vercel',
        status: 'live',
        target_config: {
          vercel_project_id: vercel.vercelProjectId,
          project_url: vercel.productionUrl,
          github_repo: github.repoName,
          provisioned_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'project_id,environment_id',
      }
    );

  if (deploymentTargetError) {
    throw new Error(
      `[provision-db] Failed to upsert deployment_target for project ${projectId} / environment ${PRODUCTION_ENVIRONMENT_ID}: ${deploymentTargetError.message}`
    );
  }
}
