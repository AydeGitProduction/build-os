import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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
          id, name, description, priority, sequence, is_core
        ),
        blueprint_stack_recommendations(
          id, layer, tool, rationale, sequence
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
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects/[id]/blueprint — generate blueprint from questionnaire answers
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch project + questionnaire
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('id, name, project_type')
      .eq('id', params.id)
      .single()

    if (projError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .select('id, status, answers(question_id, answer_value)')
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

    // Build answers map
    const answersMap: OnboardingAnswers = {} as OnboardingAnswers
    for (const a of (questionnaire.answers || [])) {
      (answersMap as Record<string, string>)[a.question_id] = a.answer_value
    }

    // Check version for increment
    const { data: existingBlueprints } = await supabase
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

    // Persist blueprint
    const { data: blueprint, error: bpError } = await supabase
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

    // Persist blueprint_features
    if (generated.features.length > 0) {
      const featureRows = generated.features.map((f, idx) => ({
        blueprint_id: blueprint.id,
        name: f.name,
        description: f.description,
        priority: f.priority,
        sequence: idx + 1,
        is_core: idx < 5, // First 5 are core
      }))
      await supabase.from('blueprint_features').insert(featureRows)
    }

    // Persist blueprint_stack_recommendations
    const stack = generated.tech_stack
    const stackRows = [
      { layer: 'frontend',  tool: stack.frontend,  rationale: `Recommended for ${project.project_type} projects`, sequence: 1 },
      { layer: 'backend',   tool: stack.backend,   rationale: `Recommended for ${project.project_type} projects`, sequence: 2 },
      { layer: 'database',  tool: stack.database,  rationale: `Recommended for ${project.project_type} projects`, sequence: 3 },
      { layer: 'devops',    tool: stack.devops,    rationale: `Recommended for ${project.project_type} projects`, sequence: 4 },
      ...(stack.ai ? [{ layer: 'ai', tool: stack.ai, rationale: 'AI layer for intelligent features', sequence: 5 }] : []),
    ].map(row => ({ ...row, blueprint_id: blueprint.id }))

    await supabase.from('blueprint_stack_recommendations').insert(stackRows)

    // Mark questionnaire as complete
    await supabase
      .from('questionnaires')
      .update({ status: 'completed' })
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
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
