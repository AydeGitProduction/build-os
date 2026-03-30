// ── Job Contract Types (WS-C) ─────────────────────────────────────────────────

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
  // Enriched context passed through
  feature_title?: string
  feature_description?: string
  epic_title?: string
  epic_description?: string
  completed_dependencies?: Array<{
    title: string
    description: string | null
    agent_role: string
    output_type: string
    output_summary: string
  }>
}

export interface JobQueueRow {
  id: string
  correlation_id: string
  task_id: string
  feature_id: string | null
  project_id: string | null
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  payload: JobPayload
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
  retry_count: number
  worker_id: string | null
}

export interface CallbackPayload {
  correlation_id: string
  task_run_id: string
  task_id: string
  status: 'success' | 'failure'
  output: Record<string, unknown>
  error?: string
  execution_target: 'railway'
  completed_at: string
  // Same shape as what n8n sends to /api/agent/output
  agent_role?: string
  task_type?: string
  idempotency_key?: string
  tokens_input?: number
  tokens_output?: number
  model?: string
}
