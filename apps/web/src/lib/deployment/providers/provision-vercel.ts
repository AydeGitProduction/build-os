// src/lib/deployment/providers/provision-vercel.ts

import {
  resolveProviderOwnership,
  OwnershipResolutionError,
  type ResolvedOwnership,
} from '../ownership-resolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VercelProvisionInput {
  /** The admin user ID (used for ownership resolution) */
  adminUserId: string;
  /** Internal project ID from our database */
  projectId: string;
  /** Human-readable project name used to create the Vercel project */
  projectName: string;
  /** Git repository URL to link (optional) */
  gitRepositoryUrl?: string;
  /** Git provider type */
  gitProvider?: 'github' | 'gitlab' | 'bitbucket';
  /** Framework preset */
  framework?: VercelFramework;
  /** Root directory of the project within the repo */
  rootDirectory?: string;
  /** Build command override */
  buildCommand?: string;
  /** Output directory override */
  outputDirectory?: string;
  /** Install command override */
  installCommand?: string;
  /** Environment variables to inject */
  environmentVariables?: VercelEnvVar[];
  /** Deployment region */
  region?: string;
}

export interface VercelProvisionResult {
  /** Vercel project ID */
  vercelProjectId: string;
  /** Vercel project name */
  vercelProjectName: string;
  /** Initial deployment URL */
  deploymentUrl?: string;
  /** Alias (production) URL */
  productionUrl?: string;
  /** Ownership mode used for this provisioning */
  ownershipMode: 'user_managed' | 'platform_managed';
  /** Team ID used (if any) */
  teamId?: string;
  /** Raw Vercel API project response */
  vercelProject: VercelProject;
}

export interface VercelEnvVar {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type?: 'plain' | 'secret' | 'encrypted';
}

export type VercelFramework =
  | 'nextjs'
  | 'create-react-app'
  | 'vite'
  | 'nuxtjs'
  | 'gatsby'
  | 'remix'
  | 'astro'
  | 'svelte'
  | 'angular'
  | null;

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  framework: VercelFramework;
  link?: {
    type: string;
    repo: string;
    repoId: number;
    org: string;
  };
  latestDeployments?: Array<{
    id: string;
    url: string;
    state: string;
    target: string;
  }>;
  alias?: Array<{ domain: string }>;
}

export interface VercelDeploymentEnvVar {
  id: string;
  key: string;
  target: string[];
  type: string;
  createdAt: number;
}

// ─── Vercel API Client ────────────────────────────────────────────────────────

class VercelApiClient {
  private readonly baseUrl = 'https://api.vercel.com';

  constructor(
    private readonly token: string,
    private readonly teamId?: string
  ) {}

  private buildUrl(path: string, extraParams?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.teamId) {
      url.searchParams.set('teamId', this.teamId);
    }
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraParams?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, extraParams);
    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsedError: { error?: { message?: string; code?: string } } = {};
      try {
        parsedError = JSON.parse(errorBody);
      } catch {
        // ignore parse error
      }

      throw new VercelApiError(
        parsedError.error?.message ?? `Vercel API error: ${response.status} ${response.statusText}`,
        response.status,
        parsedError.error?.code,
        { url, method, responseBody: errorBody }
      );
    }

    return response.json() as Promise<T>;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export class VercelApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

// ─── Core Provisioner ─────────────────────────────────────────────────────────

export class VercelProvisioner {
  /**
   * Provision a new Vercel project, resolving ownership first.
   *
   * Ownership resolution:
   * - user_managed  → uses the admin's connected Vercel token + team_id
   * - platform_managed → falls through to process.env.VERCEL_TOKEN
   */
  async provision(input: VercelProvisionInput): Promise<VercelProvisionResult> {
    // ── Step 1: Resolve ownership ─────────────────────────────────────────────
    const ownership = await resolveProviderOwnership(
      input.adminUserId,
      input.projectId,
      'vercel'
    );

    const client = new VercelApiClient(ownership.token, ownership.teamId);

    console.info('[VercelProvisioner] Ownership resolved', {
      mode: ownership.mode,
      hasTeamId: !!ownership.teamId,
      connectionId: ownership.connectionId,
      projectId: input.projectId,
    });

    // ── Step 2: Create Vercel project ─────────────────────────────────────────
    const vercelProject = await this.createProject(client, input, ownership);

    // ── Step 3: Inject environment variables (if provided) ────────────────────
    if (input.environmentVariables?.length) {
      await this.upsertEnvironmentVariables(
        client,
        vercelProject.id,
        input.environmentVariables
      );
    }

    // ── Step 4: Derive URLs ───────────────────────────────────────────────────
    const productionUrl = this.resolveProductionUrl(vercelProject, input.projectName);
    const deploymentUrl = vercelProject.latestDeployments?.[0]?.url
      ? `https://${vercelProject.latestDeployments[0].url}`
      : undefined;

    return {
      vercelProjectId: vercelProject.id,
      vercelProjectName: vercelProject.name,
      deploymentUrl,
      productionUrl,
      ownershipMode: ownership.mode,
      teamId: ownership.teamId,
      vercelProject,
    };
  }

  /**
   * Deprovision (delete) a Vercel project, resolving ownership first.
   */
  async deprovision(
    adminUserId: string,
    projectId: string,
    vercelProjectId: string
  ): Promise<void> {
    const ownership = await resolveProviderOwnership(adminUserId, projectId, 'vercel');
    const client = new VercelApiClient(ownership.token, ownership.teamId);

    console.info('[VercelProvisioner] Deprovisioning project', {
      mode: ownership.mode,
      vercelProjectId,
      projectId,
    });

    await client.delete(`/v9/projects/${vercelProjectId}`);
  }

  /**
   * Sync environment variables to an existing Vercel project.
   * Resolves ownership before making API calls.
   */
  async syncEnvironmentVariables(
    adminUserId: string,
    projectId: string,
    vercelProjectId: string,
    envVars: VercelEnvVar[]
  ): Promise<void> {
    const ownership = await resolveProviderOwnership(adminUserId, projectId, 'vercel');
    const client = new VercelApiClient(ownership.token, ownership.teamId);

    await this.upsertEnvironmentVariables(client, vercelProjectId, envVars);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async createProject(
    client: VercelApiClient,
    input: VercelProvisionInput,
    ownership: ResolvedOwnership
  ): Promise<VercelProject> {
    const payload: Record<string, unknown> = {
      name: input.projectName,
      framework: input.framework ?? null,
    };

    // Root directory / build settings
    if (input.rootDirectory) payload.rootDirectory = input.rootDirectory;
    if (input.buildCommand) payload.buildCommand = input.buildCommand;
    if (input.outputDirectory) payload.outputDirectory = input.outputDirectory;
    if (input.installCommand) payload.installCommand = input.installCommand;

    // Git repository linking
    if (input.gitRepositoryUrl && input.gitProvider) {
      payload.gitRepository = {
        type: input.gitProvider,
        repo: this.normalizeRepoSlug(input.gitRepositoryUrl),
      };
    }

    return client.post<VercelProject>('/v10/projects', payload);
  }

  private async upsertEnvironmentVariables(
    client: VercelApiClient,
    vercelProjectId: string,
    envVars: VercelEnvVar[]
  ): Promise<void> {
    // Fetch existing env vars to determine creates vs updates
    const existing = await client.get<{ envs: VercelDeploymentEnvVar[] }>(
      `/v9/projects/${vercelProjectId}/env`
    );

    const existingMap = new Map(
      (existing.envs ?? []).map((e) => [e.key, e])
    );

    const toCreate: VercelEnvVar[] = [];
    const toUpdate: Array<{ id: string; envVar: VercelEnvVar }> = [];

    for (const envVar of envVars) {
      const existingEntry = existingMap.get(envVar.key);
      if (existingEntry) {
        toUpdate.push({ id: existingEntry.id, envVar });
      } else {
        toCreate.push(envVar);
      }
    }

    // Batch create
    if (toCreate.length > 0) {
      await client.post(`/v10/projects/${vercelProjectId}/env`, toCreate.map(this.formatEnvVar));
    }

    // Individual updates (Vercel doesn't support batch update)
    for (const { id, envVar } of toUpdate) {
      await client.patch(`/v9/projects/${vercelProjectId}/env/${id}`, this.formatEnvVar(envVar));
    }
  }

  private formatEnvVar(envVar: VercelEnvVar): Record<string, unknown> {
    return {
      key: envVar.key,
      value: envVar.value,
      target: envVar.target,
      type: envVar.type ?? 'encrypted',
    };
  }

  private normalizeRepoSlug(repoUrl: string): string {
    // Convert https://github.com/org/repo.git → org/repo
    return repoUrl
      .replace(/^https?:\/\/(www\.)?(github|gitlab|bitbucket)\.(com|org)\//, '')
      .replace(/\.git$/, '');
  }

  private resolveProductionUrl(project: VercelProject, projectName: string): string {
    const alias = project.alias?.[0]?.domain;
    if (alias) return `https://${alias}`;
    return `https://${projectName}.vercel.app`;
  }
}

// ─── Patch helper (not on base client, add here) ──────────────────────────────

// Extend VercelApiClient with PATCH support
declare module './provision-vercel' {
  interface VercelApiClient {
    patch<T>(path: string, body: unknown): Promise<T>;
  }
}

// Monkey-patch onto prototype for completeness (normally in class body)
(VercelApiClient.prototype as any).patch = function <T>(
  this: VercelApiClient,
  path: string,
  body: unknown
): Promise<T> {
  return (this as any).request<T>('PATCH', path, body);
};

// ─── Convenience export ───────────────────────────────────────────────────────

export const vercelProvisioner = new VercelProvisioner();