/**
 * heavy-queue.ts (v2 — WS3-A, WS4-A, WS5-C additions)
 * DB-backed job queue for heavy async task dispatch.
 * Table: heavy_dispatch_queue (created by MIGRATE-P7-9b.sql)
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
  last_heartbeat: string | null
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
// Enqueue (WS3-A: Idempotent with ON CONFLICT DO NOTHING)
// ---------------------------------------------------------------------------

/**
 * Enqueue a job into heavy_dispatch_queue.
 * WS3-A: ON CONFLICT (idempotency_key) DO NOTHING — returns existing row on duplicate.
 */
export async function enqueueHeavyJob(
  supabase: SupabaseClient,
  options: EnqueueOptions
): Promise<{ job: HeavyJob; was_duplicate: boolean }> {
  const { task_id, task_run_id, payload, idempotency_key, max_attempts = 3, scheduled_at } = options

  // Attempt INSERT — idempotent via ON CONFLICT DO NOTHING
  const { data: inserted, error: insertError } = await supabase
    .from('heavy_dispatch_queue')
    .insert({
      task_id,
      task_run_id,
      payload,
      idempotency_key,
      max_attempts,
      status: 'queued',
      ...(scheduled_at ? { scheduled_at: scheduled_at.toISOString() } : {}),
    })
    .select()

  // If insert returned a row, it's a new job
  if (!insertError && inserted && inserted.length > 0) {
    return { job: inserted[0] as HeavyJob, was_duplicate: false }
  }

  // Duplicate key (conflict) — fetch the existing job
  if (insertError?.code === '23505' || (inserted && inserted.length === 0)) {
    const { data: existing, error: fetchError } = await supabase
      .from('heavy_dispatch_queue')
      .select('*')
      .eq('idempotency_key', idempotency_key)
      .single()
    if (fetchError) throw fetchError
    return { job: existing as HeavyJob, was_duplicate: true }
  }

  if (insertError) throw insertError
  throw new Error('enqueueHeavyJob: unexpected empty insert result')
}

// ---------------------------------------------------------------------------
// Claim (worker polls)
// ---------------------------------------------------------------------------

/**
 * Claim the next available queued job.
 * Atomic optimistic lock: UPDATE WHERE status='queued' AND scheduled_at<=now()
 */
export async function claimNextJob(
  supabase: SupabaseClient,
  workerId: string
): Promise<ClaimResult> {
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

  if (error) {
    if (error.code === 'PGRST116') return { job: null, claimed: false }
    throw error
  }

  if (!data || data.length === 0) return { job: null, claimed: false }
  return { job: data[0] as HeavyJob, claimed: true }
}

// ---------------------------------------------------------------------------
// Acknowledge
// ---------------------------------------------------------------------------

export async function acknowledgeJob(supabase: SupabaseClient, jobId: string): Promise<void> {
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
// Fail with exponential backoff (WS4-A)
// ---------------------------------------------------------------------------

/**
 * Mark a job as failed with exponential backoff retry scheduling.
 * WS4-A: delay = 2^attempt_count * 30s (30s, 60s, 120s...)
 * Escalates to 'dead' when attempt_count >= max_attempts.
 */
export async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
  retryDelaySecs?: number
): Promise<void> {
  const { data: job, error: fetchError } = await supabase
    .from('heavy_dispatch_queue')
    .select('attempt_count, max_attempts')
    .eq('id', jobId)
    .single()
  if (fetchError) throw fetchError

  const attemptCount = job.attempt_count ?? 0
  const maxAttempts = job.max_attempts ?? 3
  const isDead = attemptCount >= maxAttempts

  // WS4-A: exponential backoff — 2^attempt_count * 30s
  const backoffSecs = retryDelaySecs ?? Math.pow(2, Math.max(0, attemptCount - 1)) * 30

  const updatePayload: Record<string, unknown> = {
    last_error: errorMessage,
    locked_at: null,
    locked_by: null,
  }

  if (isDead) {
    updatePayload.status = 'dead'
    updatePayload.failed_at = new Date().toISOString()
  } else {
    // Re-queue with backoff delay
    updatePayload.status = 'queued'
    updatePayload.scheduled_at = new Date(Date.now() + backoffSecs * 1000).toISOString()
  }

  const { error } = await supabase.from('heavy_dispatch_queue').update(updatePayload).eq('id', jobId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Heartbeat emitter (WS5-C: stuck-run detection)
// ---------------------------------------------------------------------------

/**
 * Update last_heartbeat for an active job. Called periodically by the worker.
 */
export async function emitHeartbeat(supabase: SupabaseClient, jobId: string, taskRunId: string): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('heavy_dispatch_queue').update({ last_heartbeat: now }).eq('id', jobId),
    supabase.from('task_runs').update({ last_heartbeat: now }).eq('id', taskRunId),
  ])
}

// ---------------------------------------------------------------------------
// Stale lock detection with heartbeat (WS5-C)
// ---------------------------------------------------------------------------

/**
 * Reset stale locks. WS5-C: also considers heartbeat — if last_heartbeat is
 * older than thresholdMinutes, the worker is stuck regardless of locked_at age.
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
    .or(`locked_at.lt.${cutoff},last_heartbeat.lt.${cutoff}`)

  if (fetchError) throw fetchError
  if (!stale || stale.length === 0) return 0

  let count = 0
  for (const job of stale) {
    const isDead = (job.attempt_count ?? 0) >= (job.max_attempts ?? 3)
    const { error } = await supabase
      .from('heavy_dispatch_queue')
      .update({
        status: isDead ? 'dead' : 'queued',
        locked_at: null,
        locked_by: null,
        last_error: `Stuck run reset (heartbeat/lock age > ${thresholdMinutes}m)`,
      })
      .eq('id', job.id)
      .eq('status', 'processing')
    if (!error) count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Queue depth monitoring
// ---------------------------------------------------------------------------

export async function getQueueDepth(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('heavy_dispatch_queue').select('status')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}
