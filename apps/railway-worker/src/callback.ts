/**
 * callback.ts — WS-E: Signed callback POST to /api/agent/output
 *
 * Signs payload with HMAC-SHA256 (BUILDOS_INTERNAL_SECRET) and POSTs.
 * Retries 3 times with exponential backoff.
 * On final failure: writes to dead_letter_queue.
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { CallbackPayload } from './types'

const SUPABASE_URL      = process.env.SUPABASE_URL!
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_SECRET   = process.env.BUILDOS_INTERNAL_SECRET!

function signPayload(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function signAndPost(
  callbackUrl: string,
  payload: CallbackPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(payload)
  const signature = signPayload(body, INTERNAL_SECRET)

  let lastError: string = ''
  let lastStatus: number = 0

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Buildos-Secret': INTERNAL_SECRET,
          'X-Buildos-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      })

      lastStatus = res.status

      if (res.ok) {
        return { ok: true, status: res.status }
      }

      const text = await res.text().catch(() => '')
      lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`
      console.error(`[callback] attempt ${attempt + 1} failed: ${lastError}`)

    } catch (err) {
      lastError = String(err)
      console.error(`[callback] attempt ${attempt + 1} error: ${lastError}`)
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < 2) {
      await sleep(1000 * Math.pow(2, attempt))
    }
  }

  // All 3 attempts failed — write to DLQ (fire-and-forget, never throws)
  writeToDLQ(callbackUrl, payload, lastError).catch(() => {})

  return { ok: false, status: lastStatus, error: lastError }
}

async function writeToDLQ(
  callbackUrl: string,
  payload: CallbackPayload,
  failureReason: string
): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_KEY)
    await admin.from('dead_letter_queue').insert({
      correlation_id: payload.correlation_id,
      task_id: payload.task_id,
      payload: { callback_url: callbackUrl, ...payload },
      failure_reason: failureReason,
    })
    console.log(`[callback] DLQ entry created for correlation_id=${payload.correlation_id}`)
  } catch (err) {
    console.error('[callback] DLQ write failed:', err)
  }
}
