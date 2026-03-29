/**
 * /api/agent/generate — ERT-P3 C2-BE
 * Code generation pipeline: agent output → PatchOperations → file write.
 * Orchestrates the full flow: parse agent output → validate → apply patches
 * via PatchEngine → update agent_output generation_status → return result.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPatchEngine } from '@/lib/patch-engine'
import { parseAgentOutputToOperations, GenerationStatus } from '@/lib/code-generator'

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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Mark as generating
  await updateGenerationStatus(supabase, agent_output_id, 'generating')

  // Step 1: Parse agent output → PatchOperations
  const generationResult = parseAgentOutputToOperations({
    rawAgentOutput: raw_output,
    agentRole: agent_role,
    taskId: task_id,
    existingFilePaths: existing_file_paths ?? [],
  })

  // Step 2: Validation gate — abort if parsing errors
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

  return NextResponse.json({
    success: true,
    generation_status: 'files_written' as GenerationStatus,
    files_written: patchResult.files_modified,
    applied_operations: patchResult.applied_operations,
    language: generationResult.language,
    summary: generationResult.summary,
    warnings: generationResult.validation.warnings,
  })
}
