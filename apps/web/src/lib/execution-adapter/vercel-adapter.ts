/**
 * vercel-adapter.ts — WS-A: Wraps existing n8n dispatch (unchanged path)
 *
 * This is the AUTHORITATIVE adapter. Vercel remains primary.
 * All existing dispatch behavior is preserved exactly.
 */

import { randomUUID } from 'crypto'
import type { IExecutionAdapter, JobPayload, DispatchResult, JobStatus } from './types'

export class VercelAdapter implements IExecutionAdapter {
  private webhookUrl: string
  private secret: string

  constructor() {
    this.webhookUrl = process.env.N8N_DISPATCH_WEBHOOK_URL || ''
    this.secret = (
      process.env.N8N_WEBHOOK_SECRET ||
      process.env.BUILDOS_INTERNAL_SECRET ||
      process.env.BUILDOS_SECRET ||
      ''
    )
  }

  async dispatch(job: JobPayload): Promise<DispatchResult> {
    const correlationId = job.correlation_id || randomUUID()

    if (this.webhookUrl) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (this.secret) headers['X-Buildos-Secret'] = this.secret

      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error(`[VercelAdapter] n8n webhook failed: ${res.status} ${text.slice(0, 200)}`)
      }
    }

    return { correlation_id: correlationId, execution_target: 'vercel' }
  }

  async getStatus(_correlationId: string): Promise<JobStatus> {
    // Vercel/n8n status is tracked via task_runs table, not correlation_id
    return 'unknown'
  }

  async cancel(_correlationId: string): Promise<void> {
    // No cancellation mechanism for n8n webhooks
  }
}
