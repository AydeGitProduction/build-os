import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const admin = createAdminSupabaseClient()
    const { data: blueprint } = await admin
      .from('blueprints')
      .select('id, title, problem_statement, target_audience, content, status, created_at')
      .eq('project_id', params.id)
      .maybeSingle()
    if (!blueprint) {
      return NextResponse.json({ data: null })
    }
    return NextResponse.json({
      data: {
        id: blueprint.id,
        title: blueprint.title,
        problemStatement: blueprint.problem_statement,
        targetAudience: blueprint.target_audience,
        content: blueprint.content,
        status: blueprint.status,
        isPartial: blueprint.status !== 'confirmed',
        assumptions: [],
        createdAt: blueprint.created_at,
      }
    })
  } catch (err) {
    console.error('[draft-preview] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
