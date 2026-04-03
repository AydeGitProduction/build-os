/**
 * POST /api/ideas/raw
 *
 * Phase 1 — Idea Input + Minimal Parse
 * Stores raw_idea_text, creates project row, parses idea (sync), links to session.
 *
 * Body: { session_id, raw_idea_text, user_id? }
 * Returns: {
 *   idea_id,        // wizard_conversation.id
 *   project_id,     // newly created project
 *   session_id,
 *   raw_idea,
 *   parse: {
 *     idea_category,  // e.g. "b2b_saas", "marketplace", "consumer_app", "internal_tool"
 *     core_action,    // e.g. "automate_invoicing", "connect_buyers_sellers"
 *     complexity,     // "simple" | "medium" | "complex"
 *   },
 *   stored_fields: [...],
 * }
 *
 * Auth: X-Buildos-Secret OR Supabase JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  let userId: string | null = null

  if (secret && secret === BUILDOS_SECRET) {
    const body = await req.json()
    userId = body.user_id ?? null
    return handleRawIdea(body, userId, admin)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  return handleRawIdea(body, user.id, admin)
}

async function parseIdeaWithAI(rawIdea: string): Promise<{
  idea_category: string
  core_action: string
  complexity: 'simple' | 'medium' | 'complex'
}> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You are an expert at categorizing SaaS product ideas.
Respond ONLY with valid JSON matching this schema:
{
  "idea_category": "<one of: b2b_saas|marketplace|consumer_app|internal_tool|developer_tool|ai_product|other>",
  "core_action": "<2-5 word verb phrase describing the primary user action, e.g. automate_invoicing>",
  "complexity": "<one of: simple|medium|complex>"
}
No explanation. JSON only.`,
      messages: [{ role: 'user', content: `Categorize this product idea: "${rawIdea}"` }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const parsed = JSON.parse(text)
    return {
      idea_category: parsed.idea_category ?? 'other',
      core_action: (parsed.core_action ?? 'build_product').replace(/\s+/g, '_').toLowerCase(),
      complexity: parsed.complexity ?? 'medium',
    }
  } catch {
    // Fallback parse — synchronous heuristic
    const lower = rawIdea.toLowerCase()
    const complexity = rawIdea.split(' ').length > 50 ? 'complex' : rawIdea.split(' ').length > 20 ? 'medium' : 'simple'
    const idea_category = lower.includes('marketplace') ? 'marketplace'
      : lower.includes('api') || lower.includes('developer') ? 'developer_tool'
      : lower.includes('ai') || lower.includes('gpt') ? 'ai_product'
      : 'b2b_saas'
    return { idea_category, core_action: 'build_product', complexity }
  }
}

async function handleRawIdea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  userId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  const { session_id, raw_idea_text } = body

  if (!raw_idea_text?.trim()) {
    return NextResponse.json({ error: 'raw_idea_text is required' }, { status: 400 })
  }

  // 1. Parse idea (minimal, synchronous)
  const parse = await parseIdeaWithAI(raw_idea_text.trim())
  console.log('[ideas/raw] Parse result:', parse)

  // 2. Resolve workspace_id (required NOT NULL on projects)
  const workspaceId = userId
    ? await getWorkspaceForUser(admin, userId)
    : await getDefaultWorkspace(admin)

  // 3. Create project row with status = "wizard_in_progress"
  const projectSlug = `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({
      name: raw_idea_text.trim().slice(0, 80) || 'Untitled Idea',
      slug: projectSlug,
      description: raw_idea_text.trim(),
      status: 'draft',
      project_type: parse.idea_category === 'marketplace' ? 'marketplace' : 'saas',
      bootstrap_status: 'not_started',
      ...(userId ? { created_by: userId } : {}),
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    })
    .select('id, name, slug, status, project_type, created_at')
    .single()

  if (projectError) {
    console.error('[ideas/raw] Project creation error:', projectError)
    return NextResponse.json({ error: projectError.message }, { status: 500 })
  }

  // 3. Store raw idea + parse in wizard_conversations (collected_fields)
  const { data: conv, error: convError } = await admin
    .from('wizard_conversations')
    .insert({
      project_id: project.id,
      messages: [
        {
          role: 'user',
          content: raw_idea_text.trim(),
          ts: new Date().toISOString(),
        },
      ],
      collected_fields: {
        raw_idea: raw_idea_text.trim(),
        idea_category: parse.idea_category,
        core_action: parse.core_action,
        complexity: parse.complexity,
        confirmed: false,
        primary_user_action: null,
      },
      turn_index: 1,
      readiness: 20, // 20% after idea input
    })
    .select('id, project_id, collected_fields, readiness, created_at')
    .single()

  if (convError) {
    console.error('[ideas/raw] Conversation insert error:', convError)
    return NextResponse.json({ error: convError.message }, { status: 500 })
  }

  // 4. Link session to project (if session_id provided)
  if (session_id) {
    await admin
      .from('wizard_sessions')
      .update({
        project_id: project.id,
        status: 'IN_PROGRESS',
        current_step: 'idea_captured',
        metadata: {
          wizard_state: {
            phase: 'idea_captured',
            step: 2,
            idea_id: conv.id,
            confirmed: false,
            clarification_done: false,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id)
  }

  const storedFields = ['raw_idea', 'idea_category', 'core_action', 'complexity', 'confirmed', 'primary_user_action']

  return NextResponse.json({
    idea_id: conv.id,
    project_id: project.id,
    session_id: session_id ?? null,
    raw_idea: raw_idea_text.trim(),
    parse,
    stored_fields: storedFields,
    readiness: conv.readiness,
    created_at: conv.created_at,
  }, { status: 201 })
}

async function getWorkspaceForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    return data?.workspace_id ?? await getDefaultWorkspace(admin)
  } catch {
    return getDefaultWorkspace(admin)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDefaultWorkspace(admin: any): Promise<string | null> {
  try {
    const { data } = await admin.from('workspaces').select('id').limit(1).maybeSingle()
    return data?.id ?? null
  } catch {
    return null
  }
}
