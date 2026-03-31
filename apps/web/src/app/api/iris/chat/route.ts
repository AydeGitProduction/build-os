/**
 * /api/iris/chat
 *
 * POST — Send a message to IRIS (wizard AI assistant) and get a response.
 * Persists conversation to wizard_conversations table.
 *
 * Auth: Bearer JWT OR X-Buildos-Secret
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = req.headers.get('X-Buildos-Secret')
  const BUILDOS_SECRET = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET
  const admin = createAdminSupabaseClient()

  let userId: string | null = null

  if (secret && secret === BUILDOS_SECRET) {
    const body = await req.json()
    userId = body.user_id ?? null
    return handleChat(body, userId, admin)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  return handleChat(body, user.id, admin)
}

async function handleChat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  userId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
) {
  const { project_id, message, session_id } = body

  if (!project_id || !message) {
    return NextResponse.json({ error: 'project_id and message required' }, { status: 400 })
  }

  // Load or create wizard conversation
  let { data: conv } = await admin
    .from('wizard_conversations')
    .select('*')
    .eq('project_id', project_id)
    .single()

  const messages = conv?.messages ?? []

  // Add user message
  messages.push({ role: 'user', content: message, ts: new Date().toISOString() })

  // Call IRIS (Claude) for response
  let assistantReply = ''
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const chatMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are IRIS, an intelligent project setup assistant for Build OS.
Your role is to guide users through defining their software project requirements.
Ask targeted questions to understand: project type, target users, core features, tech preferences, timeline.
Be concise and helpful. After gathering enough info (readiness >= 80%), confirm you have what you need.`,
      messages: chatMessages.slice(-10), // Last 10 turns for context
    })

    assistantReply = response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (e) {
    assistantReply = `I'm here to help you define your project. Tell me: what problem are you solving and who are your users? (AI response temporarily unavailable: ${String(e).slice(0, 100)})`
  }

  messages.push({ role: 'assistant', content: assistantReply, ts: new Date().toISOString() })

  // Upsert wizard_conversations
  const newTurnIndex = (conv?.turn_index ?? 0) + 1
  const newReadiness = Math.min(100, Math.floor((newTurnIndex / 10) * 100)) // Simple readiness heuristic

  if (conv) {
    await admin
      .from('wizard_conversations')
      .update({
        messages,
        turn_index: newTurnIndex,
        readiness: newReadiness,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', project_id)
  } else {
    await admin
      .from('wizard_conversations')
      .insert({
        project_id,
        messages,
        turn_index: newTurnIndex,
        readiness: newReadiness,
      })
  }

  // Update wizard session if provided
  if (session_id) {
    await admin
      .from('wizard_sessions')
      .update({ status: 'IN_PROGRESS', current_step: 'chat', updated_at: new Date().toISOString() })
      .eq('id', session_id)
  }

  return NextResponse.json({
    reply: assistantReply,
    turn_index: newTurnIndex,
    readiness: newReadiness,
  })
}
