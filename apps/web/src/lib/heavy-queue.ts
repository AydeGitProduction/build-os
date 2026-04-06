/**
 * heavy-queue.ts
 * DB-backed job queue for heavy async task dispatch.
 * Uses table: heavy_dispatch_queue (created by MIGRATE-P7-9b.sql)
 *
 * All operations use the Supabase service_role client for server-side use.
 * All writes are idempotent via idempotency_key.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'dead'

export interface HeavyJob {
  id: string
  task_id: string
  task_run_id: string
  payload: Record<string, unknown>
  status: JobStatus
  attempt_count: number
  max_attempts: number
  scheduled_at: string
  locked_at: string | null
  locked_by: string | null
  completed_at: string | null
  failed_at: string | null
  last_error: string | null
  idempotency_key: string
  created_at: string
}

export interface EnqueueOptions {
  task_id: string
  task_run_id: string
  payload: Record<string, unknown>
  idempotency_key: string
  max_attempts?: number
  scheduled_at?: Date
}

export interface ClaimResult {
  job: HeavyJob | null
  claimed: boolean
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/**
 * Enqueue a job into heavy_dispatch_queue.
 * Idempotent: subsequent calls with the same idempotency_key are no-ops.
 *
 * @returns the job record (either newly created or the existing one)
 */
export async function enqueueHeavyJob(
  supabase: SupabaseClient,
  options: EnqueueOptions
): Promise<HeavyJob> {
  const {
    task_id,
    task_run_id,
    payload,
    idempotency_key,
    max_attempts = 3,
    scheduled_at,
  } = options

  const { data, error } = await supabase
    .from('heavy_dispatch_queue')
    .upsert(
      {
        task_id,
        task_run_id,
        payload,
        idempotency_key,
        max_attempts,
        status: 'queued',
        ...(scheduled_at ? { scheduled_at: scheduled_at.toISOString() } : {}),
      },
      {
        onConflict: 'idempotency_key',
        ignoreDuplicates: true,
      }
    )
    .select()
    .single()

  if (error) {
    // If ignoreDuplicates swallowed the row, fetch the existing one
    if (error.code === 'PGRST116') {
      const { data: existing, error: fetchError } = await supabase
        .from('heavy_dispatch_queue')
        .select('*')
        .eq('idempotency_key', idempotency_key)
        .single()
      if (fetchError) throw fetchError
      return existing as HeavyJob
    }
    throw error
  }

  return data as HeavyJob
}

// ---------------------------------------------------------------------------
// Claim (worker polls)
// ---------------------------------------------------------------------------

/**
 * Claim the next available queued job.
 * Uses optimistic locking: UPDATE ... WHERE status = 'queued' AND scheduled_at <= now()
 * Returns null if no jobs are available.
 *
 * @param workerId - unique identifier for this worker instance
 */
export async function claimNextJob(
  supabase: SupabaseClient,
  workerId: string
): Promise<ClaimResult> {
  // Fetch next available job
  const { data: candidates, error: fetchError } = await supabase
    .from('heavy_dispatch_queue')
    .select('id, attempt_count, max_attempts')
    .eq('status', 'queued')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)

  if (fetchError) throw fetchError
  if (!candidates || candidates.length === 0) return { job: null, claimed: false }

  const candidate = candidates[0]

  // Atomic claim
  const { data, error } = await supabase
    .from('heavy_dispatch_queue')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: workerId,
      attempt_count: candidate.attempt_count + 1,
    })
    .eq('id', candidate.id)
    .eq('status', 'queued') // guard: only claim if still queued
    .select()
    .single()

  if (error) {
    // Another worker claimed it first — return not claimed
    if (error.code === 'PGRST116') return { job: null, claimed: false }
    throw error
  }

  return { job: data as HeavyJob, claimed: true }
}

// ---------------------------------------------------------------------------
// Acknowledge (worker completes)
// ---------------------------------------------------------------------------

/**
 * Mark a job as completed after successful processing.
 */
export async function acknowledgeJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from('heavy_dispatch_queue')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', jobId)
    .eq('status', 'processing')

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Fail (worker reports error)
// ---------------------------------------------------------------------------

/**
 * Mark a job as failed. If attempt_count >= max_attempts, escalates to 'dead'.
 */
export async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
  retryDelay?: number // seconds before next attempt
): Promise<void> {
  // Fetch current attempt info
  const { data: job, error: fetchError } = await supabase
    .from('heavy_dispatch_queue')
    .select('attempt_count, max_attempts')
    .eq('id', jobId)
    .single()

  if (fetchError) throw fetchError

  const isDead = (job.attempt_count ?? 0) >= (job.max_attempts ?? 3)
  const nextStatus: JobStatus = isDead ? 'dead' : 'failed'

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    last_error: errorMessage,
    failed_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
  }

  // If retrying, reset to 'queued' with a future scheduled_at
  if (!isDead && retryDelay) {
    const retryAt = new Date(Date.now() + retryDelay * 1000)
    updatePayload.status = 'queued'
    updatePayload.scheduled_at = retryAt.toISOString()
  }

  const { error } = await supabase
    .from('heavy_dispatch_queue')
    .update(updatePayload)
    .eq('id', jobId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Stale lock detection
// ---------------------------------------------------------------------------

/**
 * Find and reset jobs that have been locked (processing) for longer than
 * the given threshold (default: 5 minutes). Resets them to 'queued' for retry,
 * or 'dead' if max_attempts exceeded.
 *
 * @returns number of stale jobs reset
 */
export async function resetStaleLocks(
  supabase: SupabaseClient,
  thresholdMinutes = 5
): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString()

  const { data: stale, error: fetchError } = await supabase
    .from('heavy_dispatch_queue')
    .select('id, attempt_count, max_attempts')
    .eq('status', 'processing')
    .lt('locked_at', cutoff)

  if (fetchError) throw fetchError
  if (!stale || stale.length === 0) return 0

  let resetCount = 0
  for (const job of stale) {
    const isDead = (job.attempt_count ?? 0) >= (job.max_attempts ?? 3)
    const { error } = await supabase
      .from('heavy_dispatch_queue')
      .update({
        status: isDead ? 'dead' : 'queued',
        locked_at: null,
        locked_by: null,
        last_error: `Stale lock reset after ${thresholdMinutes}m threshold`,
      })
      .eq('id', job.id)
      .eq('status', 'processing')

    if (!error) resetCount++
  }

  return resetCount
}

// ---------------------------------------------------------------------------
// Queue depth
// ---------------------------------------------------------------------------

/**
 * Returns counts of jobs by status for monitoring.
 */
export async function getQueueDepth(
  supabase: SupabaseClient
): Promise<Record<JobStatus | string, number>> {
  const { data, error } = await supabase
    .from('heavy_dispatch_queue')
    .select('status')

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}
