/**
 * heartbeat.ts — WS-B/WS-F: Worker liveness signal
 *
 * UPSERTs worker_heartbeats every 30s so /api/monitoring/railway
 * can report workers_alive (last_seen < 2 min ago).
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERVAL_MS  = 30_000

export class Heartbeat {
  private workerId: string
  private jobsProcessed: number = 0
  private timer: NodeJS.Timeout | null = null

  constructor(workerId: string) {
    this.workerId = workerId
  }

  start(): void {
    // Fire immediately, then on interval
    this.beat().catch(err => console.error('[heartbeat] initial beat failed:', err))
    this.timer = setInterval(() => {
      this.beat().catch(err => console.error('[heartbeat] beat failed:', err))
    }, INTERVAL_MS)
    console.log(`[heartbeat] started for worker=${this.workerId}`)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[heartbeat] stopped')
  }

  incrementJobs(): void {
    this.jobsProcessed++
  }

  private async beat(): Promise<void> {
    const admin = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error } = await admin
      .from('worker_heartbeats')
      .upsert(
        {
          worker_id:      this.workerId,
          last_seen:      new Date().toISOString(),
          jobs_processed: this.jobsProcessed,
        },
        { onConflict: 'worker_id' }
      )
    if (error) throw new Error(error.message)
  }
}
