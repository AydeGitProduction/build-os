/**
 * /api/projects/[id]/files/patch — ERT-P3 B2-BE
 * Patch validation, no-overwrite policy enforcement, and patch API route.
 * Accepts an array of PatchOperations, validates them, then delegates
 * to PatchEngine for atomic DB-backed file writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPatchEngine, PatchOperation, PatchOperationType } from '@/lib/patch-engine'

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_OP_TYPES: PatchOperationType[] = [
  'create',
  'insert_after',
  'replace_block',
  'append',
  'delete_block',
]

interface ValidationError {
  index: number
  field: string
  message: string
}

function validateOperations(ops: unknown[]): ValidationError[] {
  const errors: ValidationError[] = []

  ops.forEach((op, i) => {
    if (typeof op !== 'object' || op === null) {
      errors.push({ index: i, field: 'root', message: 'Operation must be an object' })
      return
    }

    const o = op as Record<string, unknown>

    if (!VALID_OP_TYPES.includes(o.type as PatchOperationType)) {
      errors.push({
        index: i,
        field: 'type',
        message: `Invalid operation type "${o.type}". Must be one of: ${VALID_OP_TYPES.join(', ')}`,
      })
    }

    if (typeof o.file_path !== 'string' || o.file_path.trim() === '') {
      errors.push({ index: i, field: 'file_path', message: 'file_path is required and must be a non-empty string' })
    } else {
      // No-overwrite policy: 'create' operations are the only way to make new files.
      // Reject any path with traversal attempts.
      if (o.file_path.includes('..') || o.file_path.startsWith('/')) {
        errors.push({
          index: i,
          field: 'file_path',
          message: 'file_path must be relative and cannot traverse directories',
        })
      }
    }

    // Type-specific validation
    switch (o.type) {
      case 'create':
        if (typeof o.content !== 'string') {
          errors.push({ index: i, field: 'content', message: 'content is required for create operations' })
        }
        break

      case 'insert_after':
        if (typeof o.anchor !== 'string' || o.anchor.trim() === '') {
          errors.push({ index: i, field: 'anchor', message: 'anchor is required for insert_after operations' })
        }
        if (typeof o.content !== 'string') {
          errors.push({ index: i, field: 'content', message: 'content is required for insert_after operations' })
        }
        break

      case 'replace_block':
        if (typeof o.start_anchor !== 'string' || o.start_anchor.trim() === '') {
          errors.push({ index: i, field: 'start_anchor', message: 'start_anchor is required for replace_block operations' })
        }
        if (typeof o.end_anchor !== 'string' || o.end_anchor.trim() === '') {
          errors.push({ index: i, field: 'end_anchor', message: 'end_anchor is required for replace_block operations' })
        }
        if (typeof o.replacement !== 'string') {
          errors.push({ index: i, field: 'replacement', message: 'replacement is required for replace_block operations' })
        }
        break

      case 'append':
        if (typeof o.content !== 'string') {
          errors.push({ index: i, field: 'content', message: 'content is required for append operations' })
        }
        break

      case 'delete_block':
        if (typeof o.start_anchor !== 'string' || o.start_anchor.trim() === '') {
          errors.push({ index: i, field: 'start_anchor', message: 'start_anchor is required for delete_block operations' })
        }
        if (typeof o.end_anchor !== 'string' || o.end_anchor.trim() === '') {
          errors.push({ index: i, field: 'end_anchor', message: 'end_anchor is required for delete_block operations' })
        }
        break
    }
  })

  return errors
}

// No-overwrite policy check: verifies that non-create ops target existing files
async function checkNoOverwritePolicy(
  projectId: string,
  ops: PatchOperation[],
  supabase: ReturnType<typeof createClient>,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = []
  const nonCreateOps = ops
    .map((op, i) => ({ op, i }))
    .filter(({ op }) => op.type !== 'create')

  if (nonCreateOps.length === 0) return errors

  const filePaths = [...new Set(nonCreateOps.map(({ op }) => op.file_path))]
  const { data: existingFiles } = await supabase
    .from('project_files')
    .select('file_path')
    .eq('project_id', projectId)
    .in('file_path', filePaths)

  const existingSet = new Set((existingFiles ?? []).map((f: { file_path: string }) => f.file_path))

  for (const { op, i } of nonCreateOps) {
    if (!existingSet.has(op.file_path)) {
      errors.push({
        index: i,
        field: 'file_path',
        message: `No-overwrite policy violation: file "${op.file_path}" does not exist. Use type="create" to create new files.`,
      })
    }
  }

  return errors
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const projectId = params.id
  const supabase = createClient()

  // Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { operations, task_id } = body as { operations?: unknown; task_id?: unknown }

  if (!Array.isArray(operations) || operations.length === 0) {
    return NextResponse.json(
      { error: 'operations must be a non-empty array' },
      { status: 400 },
    )
  }

  if (typeof task_id !== 'string' || task_id.trim() === '') {
    return NextResponse.json(
      { error: 'task_id is required and must be a string' },
      { status: 400 },
    )
  }

  if (operations.length > 50) {
    return NextResponse.json(
      { error: 'Maximum 50 operations per request' },
      { status: 400 },
    )
  }

  // Structural validation
  const structuralErrors = validateOperations(operations)
  if (structuralErrors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', validation_errors: structuralErrors },
      { status: 422 },
    )
  }

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // No-overwrite policy check
  const policyErrors = await checkNoOverwritePolicy(projectId, operations as PatchOperation[], supabase)
  if (policyErrors.length > 0) {
    return NextResponse.json(
      { error: 'No-overwrite policy violation', validation_errors: policyErrors },
      { status: 409 },
    )
  }

  // Apply via PatchEngine
  const engine = getPatchEngine()
  const result = await engine.applyOperations(projectId, task_id, operations as PatchOperation[])

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error ?? 'Patch application failed',
        rollback_performed: result.rollback_performed ?? false,
      },
      { status: result.error?.includes('locked') ? 409 : 500 },
    )
  }

  return NextResponse.json({
    success: true,
    applied_operations: result.applied_operations,
    files_modified: result.files_modified,
  })
}
