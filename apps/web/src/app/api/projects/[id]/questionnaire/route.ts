import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/projects/[id]/questionnaire — fetch questionnaire + answers
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

    const { data: questionnaire, error } = await supabase
      .from('questionnaires')
      .select(`
        id, project_id, status, questions, created_at, updated_at,
        answers(id, question_id, answer_value, created_at, updated_at)
      `)
      .eq('project_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No questionnaire yet — return null
        return NextResponse.json({ data: null })
      }
      throw error
    }

    return NextResponse.json({ data: questionnaire })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/projects/[id]/questionnaire — create or upsert questionnaire + answers
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

    const body = await request.json()
    const { answers, status = 'draft' } = body

    // Verify project access via RLS
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', params.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Define the onboarding question definitions
    const questions = [
      { id: 'product_name',        label: 'What is the name of your product?',                        type: 'text',     required: true  },
      { id: 'target_audience',     label: 'Who is your target audience?',                             type: 'text',     required: true  },
      { id: 'core_problem',        label: 'What core problem does it solve?',                         type: 'textarea', required: true  },
      { id: 'key_features',        label: 'List your 3–5 key features',                               type: 'textarea', required: true  },
      { id: 'monetisation',        label: 'How will you monetise it?',                                type: 'select',   required: true,
        options: ['Subscription', 'One-time purchase', 'Freemium', 'Usage-based', 'Marketplace', 'Other'] },
      { id: 'integrations_needed', label: 'Which integrations do you need?',                          type: 'multiselect', required: false,
        options: ['Stripe', 'GitHub', 'Linear', 'Slack', 'Notion', 'HubSpot', 'Zapier', 'Other'] },
      { id: 'ai_features',         label: 'Do you need AI / LLM features?',                          type: 'boolean',  required: false },
      { id: 'timeline_weeks',      label: 'What is your target delivery timeline (weeks)?',           type: 'number',   required: false },
      { id: 'budget_usd',          label: 'What is your approximate budget in USD?',                  type: 'number',   required: false },
      { id: 'compliance',          label: 'Any compliance requirements (GDPR, HIPAA, SOC2, etc.)?',   type: 'text',     required: false },
    ]

    // Upsert questionnaire
    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .upsert(
        { project_id: params.id, status, questions },
        { onConflict: 'project_id', ignoreDuplicates: false }
      )
      .select()
      .single()

    if (qError) throw qError

    // Upsert answers if provided
    if (answers && typeof answers === 'object') {
      const answerRows = Object.entries(answers).map(([question_id, answer_value]) => ({
        questionnaire_id: questionnaire.id,
        question_id,
        answer_value: typeof answer_value === 'string' ? answer_value : JSON.stringify(answer_value),
        answered_by: user.id,
      }))

      if (answerRows.length > 0) {
        const { error: aError } = await supabase
          .from('answers')
          .upsert(answerRows, { onConflict: 'questionnaire_id,question_id' })

        if (aError) throw aError
      }
    }

    // Fetch final state with answers
    const { data: final, error: finalError } = await supabase
      .from('questionnaires')
      .select('id, project_id, status, questions, created_at, updated_at, answers(*)')
      .eq('id', questionnaire.id)
      .single()

    if (finalError) throw finalError

    return NextResponse.json({ data: final }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
