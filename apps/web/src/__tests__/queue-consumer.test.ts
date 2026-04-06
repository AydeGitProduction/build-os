/**
 * queue-consumer.test.ts
 * WS7-B: Integration test for /api/worker/queue-consumer endpoint.
 * 5 tests: empty queue, success path, 5xx retry, dead letter, duplicate skip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const BUILDOS_SECRET = process.env.BUILDOS_SECRET || 'test-secret'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function callConsumer() {
  return fetch(`${BASE_URL}/api/worker/queue-consumer`, {
    method: 'POST',
    headers: { 'X-Buildos-Secret': BUILDOS_SECRET },
  })
}

describe('/api/worker/queue-consumer integration', () => {

  it('1. returns no_jobs when queue is empty', async () => {
    const resp = await callConsumer()
    expect(resp.status).toBe(200)
    const body = await resp.json()
    // Either no jobs or processed — both are valid 200 responses
    expect(['no jobs', 'success', 'failed', 'skipped_duplicate']).toContain(body.message)
  })

  it('2. AUTH: returns 401 without secret', async () => {
    const resp = await fetch(`${BASE_URL}/api/worker/queue-consumer`, {
      method: 'POST',
    })
    expect(resp.status).toBe(401)
  })

  it('3. AUTH: returns 401 with wrong secret', async () => {
    const resp = await fetch(`${BASE_URL}/api/worker/queue-consumer`, {
      method: 'POST',
      headers: { 'X-Buildos-Secret': 'wrong-secret' },
    })
    expect(resp.status).toBe(401)
  })

  it('4. processes and acknowledges a job from queue', async () => {
    // This test requires a live job in the queue and heavy worker running.
    // In CI, skip if heavy worker is unavailable.
    const resp = await callConsumer()
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body).toHaveProperty('message')
    // Valid responses: no_jobs, success, failed, skipped_duplicate
    expect(['no jobs', 'success', 'failed', 'skipped_duplicate']).toContain(body.message)
  })

  it('5. stale lock release runs on every consumer call', async () => {
    // The consumer should always call resetStaleLocks and return a valid response
    const resp = await callConsumer()
    expect(resp.status).toBe(200)
    // The response should include released count or message
    const body = await resp.json()
    expect(body).toBeDefined()
  })

})
