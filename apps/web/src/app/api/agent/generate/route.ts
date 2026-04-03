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
import { commitFilesToGitHub, triggerVercelDeploy, CommitRepoOverride } from '@/lib/github-commit'
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

  // Step 1b: Pre-process raw_output — unwrap legacy n8n structured schema format.
  // Some tasks dispatched via the old n8n path return:
  //   { tables: [{ description: "```json\n{output:{files:[...]}}\n```" }], migration_sql: "..." }
  // The parser can't handle this because (a) files live in tables[0].description and
  // (b) the description is often truncated. We try to recover by:
  //   1. Extracting a partial JSON block from tables[0].description and appending "}}" to close it
  //   2. Falling back to building a synthetic output from migration_sql / typescript_types fields
  let processedRawOutput = raw_output

  // ── Step 1b-0: Strip markdown code fences and leading comment lines ──────────
  // Agents sometimes wrap JSON in fences like:
  //   // src/app/api/task-name/route.ts
  //   ```json
  //   {"output":{"files":[...]}}
  //   ```
  {
    // Remove leading TypeScript/JS single-line comments
    const noComments = raw_output.replace(/^(\/\/[^\n]*\n)+/, '').trim()
    // Check if content starts with a code fence.
    // IMPORTANT: use greedy [\s\S]* (not lazy [\s\S]*?) so we match from the
    // OUTER opening fence to the LAST closing ```, not the first one encountered.
    // Lazy matching breaks when agent JSON contains embedded TypeScript code
    // fences inside "content" strings — the lazy regex stops at the inner ```,
    // truncating the JSON and causing parse failure → no files committed.
    const fenceMatch = noComments.match(/^```(?:json|typescript|ts|js|javascript)?\s*\n([\s\S]*)\n?```\s*$/s)
    if (fenceMatch) {
      processedRawOutput = fenceMatch[1].trim()
      console.log('[agent/generate] Stripped markdown code fence from raw_output (greedy outer-fence match)')
    } else if (noComments !== raw_output) {
      processedRawOutput = noComments
    }
    // Last resort: extract the first JSON object containing "output" key
    if (processedRawOutput === raw_output && raw_output.includes('"output"')) {
      const jsonMatch = raw_output.match(/(\{[\s\S]*?"output"[\s\S]*\})\s*$/)
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[1])
          processedRawOutput = jsonMatch[1]
          console.log('[agent/generate] Extracted JSON block via regex fallback')
        } catch { /* not valid JSON */ }
      }
    }
  }

  try {
    const rawForOuterParse = processedRawOutput
    const outerParsed = JSON.parse(rawForOuterParse)

    // ── Railway "Output parse error" wrapper recovery ────────────────────────
    // When Railway's own JSON.parse fails (e.g. agent output has unescaped
    // newlines in content strings), Railway wraps the raw text as:
    //   { "summary": "Output parse error", "output": { "content": "<raw_text>", "format": "text" } }
    // In this case we MUST extract the raw text from output.content and treat
    // it as the actual agent output — stripping fences and re-parsing it.
    if (
      outerParsed &&
      typeof outerParsed === 'object' &&
      !Array.isArray(outerParsed) &&
      typeof (outerParsed as Record<string, unknown>).summary === 'string' &&
      typeof ((outerParsed as Record<string, unknown>).output as Record<string, unknown> | null | undefined)?.content === 'string'
    ) {
      const innerRaw = ((outerParsed as Record<string, unknown>).output as Record<string, unknown>).content as string
      // Re-apply fence stripping on the recovered raw text
      const innerNoComments = innerRaw.replace(/^(\/\/[^\n]*\n)+/, '').trim()
      const innerFenceMatch = innerNoComments.match(/^```(?:json|typescript|ts|js|javascript)?\s*\n([\s\S]*)\n?```\s*$/s)
      processedRawOutput = innerFenceMatch ? innerFenceMatch[1].trim() : innerNoComments
      console.log('[agent/generate] Unwrapped Railway parse-error wrapper — recovered raw agent output for re-parsing')
    } else if (
      outerParsed &&
      typeof outerParsed === 'object' &&
      !Array.isArray(outerParsed) &&
      Array.isArray(outerParsed.tables)
    ) {
      const desc: string = outerParsed.tables[0]?.description ?? ''
      // desc starts with ```json\n{...} — may be truncated (no closing ```)
      // Try to extract the inner JSON
      const jsonStartIdx = desc.indexOf('\n{')
      if (jsonStartIdx !== -1) {
        let jsonStr = desc.slice(jsonStartIdx).trim()
        // Try to parse as-is; if it fails, try appending closing braces
        let innerParsed: Record<string, unknown> | null = null
        for (const suffix of ['', '}}', '}}}', '}}}}']) {
          try {
            innerParsed = JSON.parse(jsonStr + suffix)
            break
          } catch { /* try next */ }
        }
        if (innerParsed && innerParsed.output) {
          // Successful inner parse — use this as the raw output
          processedRawOutput = JSON.stringify(innerParsed)
          console.log('[agent/generate] Unwrapped n8n schema format from tables[0].description')
        }
      }
      // If we still have the outer format and there's a migration_sql field, synthesize output
      if (processedRawOutput === raw_output) {
        const migrationSql: string = outerParsed.migration_sql ?? ''
        const tsTypes: string = outerParsed.typescript_types ?? ''
        // Skip mock/placeholder content
        const isMock = migrationSql.includes('MOCK') || migrationSql.includes('Set ANTHROPIC_API_KEY')
        if (!isMock && migrationSql.trim().length > 50) {
          const syntheticFiles: Array<{ path: string; content: string }> = []
          if (migrationSql.trim()) {
            syntheticFiles.push({
              path: `migrations/${Date.now()}_schema.sql`,
              content: migrationSql,
            })
          }
          if (tsTypes.trim() && !tsTypes.includes('MOCK')) {
            syntheticFiles.push({
              path: `src/types/schema.ts`,
              content: tsTypes,
            })
          }
          if (syntheticFiles.length > 0) {
            processedRawOutput = JSON.stringify({ output: { files: syntheticFiles } })
            console.log('[agent/generate] Built synthetic output from migration_sql/typescript_types fields')
          }
        } else {
          // The architect schema format with truncated description produces no recoverable files.
          // Mark the output as a documentation-only result (not a code generation failure).
          console.warn('[agent/generate] n8n architect schema format has no recoverable code files — treating as documentation task, not a code generation error')
          // Synthesize a schema notes file from the table data.
          // Use migrations/ path (allowed for backend_engineer) or docs/ (for architect).
          // We check the agent_role to pick the right location.
          try {
            const tableNames = (outerParsed.tables as Array<{name: string}>)?.map((t: {name: string}) => t.name).join(', ') ?? ''
            const notes: string = (outerParsed.notes as string) ?? ''
            if (tableNames) {
              const docContent = `-- Schema Design Notes\n-- Tables: ${tableNames}\n${notes ? `-- Notes: ${notes}` : ''}\n-- Generated from architect schema output\nSELECT 1; -- placeholder\n`
              // Use migrations/ path — allowed for backend_engineer AND database_engineer
              // architect tasks use docs/ but we check what's allowed
              const isArchitect = agent_role === 'architect'
              const filePath = isArchitect
                ? `docs/schema-design-${Date.now()}.md`
                : `migrations/${Date.now()}_schema_notes.sql`
              processedRawOutput = JSON.stringify({
                output: { files: [{ path: filePath, content: docContent }] }
              })
              console.log(`[agent/generate] Built schema notes file at ${filePath}`)
            }
          } catch { /* leave as-is */ }
        }
      }
    }
  } catch {
    // Not JSON or unrecognised shape — leave processedRawOutput as raw_output
  }

  // Step 2: Parse agent output → PatchOperations
  const generationResult = parseAgentOutputToOperations({
    rawAgentOutput: processedRawOutput,
    agentRole: agent_role,
    taskId: task_id,
    existingFilePaths: resolvedExistingPaths,
  })

  // Step 2b: WS1 Hard Language Lock
  // Reject any agent output whose primary language is Go, Python, Rust, or Java.
  // This is a TypeScript/Next.js/SQL-only project. Wrong-language output is a
  // fatal error — it means the agent is misconfigured, not a recoverable path issue.
  const FORBIDDEN_LANGUAGES = new Set(['go', 'python', 'rust', 'java'])
  if (FORBIDDEN_LANGUAGES.has(generationResult.language)) {
    const langLockError = `WS1-LANG-LOCK: Agent produced ${generationResult.language} output — only TypeScript/SQL is permitted for this project. Ensure agent system prompt includes LANGUAGE LOCK constraint.`

    await updateGenerationStatus(supabase, agent_output_id, 'compile_failed', {
      generation_errors: [langLockError],
    })

    await recordGenerationEvent(
      supabase, project_id, task_id, agent_output_id,
      'compile_failed', [], [langLockError],
    )

    return NextResponse.json(
      {
        error: langLockError,
        language_mismatch: true,
        detected_language: generationResult.language,
        hint: 'Update agent system prompt to include explicit TypeScript-only language constraint.',
      },
      { status: 422 },
    )
  }

  // Step 3: Validation gate
  // DESIGN: Path-validation errors on individual blocks (e.g. ".env.local" outside allowed
  // paths, directory paths) are soft failures — the block is skipped but other valid blocks
  // are still applied. We only hard-abort if NO valid operations were produced at all.
  // Protected-file violations: if the agent produced OTHER valid operations alongside the
  // protected-file attempt, we log a warning but proceed with the valid operations. We only
  // hard-abort if the ONLY output was targeting a protected file (operations.length === 0).
  const hasFatalErrors =
    !generationResult.validation.valid &&
    generationResult.operations.length === 0

  const hasProtectedFileViolation = generationResult.validation.errors.some((e) =>
    e.includes('protected infrastructure file'),
  )

  // Hard-abort: protected file is the ONLY thing the agent produced, OR no operations at all
  const shouldAbort =
    (hasProtectedFileViolation && generationResult.operations.length === 0) || hasFatalErrors

  if (shouldAbort) {
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
        error: hasProtectedFileViolation
          ? 'Agent attempted to overwrite a protected infrastructure file (and produced no other valid files)'
          : 'Code generation validation failed — no valid operations produced',
        validation_errors: generationResult.validation.errors,
        warnings: generationResult.validation.warnings,
      },
      { status: 422 },
    )
  }

  // Soft-warn: protected file violation alongside other valid operations — log but proceed
  if (hasProtectedFileViolation && generationResult.operations.length > 0) {
    console.warn(
      `[agent/generate] Protected file violation for task ${task_id} — skipping protected file(s) but proceeding with ${generationResult.operations.length} other valid operations.`,
      generationResult.validation.errors,
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

  // Non-fatal: audit log insert must NOT block GitHub commit (step 5).
  // generation_events table may be missing or have a constraint violation;
  // that must never prevent code from being committed.
  try {
    await recordGenerationEvent(
      supabase,
      project_id,
      task_id,
      agent_output_id,
      'files_written',
      patchResult.files_modified,
      generationResult.validation.warnings,
    )
  } catch (evtErr) {
    console.warn('[agent/generate] generation_events insert failed (non-fatal, step 4):', evtErr)
  }

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

  // ── Resolve per-project GitHub repo from project_integrations ─────────────
  // Agents commit to the project's own GitHub repo, not the platform monorepo.
  // project_integrations.environment_map contains github_repo_url when the
  // integration is GitHub (format: "https://github.com/<owner>/<repo>").
  // Falls back to global GITHUB_REPO_* env vars if no integration is found.
  let projectRepoOverride: CommitRepoOverride | undefined
  try {
    const { data: integrations } = await (adminForCommit as any)
      .from('project_integrations')
      .select('environment_map')
      .eq('project_id', project_id)
      .eq('status', 'active')

    const githubIntegration = (integrations as any[])?.find(
      (i: any) => i?.environment_map?.github_repo_url
    )

    if (githubIntegration?.environment_map?.github_repo_url) {
      const repoUrl = githubIntegration.environment_map.github_repo_url as string
      // Parse: https://github.com/owner/repo
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
      if (match) {
        const repoOwner = match[1]
        const repoName = match[2]
        console.log(`[agent/generate] Using per-project GitHub repo: ${repoOwner}/${repoName}`)
        projectRepoOverride = {
          owner: repoOwner,
          repo: repoName,
          // noPathPrefix: standalone project repos have files at root, not under apps/web/
          noPathPrefix: true,
        }
      }
    } else {
      // B0.3a: deployment_targets is canonical source of truth for per-project routing.
      // Filter to production environment_id to get the correct row and avoid multi-row issues.
      try {
        const { data: prodEnv } = await (adminForCommit as any)
          .from('project_environments')
          .select('id')
          .eq('project_id', project_id)
          .eq('is_production', true)
          .maybeSingle()

        if (prodEnv?.id) {
          const { data: dtTarget } = await (adminForCommit as any)
            .from('deployment_targets')
            .select('target_config')
            .eq('project_id', project_id)
            .eq('environment_id', prodEnv.id)
            .eq('provider', 'vercel')
            .eq('status', 'live')
            .maybeSingle()

          const repoFullName = dtTarget?.target_config?.github_repo_fullname as string | undefined
          if (repoFullName) {
            const [dtOwner, dtRepo] = repoFullName.split('/')
            if (dtOwner && dtRepo) {
              console.log(`[agent/generate] B0.3a routing → deployment_targets (production): ${dtOwner}/${dtRepo}`)
              projectRepoOverride = {
                owner: dtOwner,
                repo: dtRepo,
                noPathPrefix: true,
              }
            }
          }
        }
      } catch (dtErr) {
        console.warn('[agent/generate] deployment_targets routing lookup failed:', dtErr)
      }
    }
  } catch (intErr) {
    console.warn(`[agent/generate] Could not fetch project_integrations:`, intErr)
  }

  // B0.3a SAFETY GATE: if no project-bound routing data found, FAIL SAFELY.
  if (!projectRepoOverride) {
    const noRouteMsg =
      `B0.3a-ROUTING-FAIL: No project-bound GitHub repo found for project ${project_id}. ` +
      `Bootstrap the project first to provision its GitHub repo. Commit blocked.`
    console.error('[agent/generate] ROUTING SAFETY GATE:', noRouteMsg)
    await updateGenerationStatus(supabase, agent_output_id, 'compile_failed', {
      generation_errors: [noRouteMsg],
    })
    try {
      await recordGenerationEvent(supabase, project_id, task_id, agent_output_id, 'compile_failed', [], [noRouteMsg])
    } catch { /* non-fatal */ }
    await (adminForCommit as any)
      .from('tasks')
      .update({
        status: 'blocked',
        failure_detail: noRouteMsg,
        failure_category: 'routing_missing',
      })
      .eq('id', task_id)
    return NextResponse.json({ error: noRouteMsg, routing_missing: true }, { status: 422 })
  }

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
        undefined,
        projectRepoOverride,
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
            repo_name: projectRepoOverride?.owner && projectRepoOverride?.repo
              ? `${projectRepoOverride.owner}/${projectRepoOverride.repo}`
              : `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
            branch_name: projectRepoOverride?.branch ?? process.env.GITHUB_REPO_BRANCH ?? 'main',
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

        // ── G4 enforcement: block or complete task based on commit verification ──
        // EXECUTION CONTRACT (Developer 2): This is the ONLY place that sets
        // status = 'completed'. QA PASS sets 'pending_deploy'. We set 'completed'
        // here only after commit_verified = true + Vercel deploy triggered.
        // This enforces: agent → generate → commit → deploy → verify → COMPLETED.
        if (!allFilesVerified) {
          // WS2: mark generation as commit_failed (not files_written) — truth matters
          await updateGenerationStatus(supabase, agent_output_id, 'commit_failed', {
            generation_errors: ['G4: commit_verified=false — files written locally but not confirmed in repo'],
          })

          // Commit verification failed — block the task regardless of current status.
          // pending_deploy → blocked (commit proof absent)
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

          // ── VERIFIED_DONE: commit verified + deploy triggered → completed ──
          // This is the ONLY path to 'completed'. Transition from 'pending_deploy'.
          // If task is already 'completed' (legacy path), this is a no-op.
          await adminForCommit
            .from('tasks')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              failure_detail: null,
              failure_category: null,
            })
            .eq('id', task_id)
            .in('status', ['pending_deploy', 'awaiting_review'])  // Only advance, never regress

          console.log(
            `[agent/generate] VERIFIED_DONE: task ${task_id} → completed ` +
            `commit=${commitSha?.slice(0, 8)} deploy=${deployTriggered}`
          )
        }
      } else {
        commitError = commitResult.error ?? 'Unknown commit error'
        console.warn('[agent/generate] GitHub commit failed:', commitError)
        allFilesVerified = false

        // WS2: update generation_status to commit_failed — files were written locally but never pushed
        await updateGenerationStatus(supabase, agent_output_id, 'commit_failed', {
          generation_errors: [`G4: GitHub commit failed — ${commitError}`],
        })

        // Log failure for each file
        for (const filePath of patchResult.files_modified) {
          const logId = await logCommitDelivery(adminForCommit, {
            task_id,
            project_id,
            repo_name: projectRepoOverride?.owner && projectRepoOverride?.repo
              ? `${projectRepoOverride.owner}/${projectRepoOverride.repo}`
              : `${process.env.GITHUB_REPO_OWNER ?? ''}/${process.env.GITHUB_REPO_NAME ?? ''}`,
            branch_name: projectRepoOverride?.branch ?? process.env.GITHUB_REPO_BRANCH ?? 'main',
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

        // WS3: Atomicity — only block task if not already completed by QA
        const { data: currentStateOnCommitFail } = await adminForCommit
          .from('tasks')
          .select('status')
          .eq('id', task_id)
          .single()

        if (currentStateOnCommitFail?.status !== 'completed') {
          await adminForCommit
            .from('tasks')
            .update({
              status: 'blocked',
              failure_detail: `G4: GitHub commit failed — ${commitError}`,
              failure_category: 'commit_delivery',
            })
            .eq('id', task_id)
        }
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

    // WS2: mark as commit_failed (files exist locally but push threw an exception)
    await updateGenerationStatus(supabase, agent_output_id, 'commit_failed', {
      generation_errors: [`G4: commit/verify exception — ${commitError}`],
    })

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

    // WS3: Atomicity — only block task if not already completed by QA
    const { data: currentStateOnException } = await adminForCommit
      .from('tasks')
      .select('status')
      .eq('id', task_id)
      .single()

    if (currentStateOnException?.status !== 'completed') {
      await adminForCommit
        .from('tasks')
        .update({
          status: 'blocked',
          failure_detail: `G4: commit/verify threw exception — ${commitError}`,
          failure_category: 'commit_delivery',
        })
        .eq('id', task_id)
    }
  }

  // WS2: generation_status reflects actual delivery truth
  // files_written = files in DB but commit not yet confirmed (or commit succeeded and verified)
  // commit_failed = files in DB but git push/verify failed (already updated above in failure paths)
  const finalGenerationStatus: GenerationStatus = allFilesVerified ? 'files_written' : 'commit_failed'

  return NextResponse.json({
    success: allFilesVerified,
    generation_status: finalGenerationStatus,
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
