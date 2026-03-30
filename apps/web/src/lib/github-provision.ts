// src/lib/github-provision.ts
//
// Production GitHub provisioning service.
// Creates isolated per-project repositories under the configured GitHub org.
//
// Auth strategy (in priority order):
//   1. GitHub App (RS256 JWT) — if GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY are set
//   2. Personal Access Token  — if GITHUB_TOKEN is set
//
// Required env vars:
//   GITHUB_APP_ID           — App ID (numeric string)
//   GITHUB_APP_PRIVATE_KEY  — PEM-encoded RSA private key (full, not base64)
//   GITHUB_INSTALLATION_ID  — Installation ID for the org
//   GITHUB_ORG              — Org / user where repos are created
//
// OR (PAT fallback):
//   GITHUB_TOKEN            — PAT with repo + admin:org scope
//   GITHUB_ORG              — Org / user where repos are created

import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepoInfo {
  repoId: number;
  repoName: string;
  repoUrl: string;
  repoFullName: string;
  defaultBranch: string;
  cloneUrl: string;
}

export interface GitHubProvisionInput {
  id: string;
  slug: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class GitHubAuthError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "GitHubAuthError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, GitHubAuthError.prototype);
  }
}

export class GitHubProvisionError extends Error {
  public readonly statusCode?: number;
  public readonly repoName?: string;
  constructor(message: string, statusCode?: number, repoName?: string) {
    super(message);
    this.name = "GitHubProvisionError";
    this.statusCode = statusCode;
    this.repoName = repoName;
    Object.setPrototypeOf(this, GitHubProvisionError.prototype);
  }
}

// ---------------------------------------------------------------------------
// GitHub App JWT (RS256)
// ---------------------------------------------------------------------------

/**
 * Generates a GitHub App JWT using RS256.
 * The JWT is valid for 10 minutes (GitHub allows max 10m).
 */
async function generateAppJWT(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,          // issued 60s ago (clock skew buffer)
    exp: now + 9 * 60,      // expires in 9 minutes
    iss: appId,
  };

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${header}.${body}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();

  const signature = sign.sign(privateKeyPem, "base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Exchanges a GitHub App JWT for a short-lived installation access token.
 */
async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string
): Promise<string> {
  const jwt = await generateAppJWT(appId, privateKeyPem);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (response.status === 401 || response.status === 403) {
    const body = await response.text();
    throw new GitHubAuthError(
      `[github-provision] GitHub App auth failed (${response.status}): ${body}`,
      response.status
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new GitHubProvisionError(
      `[github-provision] Failed to get installation token (${response.status}): ${body}`,
      response.status
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  return data.token;
}

// ---------------------------------------------------------------------------
// Auth token resolution
// ---------------------------------------------------------------------------

async function resolveGitHubToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  // Support both GITHUB_INSTALLATION_ID and GITHUB_APP_INSTALLATION_ID
  const installationId =
    process.env.GITHUB_INSTALLATION_ID ?? process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && privateKey && installationId) {
    // Normalize PEM: env vars often have literal \n instead of actual newlines
    const normalizedKey = privateKey.replace(/\\n/g, "\n");
    return getInstallationToken(appId, normalizedKey, installationId);
  }

  // PAT fallback
  const pat = process.env.GITHUB_TOKEN;
  if (pat) {
    return pat;
  }

  throw new GitHubAuthError(
    "[github-provision] No GitHub credentials configured. " +
      "Set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID " +
      "or GITHUB_TOKEN.",
    401
  );
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [500, 1000, 2000];

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      // Do not retry on auth errors
      if (err instanceof GitHubAuthError) throw err;
      // Do not retry on 404
      if (err instanceof GitHubProvisionError && err.statusCode === 404) throw err;

      if (attempt < 2) {
        console.warn(
          `[github-provision] ${label} attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS_MS[attempt]}ms`,
          err instanceof Error ? err.message : String(err)
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Main export: provisionGitHubRepo
// ---------------------------------------------------------------------------

/**
 * Creates a new GitHub repository for a BuildOS project.
 *
 * - Repo name: `buildos-{project.slug}`
 * - Created under the org/user in GITHUB_ORG env var
 * - Idempotent: if repo already exists (422), fetches and returns it
 * - Retry: up to 3 attempts with exponential backoff (500/1000/2000ms)
 * - Auth: GitHub App JWT (preferred) or PAT fallback
 *
 * @throws GitHubAuthError       — token invalid/missing, not retried
 * @throws GitHubProvisionError  — other API failures after all retries
 */
export async function provisionGitHubRepo(
  project: GitHubProvisionInput
): Promise<GitHubRepoInfo> {
  // Support GITHUB_ORG (preferred), GITHUB_REPO_OWNER (legacy name in Vercel env)
  const org = process.env.GITHUB_ORG ?? process.env.GITHUB_REPO_OWNER;
  if (!org) {
    throw new GitHubProvisionError(
      "[github-provision] GITHUB_ORG (or GITHUB_REPO_OWNER) environment variable is not set."
    );
  }

  const repoName = `buildos-${project.slug}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  return withRetry(async (attempt) => {
    const token = await resolveGitHubToken();

    const createUrl = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos`;

    console.log(`[github-provision] Creating repo ${org}/${repoName} (attempt ${attempt + 1})`);

    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        name: repoName,
        description: `BuildOS project: ${project.name}`,
        private: true,
        auto_init: true,
      }),
    });

    // Idempotent: repo already exists
    if (createResponse.status === 422) {
      console.log(`[github-provision] Repo ${org}/${repoName} already exists — fetching.`);
      return getExistingRepo(org, repoName, token);
    }

    if (createResponse.status === 401 || createResponse.status === 403) {
      const body = await createResponse.text();
      throw new GitHubAuthError(
        `[github-provision] Auth failed creating ${org}/${repoName} (${createResponse.status}): ${body}`,
        createResponse.status
      );
    }

    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new GitHubProvisionError(
        `[github-provision] GitHub API error (${createResponse.status}): ${body}`,
        createResponse.status,
        repoName
      );
    }

    const repo = (await createResponse.json()) as {
      id: number;
      name: string;
      html_url: string;
      full_name: string;
      default_branch: string;
      clone_url: string;
    };

    console.log(`[github-provision] Created: ${repo.html_url}`);

    return {
      repoId: repo.id,
      repoName: repo.name,
      repoUrl: repo.html_url,
      repoFullName: repo.full_name,
      defaultBranch: repo.default_branch ?? "main",
      cloneUrl: repo.clone_url,
    };
  }, `provisionGitHubRepo(${org}/${repoName})`);
}

// ---------------------------------------------------------------------------
// Helper: fetch existing repo
// ---------------------------------------------------------------------------

async function getExistingRepo(
  org: string,
  repoName: string,
  token: string
): Promise<GitHubRepoInfo> {
  const url = `https://api.github.com/repos/${encodeURIComponent(org)}/${encodeURIComponent(repoName)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GitHubProvisionError(
      `[github-provision] Failed to fetch existing repo ${org}/${repoName} (${response.status}): ${body}`,
      response.status,
      repoName
    );
  }

  const repo = (await response.json()) as {
    id: number;
    name: string;
    html_url: string;
    full_name: string;
    default_branch: string;
    clone_url: string;
  };

  return {
    repoId: repo.id,
    repoName: repo.name,
    repoUrl: repo.html_url,
    repoFullName: repo.full_name,
    defaultBranch: repo.default_branch ?? "main",
    cloneUrl: repo.clone_url,
  };
}
