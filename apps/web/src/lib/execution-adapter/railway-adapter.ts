/**
 * railway-adapter.ts — WS-A: Writes to job_queue for Railway worker to pick up
 *
 * Railway worker polls job_queue and processes jobs independently.
 * No HTTP call to Railway — DB is the contract boundary.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import type { IExecutionAdapter, JobPayload, DispatchResult, JobStatus } from './types'

export class RailwayAdapter implements IExecutionAdapter {
  private getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  async dispatch(job: JobPayload): Promise<DispatchResult> {
    const admin = this.getAdmin()
    const correlationId = randomUUID()

    // Idempotency: check for existing active job for this task
    const { data: existing } = await admin
      .from('job_queue')
      .select('correlation_id')
      .eq('task_id', job.task_id)
      .in('status', ['queued', 'processing'])
      .limit(1)
      .single()

    if (existing) {
      console.log(`[RailwayAdapter] Duplicate dispatch suppressed for task=${job.task_id}, returning existing correlationId=${existing.correlation_id}`)
      return { correlation_id: existing.correlation_id, execution_target: 'railway' }
    }

    const { error } = await admin.from('job_queue').insert({
      correlation_id: correlationId,
      task_id: job.task_id,
      feature_id: job.feature_id,
      project_id: job.project_id,
      status: 'queued',
      payload: job,
    })

    if (error) {
      throw new Error(`[RailwayAdapter] Failed to insert job_queue: ${error.message}`)
    }

    console.log(`[RailwayAdapter] Queued job correlation_id=${correlationId} task=${job.task_id}`)
    return { correlation_id: correlationId, execution_target: 'railway' }
  }

  async getStatus(correlationId: string): Promise<JobStatus> {
    const admin = this.getAdmin()
    const { data } = await admin
      .from('job_queue')
      .select('status')
      .eq('correlation_id', correlationId)
      .single()

    return (data?.status as JobStatus) || 'unknown'
  }

  async cancel(correlationId: string): Promise<void> {
    const admin = this.getAdmin()
    await admin
      .from('job_queue')
      .update({ status: 'cancelled' })
      .eq('correlation_id', correlationId)
      .in('status', ['queued'])
  }
}
