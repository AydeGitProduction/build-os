// ── WS-A: Execution Adapter Interface ────────────────────────────────────────

export interface JobPayload {
  correlation_id: string
  task_id: string
  task_run_id: string
  feature_id: string | null
  project_id: string | null
  agent_role: string
  task_type: string
  task_name: string
  description: string | null
  context_payload: Record<string, unknown>
  callback_url: string
  idempotency_key: string
  retry_count: number
  feature_title?: string
  feature_description?: string
  epic_title?: string
  epic_description?: string
}

export interface DispatchResult {
  correlation_id: string
  execution_target: 'vercel' | 'railway'
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown'

export interface IExecutionAdapter {
  dispatch(job: JobPayload): Promise<DispatchResult>
  getStatus(correlationId: string): Promise<JobStatus>
  cancel(correlationId: string): Promise<void>
}
