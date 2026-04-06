/**
 * heavy-queue-contract.test.ts
 * WS7-A: Contract test suite for heavy_dispatch_queue library.
 * 8 tests covering: enqueue, idempotency, claim, ack, fail, backoff, heartbeat, stale detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  enqueueHeavyJob,
  claimNextJob,
  acknowledgeJob,
  failJob,
  emitHeartbeat,
  resetStaleLocks,
  getQueueDepth,
} from '@/lib/heavy-queue'

// Use Supabase test client (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in test env)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_TASK_ID = '00000000-0000-0000-0000-000000000001' // Mock task ID for tests
const TEST_RUN_ID  = '00000000-0000-0000-0000-000000000002'
const IKEY_BASE    = `test-contract-${Date.now()}`

async function cleanup(idempotencyKey: string) {
  await supabase.from('heavy_dispatch_queue').delete().eq('idempotency_key', idempotencyKey)
}

describe('heavy-queue contract tests', () => {

  it('1. enqueue inserts a new job with status=queued', async () => {
    const ikey = `${IKEY_BASE}-1`
    await cleanup(ikey)

    const { job, was_duplicate } = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID,
      task_run_id: TEST_RUN_ID,
      payload: { test: true },
      idempotency_key: ikey,
    })

    expect(job.status).toBe('queued')
    expect(job.attempt_count).toBe(0)
    expect(was_duplicate).toBe(false)
    await cleanup(ikey)
  })

  it('2. duplicate enqueue returns existing job (idempotency)', async () => {
    const ikey = `${IKEY_BASE}-2`
    await cleanup(ikey)

    const first = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: { seq: 1 }, idempotency_key: ikey,
    })
    const second = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: { seq: 2 }, idempotency_key: ikey,
    })

    expect(second.was_duplicate).toBe(true)
    expect(second.job.id).toBe(first.job.id)
    expect(second.job.payload).toEqual({ seq: 1 }) // original payload preserved
    await cleanup(ikey)
  })

  it('3. claimNextJob transitions job to processing', async () => {
    const ikey = `${IKEY_BASE}-3`
    await cleanup(ikey)

    await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey,
    })
    const { job, claimed } = await claimNextJob(supabase, 'test-worker-1')

    expect(claimed).toBe(true)
    expect(job).not.toBeNull()
    expect(job!.status).toBe('processing')
    expect(job!.locked_by).toBe('test-worker-1')
    expect(job!.attempt_count).toBe(1)
    await cleanup(ikey)
  })

  it('4. acknowledgeJob marks job as completed', async () => {
    const ikey = `${IKEY_BASE}-4`
    await cleanup(ikey)

    const { job: enqueued } = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey,
    })
    const { job } = await claimNextJob(supabase, 'test-worker-ack')
    await acknowledgeJob(supabase, job!.id)

    const { data } = await supabase.from('heavy_dispatch_queue').select('status, completed_at').eq('id', enqueued.id).single()
    expect(data!.status).toBe('completed')
    expect(data!.completed_at).not.toBeNull()
    await cleanup(ikey)
  })

  it('5. failJob re-queues with backoff when attempts remain', async () => {
    const ikey = `${IKEY_BASE}-5`
    await cleanup(ikey)

    await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey, max_attempts: 3,
    })
    const { job } = await claimNextJob(supabase, 'test-worker-fail')
    await failJob(supabase, job!.id, 'test error')

    const { data } = await supabase.from('heavy_dispatch_queue').select('status, last_error, scheduled_at').eq('id', job!.id).single()
    expect(data!.status).toBe('queued') // re-queued, not failed
    expect(data!.last_error).toBe('test error')
    expect(new Date(data!.scheduled_at) > new Date()).toBe(true) // future scheduled_at
    await cleanup(ikey)
  })

  it('6. failJob escalates to dead when max_attempts reached', async () => {
    const ikey = `${IKEY_BASE}-6`
    await cleanup(ikey)

    const { job: enqueued } = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey, max_attempts: 1,
    })

    // Manually set attempt_count = max_attempts to simulate exhausted retries
    await supabase.from('heavy_dispatch_queue').update({ attempt_count: 1, status: 'processing', locked_by: 'w', locked_at: new Date().toISOString() }).eq('id', enqueued.id)
    await failJob(supabase, enqueued.id, 'fatal error')

    const { data } = await supabase.from('heavy_dispatch_queue').select('status').eq('id', enqueued.id).single()
    expect(data!.status).toBe('dead')
    await cleanup(ikey)
  })

  it('7. emitHeartbeat updates last_heartbeat timestamp', async () => {
    const ikey = `${IKEY_BASE}-7`
    await cleanup(ikey)

    const { job: enqueued } = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey,
    })
    const { job } = await claimNextJob(supabase, 'test-worker-hb')
    const before = new Date()
    await emitHeartbeat(supabase, job!.id, TEST_RUN_ID)

    const { data } = await supabase.from('heavy_dispatch_queue').select('last_heartbeat').eq('id', enqueued.id).single()
    expect(data!.last_heartbeat).not.toBeNull()
    expect(new Date(data!.last_heartbeat!) >= before).toBe(true)
    await cleanup(ikey)
  })

  it('8. resetStaleLocks detects and resets stuck processing job', async () => {
    const ikey = `${IKEY_BASE}-8`
    await cleanup(ikey)

    const { job: enqueued } = await enqueueHeavyJob(supabase, {
      task_id: TEST_TASK_ID, task_run_id: TEST_RUN_ID,
      payload: {}, idempotency_key: ikey,
    })

    // Simulate a stale lock: set locked_at to 10 minutes ago
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await supabase.from('heavy_dispatch_queue').update({ status: 'processing', locked_at: staleTime, locked_by: 'dead-worker', attempt_count: 1 }).eq('id', enqueued.id)

    const released = await resetStaleLocks(supabase, 5)
    expect(released).toBeGreaterThanOrEqual(1)

    const { data } = await supabase.from('heavy_dispatch_queue').select('status, locked_by').eq('id', enqueued.id).single()
    expect(data!.status).toBe('queued')
    expect(data!.locked_by).toBeNull()
    await cleanup(ikey)
  })

})
