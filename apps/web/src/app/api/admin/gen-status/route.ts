/**
 * GET /api/admin/gen-status?task_id=<id>
 *
 * Supervisor diagnostic: check agent_outputs.generation_status + commit_delivery_logs for recent tasks.
 * Auth: X-Buildos-Secret header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET =
    process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''

  if (!secret || secret !== BUILDOS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('task_id')
  const titlePattern = searchParams.get('title_pattern')

  if (!taskId && !titlePattern) {
    return NextResponse.json({ error: 'task_id or title_pattern required' }, { status: 400 })
  }

  let taskQuery = admin.from('tasks').select('id, title, status, task_type, retry_count')
  if (taskId) {
    taskQuery = taskQuery.ilike('title', `%${taskId}%`) as typeof taskQuery
  } else {
    taskQuery = taskQuery.ilike('title', `%${titlePattern}%`) as typeof taskQuery
  }

  const { data: tasks } = await taskQuery.limit(10)

  const results = []
  for (const task of tasks ?? []) {
    const { data: outputs } = await admin
      .from('agent_outputs')
      .select('id, generation_status, created_at, raw_text')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(3)

    const { data: genEvents } = await admin
      .from('generation_events')
      .select('id, event_type, files_committed, error_message, created_at')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(5)

    // Check commit_delivery_logs
    const { data: commitLogs } = await admin
      .from('commit_delivery_logs')
      .select('id, target_path, verified, error_detail, commit_sha, created_at')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(5)

    // Check project_files
    const { data: projectFiles } = await admin
      .from('project_files')
      .select('file_path, updated_at')
      .eq('project_id', task.id)
      .limit(5)

    results.push({
      task: { id: task.id.slice(0, 8), title: task.title.slice(0, 80), status: task.status, task_type: task.task_type, retry_count: task.retry_count },
      agent_outputs: (outputs ?? []).map(o => ({
        id: o.id.slice(0, 8),
        generation_status: o.generation_status,
        created_at: o.created_at,
        has_raw_text: !!(o.raw_text),
      })),
      generation_events: (genEvents ?? []).map(e => ({
        id: e.id.slice(0, 8),
        event_type: e.event_type,
        files_committed: e.files_committed,
        error: e.error_message,
        created_at: e.created_at,
      })),
      commit_delivery_logs: (commitLogs ?? []).map(l => ({
        id: l.id?.slice(0, 8),
        path: l.target_path?.slice(0, 80),
        verified: l.verified,
        error: l.error_detail?.slice(0, 100),
        sha: l.commit_sha?.slice(0, 8),
        created_at: l.created_at,
      })),
    })
  }

  return NextResponse.json({ data: results, checked_at: new Date().toISOString() })
}
