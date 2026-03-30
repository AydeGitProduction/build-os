// /apps/web/src/lib/provision-db.ts

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Well-known provider UUIDs — from integration_providers table
// ---------------------------------------------------------------------------
const GITHUB_PROVIDER_ID = '05e2c85b-69f5-4eb4-b2d0-cf243b2f2838';
const VERCEL_PROVIDER_ID = '3acd1958-53d9-48fb-81a6-9ee70ea3ad69';

// System credential UUIDs — created once at infrastructure setup
// These are system-level service credentials (not user credentials)
const GITHUB_SYSTEM_CREDENTIAL_ID = '4109f41e-a483-4624-8b12-6eb020b90399';
const VERCEL_SYSTEM_CREDENTIAL_ID = '5f25b3cb-f8d4-460b-a814-257f5630ce48';

// System user UUID (service account)
const SYSTEM_USER_ID = '614c0632-50a0-44fb-b6e8-8563d08fa1c3';

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
        credential_id: GITHUB_SYSTEM_CREDENTIAL_ID,
        status: 'active',
        environment_map: {
          github_repo_id: github.repoId,
          github_repo_name: github.repoName,
          github_repo_url: github.repoUrl,
        },
        created_by: SYSTEM_USER_ID,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'project_id,provider_id',
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
        credential_id: VERCEL_SYSTEM_CREDENTIAL_ID,
        status: 'active',
        environment_map: {
          vercel_project_id: vercel.vercelProjectId,
          vercel_project_name: vercel.projectName,
          production_url: vercel.productionUrl,
        },
        created_by: SYSTEM_USER_ID,
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
