// apps/web/src/lib/commit-reliability.ts

import { Octokit } from '@octokit/rest';
import { resolveGitHubToken } from './github-token-resolver';

export interface CommitFileOptions {
  adminId: string;
  projectId: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  content: string; // base64 encoded content
  commitMessage: string;
  committerName?: string;
  committerEmail?: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  tokenMode: 'user_managed' | 'platform_managed';
}

export interface EnsureFileOptions extends CommitFileOptions {
  /** Maximum number of retry attempts on conflict (409) */
  maxRetries?: number;
}

/**
 * Commits a single file to a GitHub repository with reliability guarantees.
 *
 * Uses the ownership resolver to select the appropriate GitHub token.
 * Handles SHA conflicts by fetching the latest file SHA before committing.
 */
export async function commitFileReliably(
  options: EnsureFileOptions
): Promise<CommitResult> {
  const {
    adminId,
    projectId,
    owner,
    repo,
    branch,
    filePath,
    content,
    commitMessage,
    committerName = 'Terrarium Bot',
    committerEmail = 'bot@terrarium.dev',
    maxRetries = 3,
  } = options;

  console.log(
    `[commit-reliability] Starting reliable commit — ` +
      `projectId=${projectId} adminId=${adminId} ` +
      `${owner}/${repo}@${branch}:${filePath}`
  );

  // ── Resolve token via ownership resolver ──────────────────────────────────
  const { token, mode: tokenMode, source: tokenSource } =
    await resolveGitHubToken(adminId, projectId);

  console.log(
    `[commit-reliability] Token resolved — mode="${tokenMode}" source="${tokenSource}" ` +
      `projectId=${projectId}`
  );

  const octokit = new Octokit({ auth: token });

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    console.log(
      `[commit-reliability] Commit attempt ${attempt}/${maxRetries} — ` +
        `${owner}/${repo}@${branch}:${filePath}`
    );

    try {
      // Fetch current file SHA (needed for updates; undefined for new files)
      const currentSha = await getFileSha(octokit, { owner, repo, branch, filePath });

      if (currentSha) {
        console.log(
          `[commit-reliability] File exists, updating — sha=${currentSha.slice(0, 8)} ` +
            `${filePath}`
        );
      } else {
        console.log(`[commit-reliability] File does not exist, creating — ${filePath}`);
      }

      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMessage,
        content,
        branch,
        sha: currentSha,
        committer: {
          name: committerName,
          email: committerEmail,
        },
      });

      const result: CommitResult = {
        sha: data.commit.sha ?? '',
        url: data.commit.html_url ?? '',
        tokenMode,
      };

      console.log(
        `[commit-reliability] Commit successful — ` +
          `sha=${result.sha.slice(0, 8)} tokenMode=${tokenMode} ` +
          `projectId=${projectId} ${owner}/${repo}@${branch}:${filePath}`
      );

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const statusCode = (err as { status?: number }).status;

      if (statusCode === 409) {
        // SHA conflict — retry with fresh SHA
        console.warn(
          `[commit-reliability] SHA conflict on attempt ${attempt}, retrying — ` +
            `${owner}/${repo}@${branch}:${filePath}`
        );
        await sleep(100 * attempt); // back-off: 100ms, 200ms, 300ms
        continue;
      }

      if (statusCode === 422) {
        console.error(
          `[commit-reliability] Unprocessable entity (422) — likely invalid content. ` +
            `Not retrying. ${filePath}`
        );
        throw lastError;
      }

      if (statusCode === 404) {
        console.error(
          `[commit-reliability] Repository or branch not found (404) — ` +
            `${owner}/${repo}@${branch}`
        );
        throw lastError;
      }

      if (statusCode === 401 || statusCode === 403) {
        console.error(
          `[commit-reliability] Authorization error (${statusCode}) — ` +
            `tokenMode=${tokenMode} tokenSource="${tokenSource}" ` +
            `${owner}/${repo}@${branch}:${filePath}`
        );
        throw lastError;
      }

      // Unknown error — retry
      console.warn(
        `[commit-reliability] Unexpected error on attempt ${attempt}, retrying — ` +
          `status=${statusCode} error="${lastError.message}"`
      );
      await sleep(200 * attempt);
    }
  }

  const finalMessage =
    `[commit-reliability] Exhausted ${maxRetries} retries — ` +
    `${owner}/${repo}@${branch}:${filePath} ` +
    `lastError="${lastError?.message}"`;
  console.error(finalMessage);
  throw new Error(finalMessage);
}

/**
 * Commits multiple files in a single tree+commit operation (atomic batch).
 * Uses ownership-aware token resolution.
 */
export async function commitFilesBatch(options: {
  adminId: string;
  projectId: string;
  owner: string;
  repo: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  committerName?: string;
  committerEmail?: string;
}): Promise<CommitResult> {
  const {
    adminId,
    projectId,
    owner,
    repo,
    branch,
    files,
    commitMessage,
    committerName = 'Terrarium Bot',
    committerEmail = 'bot@terrarium.dev',
  } = options;

  console.log(
    `[commit-reliability] Starting batch commit — ` +
      `projectId=${projectId} adminId=${adminId} ` +
      `${owner}/${repo}@${branch} files=${files.length}`
  );

  // ── Resolve token via ownership resolver ──────────────────────────────────
  const { token, mode: tokenMode, source: tokenSource } =
    await resolveGitHubToken(adminId, projectId);

  console.log(
    `[commit-reliability] Batch commit token resolved — ` +
      `mode="${tokenMode}" source="${tokenSource}" projectId=${projectId}`
  );

  const octokit = new Octokit({ auth: token });

  try {
    // 1. Get current HEAD SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const headSha = refData.object.sha;
    console.log(`[commit-reliability] HEAD SHA=${headSha.slice(0, 8)}`);

    // 2. Get base tree SHA
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: headSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 3. Create new tree with all file blobs
    const treeItems: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    for (const file of files) {
      const { data: blobData } = await octokit.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: 'base64',
      });
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });

    // 4. Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [headSha],
      committer: { name: committerName, email: committerEmail },
      author: { name: committerName, email: committerEmail },
    });

    // 5. Update HEAD ref
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    const result: CommitResult = {
      sha: newCommit.sha,
      url: newCommit.html_url,
      tokenMode,
    };

    console.log(
      `[commit-reliability] Batch commit successful — ` +
        `sha=${newCommit.sha.slice(0, 8)} files=${files.length} ` +
        `tokenMode=${tokenMode} projectId=${projectId}`
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[commit-reliability] Batch commit failed — error="${message}" ` +
        `projectId=${projectId} ${owner}/${repo}@${branch} tokenMode=${tokenMode}`
    );
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getFileSha(
  octokit: Octokit,
  opts: { owner: string; repo: string; branch: string; filePath: string }
): Promise<string | undefined> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: opts.owner,
      repo: opts.repo,
      path: opts.filePath,
      ref: opts.branch,
    });
    if (Array.isArray(data)) return undefined; // it's a directory
    return (data as { sha: string }).sha;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return undefined;
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}