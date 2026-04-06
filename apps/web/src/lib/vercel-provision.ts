// src/lib/vercel-provision.ts

/**
 * Vercel Provisioning Library
 *
 * Handles Vercel project provisioning with:
 * - Retry logic (up to 3 attempts, exponential backoff: 500/1000/2000ms)
 * - Idempotent project creation (409 conflict → return existing project)
 * - Auth error fast-fail (401/403 → VercelAuthError, no retry)
 * - 5xx/network error retry
 * - Per-attempt logging
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  createdAt: number;
  framework: string | null;
  gitRepository?: {
    type: string;
    repo: string;
  } | null;
  link?: Record<string, unknown> | null;
  latestDeployments?: VercelDeployment[];
  targets?: Record<string, VercelDeployment>;
  env?: VercelEnvVar[];
  [key: string]: unknown;
}

export interface VercelDeployment {
  id: string;
  url: string;
  state: string;
  readyState?: string;
  createdAt?: number;
  [key: string]: unknown;
}

export interface VercelEnvVar {
  id?: string;
  key: string;
  value: string;
  target: string[];
  type: string;
  [key: string]: unknown;
}

export interface ProvisionOptions {
  /** Project name on Vercel */
  projectName: string;
  /** Git repository to link (optional) */
  gitRepository?: {
    type: "github" | "gitlab" | "bitbucket";
    repo: string;
  };
  /** Framework preset */
  framework?: string;
  /** Root directory */
  rootDirectory?: string;
  /** Build command override */
  buildCommand?: string;
  /** Output directory override */
  outputDirectory?: string;
  /** Install command override */
  installCommand?: string;
  /** Environment variables to set */
  environmentVariables?: Array<{
    key: string;
    value: string;
    target: ("production" | "preview" | "development")[];
    type?: "plain" | "secret" | "encrypted";
  }>;
  /** Vercel Team ID (optional, uses personal account if omitted) */
  teamId?: string;
}

export interface ProvisionResult {
  project: VercelProject;
  /** true if the project was created, false if it already existed */
  created: boolean;
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when Vercel returns 401 (Unauthorized) or 403 (Forbidden).
 * Indicates invalid/expired token or insufficient permissions.
 * Will NOT be retried.
 */
export class VercelAuthError extends Error {
  public readonly statusCode: number;
  public readonly vercelErrorCode?: string;

  constructor(message: string, statusCode: number, vercelErrorCode?: string) {
    super(message);
    this.name = "VercelAuthError";
    this.statusCode = statusCode;
    this.vercelErrorCode = vercelErrorCode;
    // Maintain prototype chain
    Object.setPrototypeOf(this, VercelAuthError.prototype);
  }
}

/**
 * Thrown when Vercel project provisioning fails after all retries,
 * or when an unrecoverable non-auth error occurs.
 */
export class VercelProvisionError extends Error {
  public readonly statusCode?: number;
  public readonly vercelErrorCode?: string;
  public readonly attempts: number;

  constructor(
    message: string,
    attempts: number,
    statusCode?: number,
    vercelErrorCode?: string
  ) {
    super(message);
    this.name = "VercelProvisionError";
    this.attempts = attempts;
    this.statusCode = statusCode;
    this.vercelErrorCode = vercelErrorCode;
    Object.setPrototypeOf(this, VercelProvisionError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERCEL_API_BASE = "https://api.vercel.com";
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1000, 2000] as const;

// ---------------------------------------------------------------------------
// Internal Utilities
// ---------------------------------------------------------------------------

/**
 * Returns the Vercel API token from environment.
 * @throws {VercelAuthError} if VERCEL_TOKEN is not set.
 */
function getToken(): string {
  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) {
    throw new VercelAuthError(
      "VERCEL_TOKEN environment variable is not set. " +
        "Please configure a valid Vercel API token.",
      401
    );
  }
  return token;
}

/**
 * Builds query string for optional teamId parameter.
 */
function buildQuery(teamId?: string): string {
  if (!teamId) return "";
  return `?teamId=${encodeURIComponent(teamId)}`;
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Structured logger for provisioning operations.
 */
const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    const entry = {
      level: "info",
      ts: new Date().toISOString(),
      service: "vercel-provision",
      message,
      ...meta,
    };
    console.log(JSON.stringify(entry));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    const entry = {
      level: "warn",
      ts: new Date().toISOString(),
      service: "vercel-provision",
      message,
      ...meta,
    };
    console.warn(JSON.stringify(entry));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    const entry = {
      level: "error",
      ts: new Date().toISOString(),
      service: "vercel-provision",
      message,
      ...meta,
    };
    console.error(JSON.stringify(entry));
  },
};

/**
 * Parses a Vercel API error response body.
 * Returns { message, code } extracted from Vercel's error envelope.
 */
async function parseVercelError(
  response: Response
): Promise<{ message: string; code?: string }> {
  try {
    const body = await response.json();
    const err = body?.error ?? body;
    return {
      message: err?.message ?? `HTTP ${response.status} ${response.statusText}`,
      code: err?.code,
    };
  } catch {
    return {
      message: `HTTP ${response.status} ${response.statusText}`,
    };
  }
}

/**
 * Determines whether an HTTP status code should trigger a retry.
 *
 * Retry strategy:
 * - 5xx server errors → retry
 * - Network failures (fetch throws) → retry
 * - 401/403 → no retry (auth errors)
 * - 4xx (other) → no retry (client errors)
 * - 409 → no retry (handled as idempotent success)
 * - 2xx → no retry (success)
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

// ---------------------------------------------------------------------------
// Core Retry Engine
// ---------------------------------------------------------------------------

type FetchFn<T> = (attempt: number) => Promise<T>;

/**
 * Executes `fn` with retry logic.
 *
 * @param fn - Async function to execute. Receives the current attempt number (1-indexed).
 * @param operationName - Human-readable name for logging.
 * @param maxAttempts - Maximum number of attempts (default: MAX_ATTEMPTS).
 * @returns The resolved value from `fn`.
 * @throws {VercelAuthError} on 401/403 (no retry).
 * @throws {VercelProvisionError} after all retries exhausted.
 */
async function withRetry<T>(
  fn: FetchFn<T>,
  operationName: string,
  maxAttempts: number = MAX_ATTEMPTS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info(`${operationName}: attempt ${attempt}/${maxAttempts}`, {
      attempt,
      maxAttempts,
      operation: operationName,
    });

    try {
      const result = await fn(attempt);
      if (attempt > 1) {
        logger.info(`${operationName}: succeeded on attempt ${attempt}`, {
          attempt,
          operation: operationName,
        });
      }
      return result;
    } catch (err) {
      // Auth errors are never retried
      if (err instanceof VercelAuthError) {
        logger.error(`${operationName}: auth error, not retrying`, {
          attempt,
          statusCode: err.statusCode,
          vercelErrorCode: err.vercelErrorCode,
          message: err.message,
          operation: operationName,
        });
        throw err;
      }

      // VercelProvisionError with a 4xx status (client error) - don't retry
      if (
        err instanceof VercelProvisionError &&
        err.statusCode !== undefined &&
        err.statusCode >= 400 &&
        err.statusCode < 500
      ) {
        logger.error(`${operationName}: client error, not retrying`, {
          attempt,
          statusCode: err.statusCode,
          vercelErrorCode: err.vercelErrorCode,
          message: err.message,
          operation: operationName,
        });
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      const isLastAttempt = attempt === maxAttempts;
      const backoffMs = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];

      if (isLastAttempt) {
        logger.error(
          `${operationName}: failed after ${maxAttempts} attempt(s)`,
          {
            attempt,
            maxAttempts,
            error: lastError.message,
            operation: operationName,
          }
        );
      } else {
        logger.warn(
          `${operationName}: attempt ${attempt} failed, retrying in ${backoffMs}ms`,
          {
            attempt,
            nextAttemptIn: backoffMs,
            error: lastError.message,
            operation: operationName,
          }
        );
        await sleep(backoffMs);
      }
    }
  }

  // All attempts exhausted
  throw new VercelProvisionError(
    `${operationName} failed after ${maxAttempts} attempt(s): ${lastError?.message ?? "unknown error"}`,
    maxAttempts
  );
}

// ---------------------------------------------------------------------------
// Public API: provisionVercelProject
// ---------------------------------------------------------------------------

/**
 * Provisions a Vercel project, creating it if it doesn't exist.
 *
 * Idempotent: if the project already exists (409 response), the existing
 * project is fetched and returned with `created: false`.
 *
 * @param options - Provisioning options.
 * @returns {ProvisionResult} containing the project and whether it was created.
 *
 * @throws {VercelAuthError} on 401/403 - invalid token or insufficient permissions.
 * @throws {VercelProvisionError} on persistent failure after 3 attempts.
 *
 * @example
 * ```typescript
 * const { project, created } = await provisionVercelProject({
 *   projectName: "my-app",
 *   gitRepository: { type: "github", repo: "org/my-app" },
 *   framework: "nextjs",
 * });
 * console.log(created ? "Created new project" : "Using existing project");
 * console.log("Project ID:", project.id);
 * ```
 */
export async function provisionVercelProject(
  options: ProvisionOptions
): Promise<ProvisionResult> {
  const {
    projectName,
    gitRepository,
    framework,
    rootDirectory,
    buildCommand,
    outputDirectory,
    installCommand,
    environmentVariables,
    teamId,
  } = options;

  const token = getToken();

  logger.info("provisionVercelProject: starting", {
    projectName,
    framework: framework ?? null,
    hasGitRepo: !!gitRepository,
    teamId: teamId ?? null,
  });

  return withRetry(async (attempt) => {
    logger.info("provisionVercelProject: sending POST /v10/projects", {
      attempt,
      projectName,
    });

    const body: Record<string, unknown> = {
      name: projectName,
    };

    if (framework) body.framework = framework;
    if (rootDirectory) body.rootDirectory = rootDirectory;
    if (buildCommand) body.buildCommand = buildCommand;
    if (outputDirectory) body.outputDirectory = outputDirectory;
    if (installCommand) body.installCommand = installCommand;
    if (gitRepository) body.gitRepository = gitRepository;
    if (environmentVariables?.length) {
      body.environmentVariables = environmentVariables.map((e) => ({
        ...e,
        type: e.type ?? "plain",
      }));
    }

    let response: Response;
    try {
      response = await fetch(
        `${VERCEL_API_BASE}/v10/projects${buildQuery(teamId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
    } catch (networkError) {
      // Network-level failure (DNS, timeout, etc.) - retryable
      const msg =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      logger.warn("provisionVercelProject: network error", {
        attempt,
        error: msg,
      });
      throw new Error(`Network error: ${msg}`);
    }

    logger.info("provisionVercelProject: received response", {
      attempt,
      status: response.status,
      statusText: response.statusText,
    });

    // ── 2xx Success ─────────────────────────────────────────────────────────
    if (response.ok) {
      const project = (await response.json()) as VercelProject;
      logger.info("provisionVercelProject: project created successfully", {
        attempt,
        projectId: project.id,
        projectName: project.name,
      });
      return { project, created: true };
    }

    // ── 401 / 403 Auth Error ─────────────────────────────────────────────────
    if (response.status === 401 || response.status === 403) {
      const { message, code } = await parseVercelError(response);
      logger.error("provisionVercelProject: authentication/authorization error", {
        attempt,
        status: response.status,
        vercelErrorCode: code,
        message,
      });
      throw new VercelAuthError(
        `Vercel API auth error (${response.status}): ${message}`,
        response.status,
        code
      );
    }

    // ── 409 Conflict (Already Exists) ────────────────────────────────────────
    if (response.status === 409) {
      const { message, code } = await parseVercelError(response);
      logger.info(
        "provisionVercelProject: project already exists (409), fetching existing",
        {
          attempt,
          projectName,
          vercelErrorCode: code,
          message,
        }
      );
      // Fetch the existing project idempotently
      const existingProject = await getVercelProjectInfo(
        projectName,
        teamId
      );
      return { project: existingProject, created: false };
    }

    // ── 5xx Server Error ─────────────────────────────────────────────────────
    if (response.status >= 500) {
      const { message, code } = await parseVercelError(response);
      logger.warn("provisionVercelProject: server error, will retry", {
        attempt,
        status: response.status,
        vercelErrorCode: code,
        message,
      });
      throw new VercelProvisionError(
        `Vercel server error (${response.status}): ${message}`,
        attempt,
        response.status,
        code
      );
    }

    // ── Other 4xx Client Errors ──────────────────────────────────────────────
    const { message, code } = await parseVercelError(response);
    logger.error("provisionVercelProject: unrecoverable client error", {
      attempt,
      status: response.status,
      vercelErrorCode: code,
      message,
    });
    throw new VercelProvisionError(
      `Vercel client error (${response.status}): ${message}`,
      attempt,
      response.status,
      code
    );
  }, "provisionVercelProject");
}

// ---------------------------------------------------------------------------
// Public API: getVercelProjectInfo
// ---------------------------------------------------------------------------

/**
 * Retrieves details for an existing Vercel project.
 *
 * Calls GET /v10/projects/{idOrName}.
 * Includes retry logic for 5xx/network errors.
 *
 * @param vercelProjectId - The Vercel project ID **or** project name.
 * @param teamId - Optional Vercel Team ID.
 * @returns {VercelProject} The full project details from the Vercel API.
 *
 * @throws {VercelAuthError} on 401/403.
 * @throws {VercelProvisionError} if the project is not found (404) or on
 *   persistent 5xx failures.
 *
 * @example
 * ```typescript
 * const project = await getVercelProjectInfo("prj_abc123");
 * console.log("Project URL:", project.latestDeployments?.[0]?.url);
 * ```
 */
export async function getVercelProjectInfo(
  vercelProjectId: string,
  teamId?: string
): Promise<VercelProject> {
  const token = getToken();

  if (!vercelProjectId || vercelProjectId.trim() === "") {
    throw new VercelProvisionError(
      "vercelProjectId must be a non-empty string",
      0,
      400
    );
  }

  logger.info("getVercelProjectInfo: starting", {
    vercelProjectId,
    teamId: teamId ?? null,
  });

  return withRetry(async (attempt) => {
    const encodedId = encodeURIComponent(vercelProjectId.trim());
    const url = `${VERCEL_API_BASE}/v10/projects/${encodedId}${buildQuery(teamId)}`;

    logger.info("getVercelProjectInfo: sending GET request", {
      attempt,
      vercelProjectId,
      url,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (networkError) {
      const msg =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      logger.warn("getVercelProjectInfo: network error", {
        attempt,
        vercelProjectId,
        error: msg,
      });
      throw new Error(`Network error: ${msg}`);
    }

    logger.info("getVercelProjectInfo: received response", {
      attempt,
      vercelProjectId,
      status: response.status,
      statusText: response.statusText,
    });

    // ── 2xx Success ─────────────────────────────────────────────────────────
    if (response.ok) {
      const project = (await response.json()) as VercelProject;
      logger.info("getVercelProjectInfo: project retrieved successfully", {
        attempt,
        projectId: project.id,
        projectName: project.name,
      });
      return project;
    }

    // ── 401 / 403 Auth Error ─────────────────────────────────────────────────
    if (response.status === 401 || response.status === 403) {
      const { message, code } = await parseVercelError(response);
      logger.error("getVercelProjectInfo: authentication/authorization error", {
        attempt,
        vercelProjectId,
        status: response.status,
        vercelErrorCode: code,
        message,
      });
      throw new VercelAuthError(
        `Vercel API auth error (${response.status}): ${message}`,
        response.status,
        code
      );
    }

    // ── 404 Not Found ────────────────────────────────────────────────────────
    if (response.status === 404) {
      const { message, code } = await parseVercelError(response);
      logger.error("getVercelProjectInfo: project not found", {
        attempt,
        vercelProjectId,
        vercelErrorCode: code,
        message,
      });
      // 404 is a definitive client error - do not retry
      throw new VercelProvisionError(
        `Vercel project not found: "${vercelProjectId}" — ${message}`,
        attempt,
        404,
        code
      );
    }

    // ── 5xx Server Error ─────────────────────────────────────────────────────
    if (response.status >= 500) {
      const { message, code } = await parseVercelError(response);
      logger.warn("getVercelProjectInfo: server error, will retry", {
        attempt,
        vercelProjectId,
        status: response.status,
        vercelErrorCode: code,
        message,
      });
      throw new VercelProvisionError(
        `Vercel server error (${response.status}): ${message}`,
        attempt,
        response.status,
        code
      );
    }

    // ── Other 4xx ────────────────────────────────────────────────────────────
    const { message, code } = await parseVercelError(response);
    logger.error("getVercelProjectInfo: unrecoverable client error", {
      attempt,
      vercelProjectId,
      status: response.status,
      vercelErrorCode: code,
      message,
    });
    throw new VercelProvisionError(
      `Vercel client error (${response.status}): ${message}`,
      attempt,
      response.status,
      code
    );
  }, "getVercelProjectInfo");
}

// ---------------------------------------------------------------------------
// Public API: deleteVercelProject (utility, used in cleanup/teardown)
// ---------------------------------------------------------------------------

/**
 * Deletes a Vercel project by ID or name.
 *
 * @param vercelProjectId - The Vercel project ID or name.
 * @param teamId - Optional Vercel Team ID.
 *
 * @throws {VercelAuthError} on 401/403.
 * @throws {VercelProvisionError} on persistent failure.
 */
export async function deleteVercelProject(
  vercelProjectId: string,
  teamId?: string
): Promise<void> {
  const token = getToken();

  logger.info("deleteVercelProject: starting", {
    vercelProjectId,
    teamId: teamId ?? null,
  });

  await withRetry(async (attempt) => {
    const encodedId = encodeURIComponent(vercelProjectId.trim());
    const url = `${VERCEL_API_BASE}/v9/projects/${encodedId}${buildQuery(teamId)}`;

    logger.info("deleteVercelProject: sending DELETE request", {
      attempt,
      vercelProjectId,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (networkError) {
      const msg =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      logger.warn("deleteVercelProject: network error", {
        attempt,
        vercelProjectId,
        error: msg,
      });
      throw new Error(`Network error: ${msg}`);
    }

    logger.info("deleteVercelProject: received response", {
      attempt,
      vercelProjectId,
      status: response.status,
    });

    if (response.status === 204 || response.status === 200) {
      logger.info("deleteVercelProject: project deleted successfully", {
        vercelProjectId,
      });
      return;
    }

    if (response.status === 401 || response.status === 403) {
      const { message, code } = await parseVercelError(response);
      throw new VercelAuthError(
        `Vercel API auth error (${response.status}): ${message}`,
        response.status,
        code
      );
    }

    if (response.status === 404) {
      // Already deleted - treat as success (idempotent)
      logger.info("deleteVercelProject: project not found (already deleted)", {
        vercelProjectId,
      });
      return;
    }

    if (response.status >= 500) {
      const { message, code } = await parseVercelError(response);
      throw new VercelProvisionError(
        `Vercel server error (${response.status}): ${message}`,
        attempt,
        response.status,
        code
      );
    }

    const { message, code } = await parseVercelError(response);
    throw new VercelProvisionError(
      `Vercel client error (${response.status}): ${message}`,
      attempt,
      response.status,
      code
    );
  }, "deleteVercelProject");
}

// ---------------------------------------------------------------------------
// injectVercelEnvVars
// ---------------------------------------------------------------------------

export interface EnvVarInput {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type?: "plain" | "secret" | "encrypted";
}

// ---------------------------------------------------------------------------
// GitHub Repo Linking
// ---------------------------------------------------------------------------

export interface LinkVercelGitHubRepoResult {
  linked: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  status?: number;
}

/**
 * Links a GitHub repository to an existing Vercel project so that pushes
 * automatically trigger Vercel deployments.
 *
 * IMPORTANT: `repoFullName` must be the full "org/repo" format (e.g.
 * "AydeGitBuildOS/buildos-my-project"). Vercel's link API requires the
 * org prefix — a short name alone returns "install GitHub integration" error.
 *
 * Uses `VERCEL_GIT_CREDENTIAL_ID` env var if set, otherwise falls back to
 * the well-known AydeGitBuildOS credential ID.
 *
 * Non-fatal by design: returns a result object rather than throwing, so
 * callers can log a warning and continue on failure.
 *
 * @param vercelProjectId  The Vercel project ID (e.g. "prj_xxx")
 * @param repoFullName     Full GitHub repo name with org (e.g. "AydeGitBuildOS/buildos-my-project")
 * @param repoId           Numeric GitHub repository ID
 * @param teamId           Optional Vercel team ID
 */
export async function linkVercelGitHubRepo(
  vercelProjectId: string,
  repoFullName: string,
  repoId: number,
  teamId?: string
): Promise<LinkVercelGitHubRepoResult> {
  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) {
    return { linked: false, skipped: true, skipReason: "VERCEL_TOKEN not set" };
  }
  if (!vercelProjectId || !repoFullName || !repoId) {
    return {
      linked: false,
      skipped: true,
      skipReason: `Missing required params: vercelProjectId=${vercelProjectId}, repoFullName=${repoFullName}, repoId=${repoId}`,
    };
  }

  // Credential ID for the GitHub App installation on AydeGitBuildOS Vercel team
  const gitCredentialId =
    process.env.VERCEL_GIT_CREDENTIAL_ID ?? "cred_dc50f013b9c5e6166eae2f3d23931ae285973a93";

  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const url = `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(vercelProjectId)}/link${query}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "github",
        repo: repoFullName,
        repoId,
        gitCredentialId,
      }),
    });

    if (response.ok || response.status === 200 || response.status === 204) {
      console.log(
        `[vercel-provision] Linked GitHub repo "${repoFullName}" (id=${repoId}) to Vercel project ${vercelProjectId}`
      );
      return { linked: true };
    }

    const body = await response.text();
    console.warn(
      `[vercel-provision] GitHub repo link non-fatal failure for ${vercelProjectId} (${response.status}): ${body}`
    );
    return { linked: false, error: body, status: response.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[vercel-provision] GitHub repo link threw: ${msg}`);
    return { linked: false, error: msg };
  }
}

/**
 * Injects environment variables into a Vercel project.
 *
 * Creates or updates each env var across the specified targets.
 * Uses upsert semantics: if the key already exists on a target, it is updated.
 *
 * @param vercelProjectId  The Vercel project ID (e.g. "prj_xxx")
 * @param envVars          Array of env vars to inject
 * @param teamId           Optional Vercel team ID
 */
export async function injectVercelEnvVars(
  vercelProjectId: string,
  envVars: EnvVarInput[],
  teamId?: string
): Promise<void> {
  if (!envVars.length) return;

  const token = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!token) {
    throw new VercelAuthError("VERCEL_TOKEN environment variable is not set.", 401);
  }

  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const url = `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(vercelProjectId)}/env${query}`;

  // POST array of env vars
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      envVars.map((e) => ({
        key: e.key,
        value: e.value,
        target: e.target,
        type: e.type ?? "plain",
      }))
    ),
  });

  if (response.status === 401 || response.status === 403) {
    const body = await response.text();
    throw new VercelAuthError(
      `[vercel-provision] Auth failed injecting env vars (${response.status}): ${body}`,
      response.status
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new VercelProvisionError(
      `[vercel-provision] Failed to inject env vars into ${vercelProjectId} (${response.status}): ${body}`,
      response.status
    );
  }
}
