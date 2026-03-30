/**
 * shadow-adapter.ts — WS-D: Dual-dispatch shadow mode
 *
 * Fires BOTH Vercel (authoritative) and Railway (shadow) in parallel.
 * Returns Vercel result — Railway failure NEVER propagates.
 * Railway result stored in shadow_results for comparison.
 */

import { createClient } from '@supabase/supabase-js'
import { VercelAdapter } from './vercel-adapter'
import { RailwayAdapter } from './railway-adapter'
import type { IExecutionAdapter, JobPayload, DispatchResult, JobStatus } from './types'

export class ShadowAdapter implements IExecutionAdapter {
  private vercel = new VercelAdapter()
  private railway = new RailwayAdapter()

  private getAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  async dispatch(job: JobPayload): Promise<DispatchResult> {
    // Fire both in parallel
    const [vercelResult, railwayResult] = await Promise.allSettled([
      this.vercel.dispatch(job),
      this.railway.dispatch(job),
    ])

    // Vercel result is authoritative
    if (vercelResult.status === 'rejected') {
      throw vercelResult.reason
    }

    const vercelDispatch = vercelResult.value

    // Record Railway shadow dispatch (fire-and-forget, never throws)
    this.recordShadowDispatch(
      vercelDispatch.correlation_id,
      job.task_id,
      railwayResult
    ).catch(err => console.error('[ShadowAdapter] shadow_results insert failed (non-fatal):', err))

    if (railwayResult.status === 'rejected') {
      console.warn('[ShadowAdapter] Railway dispatch failed (non-fatal):', railwayResult.reason)
    } else {
      console.log(`[ShadowAdapter] Shadow job queued: railway_cid=${railwayResult.value.correlation_id}`)
    }

    return vercelDispatch
  }

  private async recordShadowDispatch(
    vercelCorrelationId: string,
    taskId: string,
    railwayResult: PromiseSettledResult<DispatchResult>
  ): Promise<void> {
    const admin = this.getAdmin()

    if (railwayResult.status === 'fulfilled') {
      await admin.from('shadow_results').insert({
        correlation_id: railwayResult.value.correlation_id,
        task_id: taskId,
        execution_target: 'railway',
        status: 'queued',
        output: { vercel_correlation_id: vercelCorrelationId },
      })
    } else {
      await admin.from('shadow_results').insert({
        correlation_id: vercelCorrelationId,
        task_id: taskId,
        execution_target: 'railway',
        status: 'dispatch_failed',
        output: { error: String(railwayResult.reason) },
      })
    }
  }

  async getStatus(correlationId: string): Promise<JobStatus> {
    return this.vercel.getStatus(correlationId)
  }

  async cancel(correlationId: string): Promise<void> {
    await Promise.allSettled([
      this.vercel.cancel(correlationId),
      this.railway.cancel(correlationId),
    ])
  }
}
