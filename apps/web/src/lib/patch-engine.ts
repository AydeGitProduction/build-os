/**
 * patch-engine.ts — ERT-P3 B1-BE
 * PatchOperation model, file write service, and file locking.
 * Handles atomic patching of project_files rows in Supabase with
 * conflict detection, rollback, and distributed lock management.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// PatchOperation types
// ─────────────────────────────────────────────────────────────────────────────

export type PatchOperationType =
  | 'create'
  | 'insert_after'
  | 'replace_block'
  | 'append'
  | 'delete_block'

export interface CreateOperation {
  type: 'create'
  file_path: string
  content: string
  encoding?: BufferEncoding
}

export interface InsertAfterOperation {
  type: 'insert_after'
  file_path: string
  /** Exact string to match — inserts after the LAST line containing this anchor */
  anchor: string
  content: string
  /** If true, anchor must match an entire line exactly (trimmed). Default: false */
  exact_line_match?: boolean
}

export interface ReplaceBlockOperation {
  type: 'replace_block'
  file_path: string
  /** First line of the block (inclusive, substring match) */
  start_anchor: string
  /** Last line of the block (inclusive, substring match) */
  end_anchor: string
  replacement: string
  /** Fail if more than one block matches. Default: true */
  require_unique?: boolean
}

export interface AppendOperation {
  type: 'append'
  file_path: string
  content: string
  /** Ensure exactly one trailing newline before appending. Default: true */
  ensure_newline?: boolean
}

export interface DeleteBlockOperation {
  type: 'delete_block'
  file_path: string
  /** First line of block to delete (inclusive, substring match) */
  start_anchor: string
  /** Last line of block to delete (inclusive, substring match) */
  end_anchor: string
  /** Also delete the lines containing the anchors. Default: true */
  inclusive?: boolean
}

export type PatchOperation =
  | CreateOperation
  | InsertAfterOperation
  | ReplaceBlockOperation
  | AppendOperation
  | DeleteBlockOperation

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface LockResult {
  success: boolean
  conflict?: { locked_by: string; acquired_at: string; expires_at: string }
  error?: string
}

export interface PatchResult {
  success: boolean
  applied_operations: number
  files_modified: string[]
  error?: string
  rollback_performed?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class PatchEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'PatchEngineError'
  }
}

export class LockConflictError extends PatchEngineError {
  constructor(filePath: string, lockedBy: string) {
    super(`File "${filePath}" is locked by task "${lockedBy}"`, 'LOCK_CONFLICT', {
      filePath,
      lockedBy,
    })
  }
}

export class AnchorNotFoundError extends PatchEngineError {
  constructor(anchor: string, filePath: string) {
    super(`Anchor "${anchor}" not found in file "${filePath}"`, 'ANCHOR_NOT_FOUND', {
      anchor,
      filePath,
    })
  }
}

export class NonUniqueBlockError extends PatchEngineError {
  constructor(start: string, end: string, filePath: string, count: number) {
    super(
      `Block [${start}…${end}] matched ${count} occurrences in "${filePath}"`,
      'NON_UNIQUE_BLOCK',
      { start, end, filePath, count },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-level patch application (pure, no DB)
// ─────────────────────────────────────────────────────────────────────────────

function applyCreate(existing: string | null, op: CreateOperation): string {
  if (existing !== null) {
    throw new PatchEngineError(
      `Cannot CREATE "${op.file_path}" — file already exists`,
      'FILE_EXISTS',
      { file_path: op.file_path },
    )
  }
  return op.content
}

function applyInsertAfter(content: string, op: InsertAfterOperation): string {
  const lines = content.split('\n')
  let lastMatchIdx = -1

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const matches = op.exact_line_match
      ? line.trim() === op.anchor.trim()
      : line.includes(op.anchor)
    if (matches) {
      lastMatchIdx = i
      break
    }
  }

  if (lastMatchIdx === -1) {
    throw new AnchorNotFoundError(op.anchor, op.file_path)
  }

  const insertLines = op.content.split('\n')
  lines.splice(lastMatchIdx + 1, 0, ...insertLines)
  return lines.join('\n')
}

function applyReplaceBlock(content: string, op: ReplaceBlockOperation): string {
  const lines = content.split('\n')
  const requireUnique = op.require_unique !== false
  const matches: Array<{ start: number; end: number }> = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(op.start_anchor)) {
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes(op.end_anchor)) {
          matches.push({ start: i, end: j })
          break
        }
      }
    }
  }

  if (matches.length === 0) {
    throw new AnchorNotFoundError(`${op.start_anchor}…${op.end_anchor}`, op.file_path)
  }
  if (requireUnique && matches.length > 1) {
    throw new NonUniqueBlockError(op.start_anchor, op.end_anchor, op.file_path, matches.length)
  }

  const { start, end } = matches[0]
  const replacementLines = op.replacement.split('\n')
  lines.splice(start, end - start + 1, ...replacementLines)
  return lines.join('\n')
}

function applyAppend(content: string, op: AppendOperation): string {
  const ensureNewline = op.ensure_newline !== false
  let base = content
  if (ensureNewline && base.length > 0 && !base.endsWith('\n')) {
    base += '\n'
  }
  return base + op.content
}

function applyDeleteBlock(content: string, op: DeleteBlockOperation): string {
  const lines = content.split('\n')
  const inclusive = op.inclusive !== false

  let startIdx = -1
  let endIdx = -1

  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && lines[i].includes(op.start_anchor)) startIdx = i
    if (startIdx !== -1 && lines[i].includes(op.end_anchor)) {
      endIdx = i
      break
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    throw new AnchorNotFoundError(`${op.start_anchor}…${op.end_anchor}`, op.file_path)
  }

  const deleteStart = inclusive ? startIdx : startIdx + 1
  const deleteCount = inclusive ? endIdx - startIdx + 1 : endIdx - startIdx - 1
  lines.splice(deleteStart, deleteCount)
  return lines.join('\n')
}

export function applyPatchToContent(
  currentContent: string | null,
  op: PatchOperation,
): string {
  switch (op.type) {
    case 'create':
      return applyCreate(currentContent, op)
    case 'insert_after':
      if (currentContent === null)
        throw new PatchEngineError(`File "${op.file_path}" does not exist`, 'FILE_NOT_FOUND')
      return applyInsertAfter(currentContent, op)
    case 'replace_block':
      if (currentContent === null)
        throw new PatchEngineError(`File "${op.file_path}" does not exist`, 'FILE_NOT_FOUND')
      return applyReplaceBlock(currentContent, op)
    case 'append':
      return applyAppend(currentContent ?? '', op)
    case 'delete_block':
      if (currentContent === null)
        throw new PatchEngineError(`File "${op.file_path}" does not exist`, 'FILE_NOT_FOUND')
      return applyDeleteBlock(currentContent, op)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PatchEngine — DB-backed atomic file write service
// ─────────────────────────────────────────────────────────────────────────────

const LOCK_TTL_MS = 30_000 // 30 seconds

export class PatchEngine {
  private supabase: SupabaseClient

  constructor(supabaseUrl: string, serviceKey: string) {
    this.supabase = createClient(supabaseUrl, serviceKey)
  }

  // ── Lock management ──────────────────────────────────────────────────────

  async acquireLock(
    projectId: string,
    filePath: string,
    taskId: string,
  ): Promise<LockResult> {
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString()

    // Upsert lock — fails if a non-expired lock exists for a different task
    const { data: existing } = await this.supabase
      .from('file_locks')
      .select('task_id, acquired_at, expires_at')
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .gt('expires_at', new Date().toISOString())
      .neq('task_id', taskId)
      .maybeSingle()

    if (existing) {
      return {
        success: false,
        conflict: {
          locked_by: existing.task_id,
          acquired_at: existing.acquired_at,
          expires_at: existing.expires_at,
        },
      }
    }

    await this.supabase.from('file_locks').upsert({
      project_id: projectId,
      file_path: filePath,
      task_id: taskId,
      acquired_at: new Date().toISOString(),
      expires_at: expiresAt,
    })

    return { success: true }
  }

  async releaseLock(projectId: string, filePath: string, taskId: string): Promise<void> {
    await this.supabase
      .from('file_locks')
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .eq('task_id', taskId)
  }

  // ── Core apply ───────────────────────────────────────────────────────────

  async applyOperations(
    projectId: string,
    taskId: string,
    operations: PatchOperation[],
  ): Promise<PatchResult> {
    const filesModified: string[] = []
    const snapshots: Map<string, string | null> = new Map()
    const locks: string[] = []

    try {
      // 1. Acquire locks for all affected files
      const filePaths = [...new Set(operations.map((op) => op.file_path))]

      for (const filePath of filePaths) {
        const lockResult = await this.acquireLock(projectId, filePath, taskId)
        if (!lockResult.success) {
          throw new LockConflictError(filePath, lockResult.conflict!.locked_by)
        }
        locks.push(filePath)
      }

      // 2. Load current content + snapshot
      for (const filePath of filePaths) {
        const { data } = await this.supabase
          .from('project_files')
          .select('content')
          .eq('project_id', projectId)
          .eq('file_path', filePath)
          .maybeSingle()
        snapshots.set(filePath, data?.content ?? null)
      }

      // 3. Apply operations in order (in-memory)
      const workingSet = new Map(snapshots)

      for (const op of operations) {
        const current = workingSet.get(op.file_path) ?? null
        const updated = applyPatchToContent(current, op)
        workingSet.set(op.file_path, updated)
      }

      // 4. Persist all modified files atomically
      for (const [filePath, newContent] of workingSet.entries()) {
        if (newContent === snapshots.get(filePath)) continue

        const contentHash = createHash('sha256').update(newContent ?? '').digest('hex')
        const previousContent = snapshots.get(filePath) ?? null

        await this.supabase.from('project_files').upsert({
          project_id: projectId,
          file_path: filePath,
          content: newContent,
          content_hash: contentHash,
          previous_content: previousContent,
          updated_at: new Date().toISOString(),
          updated_by_task: taskId,
        })

        filesModified.push(filePath)
      }

      return {
        success: true,
        applied_operations: operations.length,
        files_modified: filesModified,
      }
    } catch (err) {
      // Rollback: restore snapshots for any already-written files
      let rollbackPerformed = false
      if (filesModified.length > 0) {
        for (const filePath of filesModified) {
          const snap = snapshots.get(filePath)
          if (snap !== undefined) {
            await this.supabase
              .from('project_files')
              .update({ content: snap, updated_at: new Date().toISOString() })
              .eq('project_id', projectId)
              .eq('file_path', filePath)
          }
        }
        rollbackPerformed = true
      }

      return {
        success: false,
        applied_operations: 0,
        files_modified: [],
        error: err instanceof Error ? err.message : String(err),
        rollback_performed: rollbackPerformed,
      }
    } finally {
      // Always release locks
      for (const filePath of locks) {
        await this.releaseLock(projectId, filePath, taskId)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

let _engine: PatchEngine | null = null

export function getPatchEngine(): PatchEngine {
  if (!_engine) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing Supabase env vars for PatchEngine')
    _engine = new PatchEngine(url, key)
  }
  return _engine
}
