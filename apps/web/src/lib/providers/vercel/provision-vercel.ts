// src/lib/providers/vercel/provision-vercel.ts
import { AdminClient } from '@/lib/supabase/admin-client';
import { resolveVercelOwnership } from '@/lib/ownership/resolve-vercel-ownership';
import { OwnershipResolutionError } from '@/lib/ownership/resolve-provider-ownership';

// ── Vercel REST API client ────────────────────────────────────────────────────

interface VercelClientOptions {
  token: string;
  teamId?: string;
}

interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework: string | null;
  link?: {
    type: string;
    repo?: string;
  };
}

interface VercelDeployment {
  id: string;
  url: string;
  name: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  created: number;
  meta: Record<string, string>;
}

interface VercelEnvVar {
  id?: string;
  key: string;
  value: string;
  type: 'plain' | 'secret' | 'encrypted' | 'system';
  target: Array<'production' | 'preview' | 'development'>;
}

class VercelApiClient {
  private readonly baseUrl = 'https://api.vercel.com';
  private readonly headers: HeadersInit;
  private readonly teamQuery: string;

  constructor(private readonly opts: VercelClientOptions) {
    this.headers = {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    };
    this.teamQuery = opts.teamId ? `teamId=${encodeURIComponent(opts.teamId)}` : '';
  }

  private buildUrl(path: string, extraQuery?: string): string {
    const parts = [this.teamQuery, extraQuery].filter(Boolean).join('&');
    return `${this.baseUrl}${path}${parts ? `?${parts}` : ''}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraQuery?: string,
  ): Promise<T> {
    const url = this.buildUrl(path, extraQuery);
    const response = await fetch(url, {
      method,
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      let errorDetail = response.statusText;
      try {
        const errJson = await response.json();
        errorDetail = errJson?.error?.message ?? errJson?.message ?? errorDetail;
      } catch {
        // ignore JSON parse failure
      }
      throw new VercelApiError(
        `Vercel API ${method} ${path} failed [${response.status}]: ${errorDetail}`,
        response.status,
        path,
      );
    }

    return response.json() as Promise<T>;
  }

  async getProject(projectNameOrId: string): Promise<VercelProject> {
    return this.request<VercelProject>('GET', `/v9/projects/${encodeURIComponent(projectNameOrId)}`);
  }

  async createProject(payload: {
    name: string;
    framework?: string;
    gitRepository?: { type: 'github' | 'gitlab' | 'bitbucket'; repo: string };
    environmentVariables?: VercelEnvVar[];
  }): Promise<VercelProject> {
    return this.request<VercelProject>('POST', '/v9/projects', payload);
  }

  async deleteProject(projectNameOrId: string): Promise<void> {
    await this.request<void>('DELETE', `/v9/projects/${encodeURIComponent(projectNameOrId)}`);
  }

  async upsertEnvVars(
    vercelProjectId: string,
    vars: VercelEnvVar[],
  ): Promise<{ created: VercelEnvVar[]; updated: VercelEnvVar[] }> {
    return this.request<{ created: VercelEnvVar[]; updated: VercelEnvVar[] }>(
      'POST',
      `/v9/projects/${encodeURIComponent(vercelProjectId)}/env`,
      vars,
    );
  }

  async getDeployments(
    vercelProjectId: string,
    limit = 10,
  ): Promise<{ deployments: VercelDeployment[] }> {
    return this.request<{ deployments: VercelDeployment[] }>(
      'GET',
      `/v6/deployments`,
      undefined,
      `projectId=${encodeURIComponent(vercelProjectId)}&limit=${limit}`,
    );
  }

  async triggerDeployment(payload: {
    name: string;
    gitSource?: { type: 'github'; repoId: string; ref: string };
    project?: string;
    target?: 'production' | 'staging';
    meta?: Record<string, string>;
  }): Promise<VercelDeployment> {
    return this.request<VercelDeployment>('POST', '/v13/deployments', payload);
  }

  async getDomains(vercelProjectId: string): Promise<{ domains: Array<{ name: string }> }> {
    return this.request<{ domains: Array<{ name: string }> }>(
      'GET',
      `/v9/projects/${encodeURIComponent(vercelProjectId)}/domains`,
    );
  }

  async addDomain(vercelProjectId: string, domain: string): Promise<{ name: string }> {
    return this.request<{ name: string }>(
      'POST',
      `/v9/projects/${encodeURIComponent(vercelProjectId)}/domains`,
      { name: domain },
    );
  }
}

class VercelApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

// ── Provisioning input/output types ──────────────────────────────────────────

export interface VercelProvisionInput {
  /** Internal project UUID */
  projectId: string;
  /** Desired Vercel project name */
  vercelProjectName: string;
  /** Frontend framework hint */
  framework?: 'nextjs' | 'react' | 'vue' | 'svelte' | 'static' | null;
  /** Git repo to link (optional) */
  gitRepository?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string; // e.g. "org/repo"
  };
  /** Environment variables to inject */
  environmentVariables?: Array<{
    key: string;
    value: string;
    targets?: Array<'production' | 'preview' | 'development'>;
  }>;
  /** Custom domain to attach */
  customDomain?: string;
  /** Deployment target */
  deployTarget?: 'production' | 'staging';
}

export interface VercelProvisionOutput {
  vercelProjectId: string;
  vercelProjectName: string;
  deploymentId?: string;
  deploymentUrl?: string;
  ownershipMode: 'user_managed' | 'platform_managed';
  teamId?: string;
}

// ── Main provisioning function ────────────────────────────────────────────────

/**
 * Provisions a Vercel project for the given internal project.
 *
 * Token resolution:
 *  - user_managed  → uses decrypted token + team_id from provider_connections metadata
 *  - platform_managed → uses VERCEL_TOKEN (+ VERCEL_TEAM_ID) env vars
 *
 * @param admin  - Supabase admin client with service-role privileges
 * @param input  - Provisioning parameters
 */
export async function provisionVercelProject(
  admin: AdminClient,
  input: VercelProvisionInput,
): Promise<VercelProvisionOutput> {
  const { projectId, vercelProjectName } = input;

  // ── Step 1: Resolve ownership (replaces raw process.env.VERCEL_TOKEN) ────
  let ownership: Awaited<ReturnType<typeof resolveVercelOwnership>>;
  try {
    ownership = await resolveVercelOwnership(admin, projectId);
  } catch (err) {
    if (err instanceof OwnershipResolutionError) {
      throw new Error(
        `[provisionVercelProject] Cannot resolve Vercel credentials for project ${projectId}: ${err.message} (code: ${err.code})`,
      );
    }
    throw err;
  }

  // ── Step 2: Build API client with resolved credentials ───────────────────
  const vercel = new VercelApiClient({
    token: ownership.token,              // ← resolved token (NOT process.env.VERCEL_TOKEN directly)
    teamId: ownership.teamId,            // ← from connection metadata or env fallback
  });

  // ── Step 3: Create or retrieve Vercel project ────────────────────────────
  let vercelProject: VercelProject;

  try {
    // Attempt to fetch existing project first (idempotent)
    vercelProject = await vercel.getProject(vercelProjectName);
  } catch (err) {
    if (err instanceof VercelApiError && err.statusCode === 404) {
      // Project doesn't exist — create it
      vercelProject = await vercel.createProject({
        name: vercelProjectName,
        framework: input.framework ?? undefined,
        ...(input.gitRepository ? { gitRepository: input.gitRepository } : {}),
      });
    } else {
      throw err;
    }
  }

  // ── Step 4: Upsert environment variables ─────────────────────────────────
  if (input.environmentVariables && input.environmentVariables.length > 0) {
    const envVars: VercelEnvVar[] = input.environmentVariables.map((v) => ({
      key: v.key,
      value: v.value,
      type: 'encrypted',
      target: v.targets ?? ['production', 'preview', 'development'],
    }));

    await vercel.upsertEnvVars(vercelProject.id, envVars);
  }

  // ── Step 5: Attach custom domain (optional) ──────────────────────────────
  if (input.customDomain) {
    try {
      await vercel.addDomain(vercelProject.id, input.customDomain);
    } catch (err) {
      // Domain conflicts are non-fatal; log and continue
      console.warn(
        `[provisionVercelProject] Could not attach domain "${input.customDomain}" to ${vercelProject.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Step 6: Trigger initial deployment (if git source configured) ─────────
  let deployment: VercelDeployment | undefined;

  if (input.gitRepository) {
    try {
      deployment = await vercel.triggerDeployment({
        name: vercelProjectName,
        project: vercelProject.id,
        target: input.deployTarget ?? 'production',
        meta: {
          buildOs: 'true',
          internalProjectId: projectId,
        },
      });
    } catch (err) {
      // Deployment trigger failures are non-fatal for provisioning
      console.warn(
        `[provisionVercelProject] Deployment trigger failed for ${vercelProject.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Step 7: Persist vercel_project_id back to DB ─────────────────────────
  const { error: updateError } = await admin
    .from('projects')
    .update({
      vercel_project_id: vercelProject.id,
      vercel_project_name: vercelProject.name,
      vercel_team_id: ownership.teamId ?? null,
      vercel_ownership_mode: ownership.mode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (updateError) {
    console.error(
      `[provisionVercelProject] Failed to update project record for ${projectId}:`,
      updateError,
    );
    // Non-fatal; provisioning succeeded even if DB update fails here
  }

  return {
    vercelProjectId: vercelProject.id,
    vercelProjectName: vercelProject.name,
    deploymentId: deployment?.id,
    deploymentUrl: deployment ? `https://${deployment.url}` : undefined,
    ownershipMode: ownership.mode,
    teamId: ownership.teamId,
  };
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export interface VercelTeardownInput {
  projectId: string;
  vercelProjectId: string;
}

/**
 * Tears down a Vercel project.
 * Uses the same ownership resolver so teardown respects the same
 * user_managed / platform_managed split.
 */
export async function teardownVercelProject(
  admin: AdminClient,
  input: VercelTeardownInput,
): Promise<void> {
  const { projectId, vercelProjectId } = input;

  const ownership = await resolveVercelOwnership(admin, projectId);

  const vercel = new VercelApiClient({
    token: ownership.token,
    teamId: ownership.teamId,
  });

  await vercel.deleteProject(vercelProjectId);

  await admin
    .from('projects')
    .update({
      vercel_project_id: null,
      vercel_project_name: null,
      vercel_team_id: null,
      vercel_ownership_mode: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}