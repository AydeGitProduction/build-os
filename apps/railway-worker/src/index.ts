/**
 * index.ts — WS-B: Railway worker entry point
 *
 * Polls job_queue every POLL_INTERVAL_MS for 'queued' jobs.
 * Processes one job at a time (concurrency=1 for shadow mode safety).
 * Handles SIGTERM gracefully.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { processJob } from './processor'
import { Heartbeat } from './heartbeat'
import type { JobQueueRow } from './types'

const SUPABASE_URL    = process.env.SUPABASE_URL!
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10)
const WORKER_ID       = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[worker] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[worker] FATAL: ANTHROPIC_API_KEY required')
  process.exit(1)
}
if (!process.env.BUILDOS_INTERNAL_SECRET) {
  console.error('[worker] FATAL: BUILDOS_INTERNAL_SECRET required')
  process.exit(1)
}

console.log(`[worker] Starting worker_id=${WORKER_ID}`)
console.log(`[worker] Supabase URL: ${SUPABASE_URL}`)
console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms`)

const heartbeat = new Heartbeat(WORKER_ID)
let running = true
let activeJob = false

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] Received ${signal} — initiating graceful shutdown`)
  running = false
  heartbeat.stop()

  // Wait up to 30s for active job to complete
  if (activeJob) {
    console.log('[worker] Waiting for active job to complete (max 30s)...')
    const deadline = Date.now() + 30_000
    while (activeJob && Date.now() < deadline) {
      await sleep(500)
    }
    if (activeJob) {
      console.log('[worker] Active job did not complete in time — forcing exit')
    }
  }

  console.log('[worker] Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function pollAndProcess(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Claim one queued job atomically
  const { data: jobs, error } = await admin
    .from('job_queue')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    console.error('[worker] Poll error:', error.message)
    return
  }

  if (!jobs || jobs.length === 0) return

  const job = jobs[0] as JobQueueRow
  console.log(`[worker] Claimed job ${job.id} task=${job.task_id}`)

  activeJob = true
  try {
    await processJob(job.id, job.payload, WORKER_ID)
    heartbeat.incrementJobs()
  } finally {
    activeJob = false
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  heartbeat.start()

  console.log('[worker] Poll loop started')

  while (running) {
    try {
      await pollAndProcess()
    } catch (err) {
      console.error('[worker] Unhandled poll error:', err)
    }
    await sleep(POLL_INTERVAL)
  }
}

main().catch(err => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
