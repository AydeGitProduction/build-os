/**
 * POST /api/projects/[id]/iris
 *
 * Iris — AI Architect conversation endpoint.
 * Replaces the static questionnaire wizard with adaptive conversational onboarding.
 *
 * Iris gathers:
 *   - Product name, target audience, core problem
 *   - Key features and differentiators
 *   - Business model and monetisation
 *   - Technical requirements (AI, compliance, integrations)
 *   - Timeline and budget constraints
 *
 * Iris continues asking adaptive follow-up questions until it has a complete
 * understanding of the product. When complete, it saves the gathered data as
 * questionnaire answers (same schema as the old wizard) and triggers blueprint
 * generation automatically.
 *
 * Body: { message: string, conversation_id?: string }
 * Response: { reply: string, complete: boolean, conversation_id: string, blueprint_id?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const IRIS_SYSTEM_PROMPT = `You are Iris, the AI architect for Build OS — an autonomous SaaS builder platform.
Your role is to conduct a natural, intelligent conversation to gather everything you need to design a complete SaaS product architecture.

PERSONALITY:
- Expert but approachable — like a senior CTO doing a discovery call
- Concise, focused questions — never ask multiple questions at once
- Genuinely curious about the product vision
- Proactive about flagging risks and opportunities you notice

YOUR GOAL:
Gather enough information to generate a complete blueprint covering:
1. Product identity: name, target audience, core problem being solved
2. Key features: the 3-5 most important capabilities
3. Business model: monetisation, pricing model
4. Technical requirements: AI features, compliance needs (GDPR/HIPAA/SOC2), integrations needed
5. Constraints: timeline (weeks), approximate budget (USD)

CONVERSATION RULES:
- Ask ONE focused question at a time
- After the user answers, acknowledge briefly, then ask the next most important question
- Adapt based on what they say — if they mention Stripe, don't ask about payments separately
- When you have gathered all 5 areas above with sufficient detail, respond with:
  COMPLETE_JSON:<json>
  where <json> is a JSON object with these exact keys:
  {
    "product_name": "string",
    "target_audience": "string",
    "core_problem": "string",
    "key_features": "string (comma or newline separated)",
    "monetisation": "Subscription|One-time purchase|Freemium|Usage-based|Marketplace|Other",
    "integrations_needed": "comma-separated list or empty string",
    "ai_features": "yes|no",
    "timeline_weeks": "number as string or empty",
    "budget_usd": "number as string or empty",
    "compliance": "string or empty"
  }

IMPORTANT:
- Never output COMPLETE_JSON until you genuinely have all required information
- Keep each message concise (2-3 sentences max)
- Start by introducing yourself briefly and asking the FIRST question: what they're building
- Do NOT use bullet points or markdown formatting in your responses — plain conversational text only`

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project, error: projError } = await admin
      .from('projects')
      .select('id, name, project_type, status')
      .eq('id', params.id)
      .single()

    if (projError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const { message, history = [] } = body as {
      message: string
      history: ConversationMessage[]
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // Build message history
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m: ConversationMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ]

    // Call Anthropic
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: IRIS_SYSTEM_PROMPT + `\n\nProject context: "${project.name}" (type: ${project.project_type})`,
      messages,
    })

    const replyText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    // Check if Iris has gathered all information
    const completeMatch = replyText.match(/COMPLETE_JSON:\s*(\{[\s\S]*\})/)

    if (completeMatch) {
      // Parse the gathered data
      let gathered: Record<string, string> = {}
      try {
        gathered = JSON.parse(completeMatch[1])
      } catch {
        return NextResponse.json({
          reply: "I have all the information I need! Let me generate your blueprint now...",
          complete: false,
          history: [...history, { role: 'user', content: message }, { role: 'assistant', content: replyText }]
        })
      }

      // Save as questionnaire answers (same schema as old wizard)
      const answersMap = {
        product_name:        gathered.product_name || project.name,
        target_audience:     gathered.target_audience || '',
        core_problem:        gathered.core_problem || '',
        key_features:        gathered.key_features || '',
        monetisation:        gathered.monetisation || 'Subscription',
        integrations_needed: gathered.integrations_needed || '',
        ai_features:         gathered.ai_features || 'no',
        timeline_weeks:      gathered.timeline_weeks || '',
        budget_usd:          gathered.budget_usd || '',
        compliance:          gathered.compliance || '',
      }

      // Upsert questionnaire
      const questions = [
        { id: 'product_name',        label: 'Product name',                        type: 'text',     required: true  },
        { id: 'target_audience',     label: 'Target audience',                     type: 'text',     required: true  },
        { id: 'core_problem',        label: 'Core problem it solves',              type: 'textarea', required: true  },
        { id: 'key_features',        label: 'Key features',                        type: 'textarea', required: true  },
        { id: 'monetisation',        label: 'Monetisation model',                  type: 'select',   required: true  },
        { id: 'integrations_needed', label: 'Required integrations',               type: 'multiselect', required: false },
        { id: 'ai_features',         label: 'AI / LLM features needed?',          type: 'boolean',  required: false },
        { id: 'timeline_weeks',      label: 'Target delivery timeline (weeks)',    type: 'number',   required: false },
        { id: 'budget_usd',          label: 'Approximate budget (USD)',            type: 'number',   required: false },
        { id: 'compliance',          label: 'Compliance requirements',             type: 'text',     required: false },
      ]

      // Use admin client — questionnaires table has RLS that blocks user-level inserts.
      // Manual select-then-update-or-insert because there is no unique constraint on project_id
      // (so ON CONFLICT upsert would throw "no unique constraint" error).
      const { data: existingQ } = await admin
        .from('questionnaires')
        .select('id')
        .eq('project_id', params.id)
        .maybeSingle()

      let questionnaire: { id: string } | null = null

      if (existingQ) {
        // Update existing
        const { data, error: updateErr } = await admin
          .from('questionnaires')
          .update({ status: 'completed', questions, updated_at: new Date().toISOString() })
          .eq('id', existingQ.id)
          .select('id')
          .single()
        if (updateErr) {
          console.error('Questionnaire update failed:', updateErr.message)
          return NextResponse.json({ error: 'Failed to save: ' + updateErr.message }, { status: 500 })
        }
        questionnaire = data
      } else {
        // Insert new
        const { data, error: insertErr } = await admin
          .from('questionnaires')
          .insert({ project_id: params.id, status: 'completed', questions })
          .select('id')
          .single()
        if (insertErr) {
          console.error('Questionnaire insert failed:', insertErr.message)
          return NextResponse.json({ error: 'Failed to save: ' + insertErr.message }, { status: 500 })
        }
        questionnaire = data
      }

      if (!questionnaire) {
        return NextResponse.json({ error: 'Failed to save conversation data' }, { status: 500 })
      }

      // Save answers — delete old answers first then re-insert (cleaner than conflict detection)
      await admin.from('answers').delete().eq('questionnaire_id', questionnaire.id)

      const answerRows = Object.entries(answersMap).map(([question_id, answer_value]) => ({
        questionnaire_id: questionnaire!.id,
        question_id,
        answer_value: String(answer_value),
        answered_by: user.id,
      }))

      await admin.from('answers').insert(answerRows)

      // Trigger blueprint generation
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      try {
        await fetch(`${appUrl}/api/projects/${params.id}/blueprint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
          body: JSON.stringify({}),
        })
      } catch { /* non-fatal — UI will trigger this */ }

      const closingMessage = `Perfect — I now have everything I need. Your blueprint is generating now. I'll architect your ${gathered.product_name || project.name} as a ${gathered.monetisation || 'subscription'}-based ${project.project_type} — let's build it.`

      return NextResponse.json({
        reply: closingMessage,
        complete: true,
        gathered,
        history: [...history, { role: 'user', content: message }, { role: 'assistant', content: closingMessage }],
      })
    }

    // Normal conversational reply
    return NextResponse.json({
      reply: replyText,
      complete: false,
      history: [...history, { role: 'user', content: message }, { role: 'assistant', content: replyText }],
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
