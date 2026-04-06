/**
 * POST /api/worker/heavy/ack
 * WS2-B: ACK endpoint — records worker acknowledgement for a task_run.
 * Body: { task_run_id, job_id, worker_id }
 * Updates task_runs.acknowledged_at and heavy_dispatch_queue.acknowledged_at.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''
  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { task_run_id, job_id, worker_id } = await request.json()
  if (!task_run_id) {
    return NextResponse.json({ error: 'task_run_id is required' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const now = new Date().toISOString()

  // Update task_runs acknowledged_at and worker_id
  const { error: runError } = await supabase
    .from('task_runs')
    .update({ acknowledged_at: now, worker_id: worker_id || null })
    .eq('id', task_run_id)

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 })
  }

  // Update heavy_dispatch_queue acknowledged_at if job_id provided
  if (job_id) {
    await supabase
      .from('heavy_dispatch_queue')
      .update({ acknowledged_at: now })
      .eq('id', job_id)
  }

  return NextResponse.json({ ok: true, acknowledged_at: now, task_run_id, job_id, worker_id })
}
