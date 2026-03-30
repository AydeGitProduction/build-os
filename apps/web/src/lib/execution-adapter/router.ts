/**
 * router.ts — WS-A: Adapter factory based on env vars
 *
 * Priority:
 *   SHADOW_MODE=true  → ShadowAdapter (dual-dispatch, Vercel authoritative)
 *   RAILWAY_ENABLED=true → RailwayAdapter (Railway only — NOT used yet)
 *   default → VercelAdapter (existing n8n path, fully backward-compatible)
 */

import { VercelAdapter } from './vercel-adapter'
import { RailwayAdapter } from './railway-adapter'
import { ShadowAdapter } from './shadow-adapter'
import type { IExecutionAdapter } from './types'

export function getExecutionAdapter(): IExecutionAdapter {
  const shadowMode     = process.env.SHADOW_MODE === 'true'
  const railwayEnabled = process.env.RAILWAY_ENABLED === 'true'

  if (shadowMode) {
    console.log('[ExecutionRouter] SHADOW_MODE=true → ShadowAdapter')
    return new ShadowAdapter()
  }

  if (railwayEnabled) {
    console.log('[ExecutionRouter] RAILWAY_ENABLED=true → RailwayAdapter')
    return new RailwayAdapter()
  }

  // Default: fully backward-compatible
  return new VercelAdapter()
}

export type { IExecutionAdapter, JobPayload, DispatchResult, JobStatus } from './types'
