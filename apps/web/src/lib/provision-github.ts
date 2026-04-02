// apps/web/src/lib/provision-github.ts

import { Octokit } from '@octokit/rest';
import { resolveGitHubToken } from './github-token-resolver';

export interface ProvisionGitHubOptions {
  /** The admin/user initiating provisioning */
  adminId: string;
  /** The internal project ID being provisioned */
  projectId: string;
  /** Desired GitHub org/owner for the new repo */
  orgOrOwner: string;
  /** Desired repository name */
  repoName: string;
  /** Whether the repo should be private */
  isPrivate?: boolean;
  /** Optional description */
  description?: string;
  /** Optional template repository (org/repo format) */
  templateRepo?: string;
}

export interface ProvisionGitHubResult {
  repoUrl: string;
  repoId: number;
  cloneUrl: string;
  defaultBranch: string;
  tokenMode: 'user_managed' | 'platform_managed';
}

/**
 * Provisions a GitHub repository for a project.
 *
 * Uses the ownership resolver to determine whether to use a user-supplied
 * OAuth token (user_managed) or the platform GITHUB_TOKEN env var
 * (platform_managed).
 */
export async function provisionGitHub(
  options: ProvisionGitHubOptions
): Promise<ProvisionGitHubResult> {
  const {
    adminId,
    projectId,
    orgOrOwner,
    repoName,
    isPrivate = true,
    description = '',
    templateRepo,
  } = options;

  console.log(
    `[provision-github] Starting GitHub provisioning — ` +
      `projectId=${projectId} adminId=${adminId} repo=${orgOrOwner}/${repoName}`
  );

  // ── Resolve token via ownership resolver (replaces direct process.env.GITHUB_TOKEN) ──
  const { token, mode: tokenMode, source: tokenSource } =
    await resolveGitHubToken(adminId, projectId);

  console.log(
    `[provision-github] Token resolved — mode="${tokenMode}" source="${tokenSource}" ` +
      `projectId=${projectId}`
  );

  const octokit = new Octokit({ auth: token });

  try {
    let repoData: Awaited<ReturnType<typeof octokit.repos.createInOrg>>['data'] |
                  Awaited<ReturnType<typeof octokit.repos.createForAuthenticatedUser>>['data'];

    if (templateRepo) {
      // Create from template
      const [templateOwner, templateRepoName] = templateRepo.split('/');
      console.log(
        `[provision-github] Creating repo from template "${templateRepo}" — ` +
          `target=${orgOrOwner}/${repoName}`
      );

      const { data } = await octokit.repos.createUsingTemplate({
        template_owner: templateOwner,
        template_repo: templateRepoName,
        owner: orgOrOwner,
        name: repoName,
        description,
        private: isPrivate,
        include_all_branches: false,
      });
      repoData = data;
    } else {
      // Check if orgOrOwner is an org vs personal account
      let isOrg = false;
      try {
        const { data: orgData } = await octokit.orgs.get({ org: orgOrOwner });
        isOrg = !!orgData.id;
      } catch {
        // Not an org — treat as personal account
        isOrg = false;
      }

      if (isOrg) {
        console.log(
          `[provision-github] Creating org repo — org=${orgOrOwner} name=${repoName}`
        );
        const { data } = await octokit.repos.createInOrg({
          org: orgOrOwner,
          name: repoName,
          description,
          private: isPrivate,
          auto_init: true,
        });
        repoData = data;
      } else {
        console.log(
          `[provision-github] Creating personal repo — owner=${orgOrOwner} name=${repoName}`
        );
        const { data } = await octokit.repos.createForAuthenticatedUser({
          name: repoName,
          description,
          private: isPrivate,
          auto_init: true,
        });
        repoData = data;
      }
    }

    const result: ProvisionGitHubResult = {
      repoUrl: repoData.html_url,
      repoId: repoData.id,
      cloneUrl: repoData.clone_url,
      defaultBranch: repoData.default_branch,
      tokenMode,
    };

    console.log(
      `[provision-github] Repository provisioned successfully — ` +
        `repoUrl=${result.repoUrl} tokenMode=${tokenMode} projectId=${projectId}`
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[provision-github] Failed to provision GitHub repository — ` +
        `error="${message}" projectId=${projectId} adminId=${adminId} ` +
        `repo=${orgOrOwner}/${repoName} tokenMode=${tokenMode}`
    );
    throw err;
  }
}

/**
 * Provisions branch protection rules on a GitHub repository.
 * Uses the same ownership-aware token resolution.
 */
export async function provisionBranchProtection(options: {
  adminId: string;
  projectId: string;
  owner: string;
  repo: string;
  branch?: string;
}): Promise<void> {
  const { adminId, projectId, owner, repo, branch = 'main' } = options;

  console.log(
    `[provision-github] Provisioning branch protection — ` +
      `projectId=${projectId} ${owner}/${repo}@${branch}`
  );

  const { token, mode: tokenMode } = await resolveGitHubToken(adminId, projectId);

  console.log(
    `[provision-github] Branch protection token mode="${tokenMode}" projectId=${projectId}`
  );

  const octokit = new Octokit({ auth: token });

  try {
    await octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      required_status_checks: {
        strict: true,
        contexts: [],
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true,
      },
      restrictions: null,
    });

    console.log(
      `[provision-github] Branch protection applied — ` +
        `${owner}/${repo}@${branch} tokenMode=${tokenMode}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[provision-github] Failed to apply branch protection — ` +
        `error="${message}" ${owner}/${repo}@${branch}`
    );
    throw err;
  }
}