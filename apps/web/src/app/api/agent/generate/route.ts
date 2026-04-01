/**
 * /api/agent/generate — ERT-P3 C2-BE (P0 patched)
 * Code generation pipeline: agent output → PatchOperations → file write → GitHub commit.
 *
 * Auth: accepts both user JWT AND X-Buildos-Secret (internal n8n/system calls).
 * After files_written: commits to GitHub via GitHub App (non-fatal if unconfigured).
 * After GitHub commit: triggers Vercel deploy hook (non-fatal if unconfigured).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { getPatchEngine } from '@/lib/patch-engine'
import { parseAgentOutputToOperations, GenerationStatus } from '@/lib/code-generator'
import { commitFilesToGitHub, triggerVercelDeploy } from '@/lib/github-commit'
import {
  verifyCommitDelivery,
  logCommitDelivery,
  escalateToIncident,
} from '@/lib/commit-reliability'

// ─────────────────────────────────────────────────────────────────────────────
// Request shape
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  project_id: string
  task_id: string
  agent_output_id: string
  agent_role: string
  raw_output: string
  /** Optional list of file paths that already exist in project_files */
  existing_file_paths?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: persist generation_status to agent_outputs row
// ─────────────────────────────────────────────────────────────────────────────

async function updateGenerationStatus(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  agentOutputId: string,
  status: GenerationStatus,
  extra?: Record<string, unknown>,
) {
  await supabase
    .from('agent_outputs')
    .update({ generation_status: status, ...extra })
    .eq('id', agentOutputId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: record generation event for audit trail
// ─────────────────────────────────────────────────────────────────────────────

async function recordGenerationEvent(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string,
  taskId: string,
  agentOutputId: string,
  status: GenerationStatus,
  filesWritten: string[],
  errors: string[],
) {
  await supabase.from('generation_events').insert({
    project_id: projectId,
    task_id: taskId,
    agent_output_id: agentOutputId,
    status,
    files_written: filesWritten,
    errors,
    occurred_at: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

// Allow up to 60s: PatchEngine + GitHub API calls can take time
export const maxDuration = 60

export async function POST(request: NextRequest) {
  // ── Auth: accept X-Buildos-Secret (internal) OR user JWT ─────────────────
  const webhookSecret = request.headers.get('X-Buildos-Secret')
  const validSecrets = [
    process.env.N8N_WEBHOOK_SECRET,
    process.env.BUILDOS_INTERNAL_SECRET,
    process.env.BUILDOS_SECRET,
  ].filter(Boolean)
  const isInternalCall = webhookSecret && validSecrets.includes(webhookSecret)

  // Admin client for internal calls (bypasses RLS); user client for browser calls
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  let projectOwnerId: string | null = null

  if (isInternalCall) {
    // Internal path: use admin client, skip ownership check
    supabase = createAdminSupabaseClient() as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>
  } else {
    supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    projectOwnerId = user.id
  }

  // Parse body
  let body: GenerateRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { project_id, task_id, agent_output_id, agent_role, raw_output, existing_file_paths } = body

  // Required field validation
  const missing = (['project_id', 'task_id', 'agent_output_id', 'agent_role', 'raw_output'] as const)
    .filter((k) => !body[k])
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    )
  }

  // Verify project exists (ownership check only for user JWT path)
  if (projectOwnerId) {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', projectOwnerId)
      .maybeSingle()
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
  } else {
    // Internal path: just confirm the project row exists
    const admin = createAdminSupabaseClient()
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .maybeSingle()
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
  }

  // Mark as generating
  await updateGenerationStatus(supabase, agent_output_id, 'generating')

  // Step 1: Auto-detect existing file paths so patch engine uses UPDATE not CREATE
  let resolvedExistingPaths: string[] = existing_file_paths ?? []
  if (resolvedExistingPaths.length === 0) {
    try {
      const adminForCheck = createAdminSupabaseClient()
      const { data: existingFiles } = await adminForCheck
        .from('project_files')
        .select('file_path')
        .eq('project_id', project_id)
      if (existingFiles && existingFiles.length > 0) {
        resolvedExistingPaths = existingFiles.map(f => f.file_path)
      }
    } catch {
      // non-fatal — fall back to empty (all will be CREATE)
    }
  }

  // Step 2: Parse agent output → PatchOperations
  const generationResult = parseAgentOutputToOperations({
    rawAgentOutput: raw_output,
    agentRole: agent_role,
    taskId: task_id,
    existingFilePaths: resolvedExistingPaths,
  })

  // Step 3: Validation gate — abort if parsing errors
  if (!generationResult.validation.valid) {
    await updateGenerationStatus(supabase, agent_output_id, 'compile_failed', {
      generation_errors: generationResult.validation.errors,
    })

    await recordGenerationEvent(
      supabase,
      project_id,
      task_id,
      agent_output_id,
      'compile_failed',
      [],
      generationResult.validation.errors,
    )

    return NextResponse.json(
      {
        error: 'Code generation validation failed',
        validation_errors: generationResult.validation.errors,
        warnings: generationResult.validation.warnings,
      },
      { status: 422 },
    )
  }

  if (generationResult.operations.length === 0) {
    await updateGenerationStatus(supabase, agent_output_id, 'compile_failed', {
      generation_errors: ['No valid patch operations extracted from agent output'],
    })

    return NextResponse.json(
      {
        error: 'No patch operations could be extracted from agent output',
        warnings: generationResult.validation.warnings,
        hint: 'Ensure code blocks have filename comments (e.g. "// src/lib/foo.ts")',
      },
      { status: 422 },
    )
  }

  // Step 3: Apply PatchOperations via PatchEngine
  const engine = getPatchEngine()
  const patchResult = await engine.applyOperations(project_id, task_id, generationResult.operations)

  if (!patchResult.success) {
    await updateGenerationStatus(supabase, agent_output_id, 'compile_failed', {
      generation_errors: [patchResult.error ?? 'Patch application failed'],
    })

    await recordGenerationEvent(
      supabase,
      project_id,
      task_id,
      agent_output_id,
      'compile_failed',
      [],
      [patchResult.error ?? 'Patch application failed'],
    )

    const isLockConflict = patchResult.error?.includes('locked')
    return NextResponse.json(
      {
        error: patchResult.error ?? 'File write failed',
        rollback_performed: patchResult.rollback_performed,
      },
      { status: isLockConflict ? 409 : 500 },
    )
  }

  // Step 4: Mark as files_written
  await updateGenerationStatus(supabase, agent_output_id, 'files_written', {
    generated_files: patchResult.files_modified,
  })

  await recordGenerationEvent(
    supabase,
    project_id,
    task_id,
    agent_output_id,
    'files_written',
    patchResult.files_modified,
    generationResult.validation.warnings,
  )

  // ── Step 5: GitHub commit + G4 Verification Gate ────────────────────────
  // Read the written file contents from project_files table and commit to GitHub.
  // After commit: verify each file exists in repo (RULE-14, G4 protocol).
  // Verified failures force task back to 'blocked' — commit failure is NOT non-fatal
  // for code/schema/test tasks. Evidence is always written to commit_delivery_logs.
  let commitSha: string | null = null
  let commitUrl: string | null = null
  let deployTriggered = false
  let deployUrl: string | null = null
  let commitError: string | null = null
  let deployError: string | null = null
  let allFilesVerified = true

  const adminForCommit = createAdminSupabaseClient()

  try {
    const { data: projectFiles } = await adminForCommit
      .from('project_files')
      .select('file_path, content')
      .eq('project_id', project_id)
      .in('file_path', patchResult.files_modified)

    if (projectFiles && projectFiles.length > 0) {
      const commitMessage =
        `[BuildOS] Agent ${agent_role} — task ${task_id.slice(0, 8)}\n\n` +
        `Files: ${patchResult.files_modified.join(', ')}\n` +
        `Operations: ${patchResult.applied_operations}`

      const commitResult = await commitFilesToGitHub(
        projectFiles.map(f => ({ path: f.file_path, content: f.content })),
        commitMessage,
      )

      if (commitResult.success) {
        commitSha = commitResult.commitSha ?? null
        commitUrl = commitResult.commitUrl ?? null

        console.log(`[agent/generate] GitHub commit: ${commitSha?.slice(0, 8)} — ${patchResult.files_modified.join(', ')}`)

        // ── G4: Verify each committed file exists in repo ─────────────────────
        for (const filePath of patchResult.files_modified) {
          const verifyResult = await verifyCommitDelivery(filePath)

          const logId = await logCommitDelivery(adminForCommit, {
            task_id,
            project_id,
            repo_name: `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
            branch_name: process.env.GITHUB_REPO_BRANCH ?? 'main',
            target_path: filePath,
            stub_created: false, // stub is set at dispatch time; this is post-commit verify
            token_refreshed: true, // verifyCommitDelivery always calls ensureFreshToken
            commit_sha: commitSha,
            commit_verified: verifyResult.verified,
            verification_notes: verifyResult.notes,
          })

          if (!verifyResult.verified) {
            allFilesVerified = false
            console.error(
              `[agent/generate] ⚠ G4 VERIFICATION FAILED: ${filePath} — ${verifyResult.notes}`
            )

            // Escalate to incident if failure threshold reached
            await escalateToIncident(
              adminForCommit,
              task_id,
              project_id,
              verifyResult.notes,
              logId,
            )
          }
        }

        // ── G4 enforcement: block task if any file unverified ─────────────────
        if (!allFilesVerified) {
          // Force task back to 'blocked' — it must not remain in awaiting_review
          // with unverified code delivery
          await adminForCommit
            .from('tasks')
            .update({
              status: 'blocked',
              failure_detail: 'G4: commit_verified=false — one or more files not found in repo after commit',
              failure_category: 'commit_delivery',
            })
            .eq('id', task_id)

          console.error(
            `[agent/generate] G4: task ${task_id} forced to 'blocked' — ` +
            `commit verification failed for ${patchResult.files_modified.join(', ')}`
          )
        } else {
          // ── Step 6: Vercel deploy hook (non-fatal, only on verified commit) ─
          const deployResult = await triggerVercelDeploy()
          deployTriggered = deployResult.triggered
          deployUrl = deployResult.deploymentUrl ?? null
          if (!deployResult.triggered) {
            deployError = deployResult.error ?? 'Unknown deploy error'
            console.warn('[agent/generate] Deploy hook skipped:', deployError)
          }
        }
      } else {
        commitError = commitResult.error ?? 'Unknown commit error'
        console.warn('[agent/generate] GitHub commit failed:', commitError)
        allFilesVerified = false

        // Log failure for each file
        for (const filePath of patchResult.files_modified) {
          const logId = await logCommitDelivery(adminForCommit, {
            task_id,
            project_id,
            repo_name: `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
            branch_name: process.env.GITHUB_REPO_BRANCH ?? 'main',
            target_path: filePath,
            stub_created: false,
            token_refreshed: false,
            commit_sha: null,
            commit_verified: false,
            verification_notes: `Commit failed: ${commitError}`,
          })

          await escalateToIncident(
            adminForCommit,
            task_id,
            project_id,
            `Commit failed: ${commitError}`,
            logId,
          )
        }

        // Block task
        await adminForCommit
          .from('tasks')
          .update({
            status: 'blocked',
            failure_detail: `G4: GitHub commit failed — ${commitError}`,
            failure_category: 'commit_delivery',
          })
          .eq('id', task_id)
      }
    } else {
      commitError = `project_files returned ${projectFiles?.length ?? 0} rows for paths: ${patchResult.files_modified.join(', ')}`
      console.warn('[agent/generate] No project_files found for commit:', commitError)
      allFilesVerified = false

      // Log missing files
      for (const filePath of patchResult.files_modified) {
        await logCommitDelivery(adminForCommit, {
          task_id,
          project_id,
          repo_name: `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
          branch_name: process.env.GITHUB_REPO_BRANCH ?? 'main',
          target_path: filePath,
          stub_created: false,
          token_refreshed: false,
          commit_sha: null,
          commit_verified: false,
          verification_notes: `project_files missing: ${commitError}`,
        })
      }
    }
  } catch (err) {
    commitError = err instanceof Error ? err.message : String(err)
    allFilesVerified = false
    console.error('[agent/generate] Commit/verify error:', commitError)

    // Log unexpected error
    for (const filePath of patchResult.files_modified) {
      const logId = await logCommitDelivery(adminForCommit, {
        task_id,
        project_id,
        repo_name: `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
        branch_name: process.env.GITHUB_REPO_BRANCH ?? 'main',
        target_path: filePath,
        stub_created: false,
        token_refreshed: false,
        commit_sha: null,
        commit_verified: false,
        verification_notes: `Exception: ${commitError}`,
      })
      await escalateToIncident(
        adminForCommit,
        task_id,
        project_id,
        `Exception in commit/verify: ${commitError}`,
        logId,
      )
    }

    // Block task
    await adminForCommit
      .from('tasks')
      .update({
        status: 'blocked',
        failure_detail: `G4: commit/verify threw exception — ${commitError}`,
        failure_category: 'commit_delivery',
      })
      .eq('id', task_id)
  }

  return NextResponse.json({
    success: allFilesVerified,
    generation_status: 'files_written' as GenerationStatus,
    files_written: patchResult.files_modified,
    applied_operations: patchResult.applied_operations,
    language: generationResult.language,
    summary: generationResult.summary,
    warnings: generationResult.validation.warnings,
    // G4 fields
    commit_verified: allFilesVerified,
    ...(commitSha ? { commit_sha: commitSha, commit_url: commitUrl } : {}),
    ...(commitError ? { commit_error: commitError } : {}),
    deploy_triggered: deployTriggered,
    ...(deployUrl ? { deploy_url: deployUrl } : {}),
    ...(deployError ? { deploy_error: deployError } : {}),
  })
}
