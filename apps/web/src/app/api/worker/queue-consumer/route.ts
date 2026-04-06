/**
 * POST /api/worker/queue-consumer
 * WS1-D: Queue consumer endpoint — polls heavy_dispatch_queue and dispatches jobs.
 *
 * Flow:
 *   1. releaseStaleJobs() — reset stuck processing jobs
 *   2. claimNextJob(workerId) — atomic claim with FOR UPDATE SKIP LOCKED
 *   3. If no job: return 200 {message: "no jobs"}
 *   4. POST /api/worker/heavy with job payload
 *   5. acknowledgeJob() on success, failJob() on error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  claimNextJob,
  acknowledgeJob,
  failJob,
  resetStaleLocks,
} from '@/lib/heavy-queue'
import { randomUUID } from 'crypto'

export const maxDuration = 60

const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''

export async function POST(request: NextRequest) {
  // Auth: internal secret only
  const secret = request.headers.get('X-Buildos-Secret')
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const workerId = `consumer-${randomUUID().slice(0, 8)}`

  try {
    // 1. Release stale locks (jobs processing for >5 min)
    const released = await resetStaleLocks(supabase, 5)
    if (released > 0) {
      console.log(`[queue-consumer] Released ${released} stale locks`)
    }

    // 2. Claim next available job
    const { job, claimed } = await claimNextJob(supabase, workerId)

    if (!claimed || !job) {
      return NextResponse.json({ message: 'no jobs', released })
    }

    console.log(`[queue-consumer] Claimed job ${job.id} (task_id=${job.task_id}, attempt=${job.attempt_count})`)

    // 3. WS3-B: Dedup check — skip if task already completed/failed
    const { data: taskRun } = await supabase
      .from('task_runs')
      .select('status')
      .eq('id', job.task_run_id)
      .single()

    if (taskRun && ['completed', 'failed'].includes(taskRun.status)) {
      await acknowledgeJob(supabase, job.id)
      console.log(`[queue-consumer] Skipped job ${job.id} — task_run already ${taskRun.status}`)
      return NextResponse.json({ message: 'skipped_duplicate', job_id: job.id })
    }

    // 4. Update timing: execution_started_at
    await supabase
      .from('task_runs')
      .update({ execution_started_at: new Date().toISOString() })
      .eq('id', job.task_run_id)

    // 5. Dispatch to heavy worker
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const heavyWorkerUrl = process.env.HEAVY_WORKER_URL || `${appUrl}/api/worker/heavy`

    const workerResp = await fetch(heavyWorkerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Buildos-Secret': BUILDOS_SECRET,
      },
      body: JSON.stringify({
        ...job.payload,
        job_id: job.id,
        worker_id: workerId,
        attempt_count: job.attempt_count,
      }),
    })

    if (workerResp.ok) {
      await acknowledgeJob(supabase, job.id)
      console.log(`[queue-consumer] Job ${job.id} completed successfully`)
      return NextResponse.json({ message: 'success', job_id: job.id, worker_id: workerId })
    } else {
      const errorText = await workerResp.text()
      const errorMsg = `Heavy worker returned ${workerResp.status}: ${errorText.slice(0, 200)}`

      // WS4-B: Calculate exponential backoff delay
      const delay = Math.pow(2, job.attempt_count) * 30 // 30s, 60s, 120s
      await failJob(supabase, job.id, errorMsg, delay)

      // If dead (max attempts reached), mark task as failed
      if (job.attempt_count >= job.max_attempts) {
        await supabase
          .from('tasks')
          .update({ status: 'failed', failure_detail: `Queue dead letter: ${errorMsg}` })
          .eq('id', job.task_id)
      }

      console.error(`[queue-consumer] Job ${job.id} failed (attempt ${job.attempt_count}/${job.max_attempts})`)
      return NextResponse.json({ message: 'failed', job_id: job.id, error: errorMsg }, { status: 200 })
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[queue-consumer] Unhandled error: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
