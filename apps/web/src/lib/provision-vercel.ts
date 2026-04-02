// src/lib/provision-vercel.ts

import fetch from 'node-fetch';
import { resolveProviderOwnership } from './resolveProviderOwnership';
import { OwnershipResolutionError } from './types/ownership';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelProvisionInput {
  /** Admin/workspace owner UUID */
  adminId: string;
  /** Internal project UUID */
  projectId: string;
  /** Desired Vercel project name */
  projectName: string;
  /** Git repository to link (optional) */
  gitRepository?: {
    type: 'github' | 'gitlab' | 'bitbucket';
    repo: string; // e.g. "org/repo-name"
  };
  /** Environment variables to inject into the Vercel project */
  envVars?: VercelEnvVar[];
  /** Vercel framework preset */
  framework?: string;
  /** Root directory within monorepo */
  rootDirectory?: string;
}

export interface VercelEnvVar {
  key: string;
  value: string;
  target: Array<'production' | 'preview' | 'development'>;
  type: 'encrypted' | 'plain' | 'system' | 'secret';
}

export interface VercelProvisionResult {
  vercelProjectId: string;
  vercelProjectName: string;
  deploymentUrl?: string;
  teamId?: string;
  ownershipModel: 'user_managed' | 'platform_managed';
}

// ---------------------------------------------------------------------------
// Vercel API client (thin wrapper)
// ---------------------------------------------------------------------------

interface VercelApiOptions {
  token: string;
  teamId?: string;
}

function buildVercelHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function buildTeamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function vercelRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  opts: VercelApiOptions,
  body?: unknown
): Promise<T> {
  const baseUrl = 'https://api.vercel.com';
  const teamQuery = buildTeamQuery(opts.teamId);
  const url = `${baseUrl}${path}${teamQuery}`;

  const response = await fetch(url, {
    method,
    headers: buildVercelHeaders(opts.token),
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();

  if (!response.ok) {
    let errorDetail: string;
    try {
      const parsed = JSON.parse(responseText);
      errorDetail = parsed?.error?.message ?? responseText;
    } catch {
      errorDetail = responseText;
    }
    throw new VercelProvisioningError(
      `Vercel API ${method} ${path} failed (${response.status}): ${errorDetail}`,
      response.status,
      path
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    return responseText as unknown as T;
  }
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class VercelProvisioningError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = 'VercelProvisioningError';
  }
}

// ---------------------------------------------------------------------------
// Vercel API response shapes (partial)
// ---------------------------------------------------------------------------

interface VercelCreateProjectResponse {
  id: string;
  name: string;
  link?: {
    type: string;
    repo: string;
  };
  accountId: string;
}

interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  targets?: {
    production?: {
      alias?: string[];
      url?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Main provisioning function
// ---------------------------------------------------------------------------

/**
 * Provisions a Vercel project for the given admin + internal project.
 *
 * Ownership resolution:
 *   - user_managed  → uses the Vercel token & team_id stored in the admin's
 *                     provider_connections record (OAuth or PAT flow)
 *   - platform_managed → falls through to VERCEL_TOKEN env var (Build OS
 *                        platform account)
 */
export async function provisionVercelProject(
  input: VercelProvisionInput
): Promise<VercelProvisionResult> {
  const { adminId, projectId, projectName, gitRepository, envVars, framework, rootDirectory } =
    input;

  // -------------------------------------------------------------------------
  // 1. Resolve ownership — REPLACES direct process.env.VERCEL_TOKEN reads
  // -------------------------------------------------------------------------
  let ownership: Awaited<ReturnType<typeof resolveProviderOwnership>>;

  try {
    ownership = await resolveProviderOwnership(adminId, projectId, 'vercel');
  } catch (err) {
    if (err instanceof OwnershipResolutionError) {
      throw new VercelProvisioningError(
        `Cannot provision Vercel project: ownership resolution failed — ${err.message}`,
        undefined,
        'resolveProviderOwnership'
      );
    }
    throw err;
  }

  const apiOpts: VercelApiOptions = {
    token: ownership.token,      // ← resolved token (user or platform)
    teamId: ownership.teamId,    // ← team_id from connection metadata OR env
  };

  console.info(
    `[provision-vercel] Provisioning project "${projectName}" ` +
      `(adminId=${adminId}, projectId=${projectId}, model=${ownership.model}, ` +
      `teamId=${ownership.teamId ?? 'none'})`
  );

  // -------------------------------------------------------------------------
  // 2. Check if project already exists (idempotency)
  // -------------------------------------------------------------------------
  const existing = await findExistingVercelProject(projectName, apiOpts);

  if (existing) {
    console.info(
      `[provision-vercel] Project "${projectName}" already exists (vercelId=${existing.id}). Skipping creation.`
    );

    return {
      vercelProjectId: existing.id,
      vercelProjectName: existing.name,
      deploymentUrl: extractProductionUrl(existing),
      teamId: ownership.teamId,
      ownershipModel: ownership.model,
    };
  }

  // -------------------------------------------------------------------------
  // 3. Create the Vercel project
  // -------------------------------------------------------------------------
  const createPayload: Record<string, unknown> = {
    name: projectName,
    ...(framework && { framework }),
    ...(rootDirectory && { rootDirectory }),
    ...(gitRepository && {
      gitRepository: {
        type: gitRepository.type,
        repo: gitRepository.repo,
      },
    }),
  };

  const created = await vercelRequest<VercelCreateProjectResponse>(
    '/v9/projects',
    'POST',
    apiOpts,
    createPayload
  );

  console.info(
    `[provision-vercel] Created Vercel project "${created.name}" (vercelId=${created.id})`
  );

  // -------------------------------------------------------------------------
  // 4. Inject environment variables (if provided)
  // -------------------------------------------------------------------------
  if (envVars && envVars.length > 0) {
    await addEnvironmentVariables(created.id, envVars, apiOpts);
  }

  // -------------------------------------------------------------------------
  // 5. Return result
  // -------------------------------------------------------------------------
  return {
    vercelProjectId: created.id,
    vercelProjectName: created.name,
    teamId: ownership.teamId,
    ownershipModel: ownership.model,
  };
}

// ---------------------------------------------------------------------------
// Helper: find existing project by name
// ---------------------------------------------------------------------------

async function findExistingVercelProject(
  projectName: string,
  opts: VercelApiOptions
): Promise<VercelProject | null> {
  try {
    const project = await vercelRequest<VercelProject>(
      `/v9/projects/${encodeURIComponent(projectName)}`,
      'GET',
      opts
    );
    return project;
  } catch (err) {
    if (err instanceof VercelProvisioningError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: add env vars to a Vercel project
// ---------------------------------------------------------------------------

async function addEnvironmentVariables(
  vercelProjectId: string,
  envVars: VercelEnvVar[],
  opts: VercelApiOptions
): Promise<void> {
  // Vercel accepts bulk env var creation via POST /v10/projects/:id/env
  const payload = envVars.map((v) => ({
    key: v.key,
    value: v.value,
    target: v.target,
    type: v.type,
  }));

  await vercelRequest(
    `/v10/projects/${encodeURIComponent(vercelProjectId)}/env`,
    'POST',
    opts,
    payload
  );

  console.info(
    `[provision-vercel] Injected ${envVars.length} env var(s) into project ${vercelProjectId}`
  );
}

// ---------------------------------------------------------------------------
// Helper: extract production URL from project response
// ---------------------------------------------------------------------------

function extractProductionUrl(project: VercelProject): string | undefined {
  const aliases = project.targets?.production?.alias;
  if (aliases && aliases.length > 0) {
    return `https://${aliases[0]}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Additional provisioning operations (also ownership-aware)
// ---------------------------------------------------------------------------

/**
 * Deletes a Vercel project, respecting ownership model.
 */
export async function deleteVercelProject(
  adminId: string,
  projectId: string,
  vercelProjectId: string
): Promise<void> {
  const ownership = await resolveProviderOwnership(adminId, projectId, 'vercel');

  const apiOpts: VercelApiOptions = {
    token: ownership.token,
    teamId: ownership.teamId,
  };

  await vercelRequest(
    `/v9/projects/${encodeURIComponent(vercelProjectId)}`,
    'DELETE',
    apiOpts
  );

  console.info(
    `[provision-vercel] Deleted Vercel project ${vercelProjectId} ` +
      `(model=${ownership.model})`
  );
}

/**
 * Updates environment variables on an existing Vercel project.
 */
export async function updateVercelEnvVars(
  adminId: string,
  projectId: string,
  vercelProjectId: string,
  envVars: VercelEnvVar[]
): Promise<void> {
  const ownership = await resolveProviderOwnership(adminId, projectId, 'vercel');

  const apiOpts: VercelApiOptions = {
    token: ownership.token,
    teamId: ownership.teamId,
  };

  await addEnvironmentVariables(vercelProjectId, envVars, apiOpts);
}

/**
 * Retrieves a Vercel project's current state, respecting ownership.
 */
export async function getVercelProject(
  adminId: string,
  projectId: string,
  vercelProjectId: string
): Promise<VercelProject> {
  const ownership = await resolveProviderOwnership(adminId, projectId, 'vercel');

  const apiOpts: VercelApiOptions = {
    token: ownership.token,
    teamId: ownership.teamId,
  };

  return vercelRequest<VercelProject>(
    `/v9/projects/${encodeURIComponent(vercelProjectId)}`,
    'GET',
    apiOpts
  );
}