import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { generateBlueprint, generateExecutionPlan, estimateBuildCost } from '@/lib/blueprint-generator'
import type { OnboardingAnswers } from '@/lib/types'

// GET /api/projects/[id]/blueprint — fetch the project blueprint
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: blueprint, error } = await supabase
      .from('blueprints')
      .select(`
        id, project_id, summary, goals, non_goals, user_personas,
        status, version, created_at, updated_at,
        blueprint_features(
          id, title, description, priority, order_index
        ),
        blueprint_stack_recommendations(
          id, layer, tool, reasoning, order_index
        )
      `)
      .eq('project_id', params.id)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: null })
      }
      throw error
    }

    return NextResponse.json({ data: blueprint })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Internal server error'
    console.error('[blueprint GET]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects/[id]/blueprint — generate blueprint from questionnaire answers
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Accept internal secret OR user session — allows server-to-server calls from IRIS route
    const internalSecret = process.env.BUILDOS_INTERNAL_SECRET || process.env.BUILDOS_SECRET || ''
    const requestSecret = request.headers.get('X-Buildos-Secret') || ''
    const isInternalCall = internalSecret && requestSecret === internalSecret

    const supabase = await createServerSupabaseClient()
    const admin = createAdminSupabaseClient()

    if (!isInternalCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Fetch project + questionnaire — use admin to bypass RLS on questionnaires/answers
    const { data: project, error: projError } = await admin
      .from('projects')
      .select('id, name, project_type')
      .eq('id', params.id)
      .single()

    if (projError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: questionnaire, error: qError } = await admin
      .from('questionnaires')
      .select('id, status, answers(question_id, value)')   // "value" is the correct column name (jsonb), not "answer_value"
      .eq('project_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (qError || !questionnaire) {
      return NextResponse.json(
        { error: 'No questionnaire found. Complete the onboarding wizard first.' },
        { status: 422 }
      )
    }

    // Build raw answers map from DB rows (column "value" is jsonb stored as string)
    const rawAnswers: Record<string, string> = {}
    for (const a of (questionnaire.answers || [])) {
      rawAnswers[a.question_id] = String(a.value ?? '')
    }

    // Map IRIS-style keys (product_name / target_audience / core_problem) to the
    // generator-expected keys (what_building / target_user / core_outcome).
    // Support both naming conventions so old wizard sessions still work.
    const answersMap: OnboardingAnswers = {
      what_building: rawAnswers.what_building || rawAnswers.product_name || project.name || '',
      target_user:   rawAnswers.target_user   || rawAnswers.target_audience || '',
      core_outcome:  rawAnswers.core_outcome  || rawAnswers.core_problem || '',
      key_features:  rawAnswers.key_features || '',
      integrations:  (rawAnswers.integrations_needed || rawAnswers.integrations || '')
        .split(',').map((s: string) => s.trim()).filter(Boolean),
    }

    // Check version for increment
    const { data: existingBlueprints } = await admin
      .from('blueprints')
      .select('version')
      .eq('project_id', params.id)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = existingBlueprints && existingBlueprints.length > 0
      ? existingBlueprints[0].version + 1
      : 1

    // Generate blueprint deterministically
    const generated = generateBlueprint(answersMap, project.project_type as string)
    const executionPlan = generateExecutionPlan(generated, project.project_type as string)
    const estimatedCost = estimateBuildCost(executionPlan)

    // Persist blueprint — use admin to bypass RLS
    const { data: blueprint, error: bpError } = await admin
      .from('blueprints')
      .insert({
        project_id: params.id,
        summary: generated.summary,
        goals: JSON.stringify(generated.goals),
        non_goals: JSON.stringify(generated.non_goals),
        user_personas: JSON.stringify(generated.user_personas),
        status: 'draft',
        version: nextVersion,
        questionnaire_id: questionnaire.id,
      })
      .select()
      .single()

    if (bpError) throw bpError

    // Helper: normalise string | string[] to a single display string
    const toolStr = (t: string | string[] | undefined): string =>
      Array.isArray(t) ? t.join(', ') : (t ?? '')

    // Persist blueprint_features — use admin
    if (generated.features.length > 0) {
      const featureRows = generated.features.map((f, idx) => ({
        blueprint_id: blueprint.id,
        project_id: params.id,
        title: (f as { title?: string; name?: string }).title ?? (f as { title?: string; name?: string }).name ?? 'Feature',
        description: f.description,
        priority: f.priority,
        order_index: idx + 1,
      }))
      const { error: featErr } = await admin.from('blueprint_features').insert(featureRows)
      if (featErr) console.error('[blueprint POST] features insert error:', featErr.message)
    }

    // Persist blueprint_stack_recommendations — use admin
    const stack = generated.tech_stack
    const stackRows = [
      { layer: 'frontend',  tool: toolStr(stack.frontend),  reasoning: `Recommended for ${project.project_type} projects`, order_index: 1 },
      { layer: 'backend',   tool: toolStr(stack.backend),   reasoning: `Recommended for ${project.project_type} projects`, order_index: 2 },
      { layer: 'database',  tool: toolStr(stack.database),  reasoning: `Recommended for ${project.project_type} projects`, order_index: 3 },
      { layer: 'devops',    tool: toolStr(stack.devops),    reasoning: `Recommended for ${project.project_type} projects`, order_index: 4 },
      ...(stack.ai ? [{ layer: 'ai', tool: toolStr(stack.ai), reasoning: 'AI layer for intelligent features', order_index: 5 }] : []),
    ].map(row => ({ ...row, blueprint_id: blueprint.id, project_id: params.id }))

    const { error: stackErr } = await admin.from('blueprint_stack_recommendations').insert(stackRows)
    if (stackErr) console.error('[blueprint POST] stack insert error:', stackErr.message)

    // Mark questionnaire as complete — use admin
    await admin
      .from('questionnaires')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', questionnaire.id)

    // Return full blueprint with generated execution plan
    return NextResponse.json({
      data: {
        blueprint,
        execution_plan: executionPlan,
        estimated_cost_usd: estimatedCost,
        risk_flags: generated.risk_flags,
      }
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Internal server error'
    console.error('[blueprint POST]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
