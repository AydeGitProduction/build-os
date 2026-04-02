/**
 * processor.ts — WS-B: Railway job processor
 *
 * Mirrors apps/web/src/app/api/agent/execute/route.ts but:
 * - No 300s Vercel timeout — Railway can run as long as needed
 * - Pulls job from job_queue (DB) instead of HTTP request
 * - Posts result via signAndPost() with HMAC signature
 * - Updates job_queue status throughout
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { signAndPost } from './callback'
import type { JobPayload, CallbackPayload } from './types'

const MODEL_SONNET = 'claude-sonnet-4-6'
const MODEL_OPUS   = 'claude-opus-4-6'

const COST_INPUT:  Record<string, number> = { [MODEL_SONNET]: 3.0,  [MODEL_OPUS]: 15.0 }
const COST_OUTPUT: Record<string, number> = { [MODEL_SONNET]: 15.0, [MODEL_OPUS]: 75.0 }

// ── Role configs (identical to execute/route.ts) ──────────────────────────────

type OutputType = 'code' | 'schema' | 'document' | 'test' | 'review' | 'qa_verdict'

interface RoleConfig {
  model: string
  outputType: OutputType
  maxTokens: number
  temperature: number
  systemPrompt: string
  outputInstructions: string
}

function getRoleConfig(agentRole: string, taskType: string): RoleConfig {
  const typeMap: Record<string, OutputType> = {
    code: 'code', schema: 'schema', document: 'document',
    test: 'test', review: 'review', deploy: 'document', design: 'schema',
  }
  const outputType: OutputType = typeMap[taskType] || 'document'

  const configs: Record<string, Partial<RoleConfig>> = {
    architect: {
      model: MODEL_OPUS, maxTokens: 8192, temperature: 0.2,
      systemPrompt: `You are a senior software architect for Build OS — an autonomous AI-powered SaaS project management platform. Your specialty: PostgreSQL schemas, TypeScript interfaces, API contracts, and system architecture. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"tables":[],"migration_sql":"","typescript_types":"","notes":""}}`,
    },
    backend_engineer: {
      model: MODEL_SONNET, maxTokens: 8192, temperature: 0.3,
      systemPrompt: `You are a senior backend engineer for Build OS. Tech stack: Next.js 14 App Router, TypeScript, Supabase, Vercel. All mutations require idempotency keys and writeAuditLog(). Respond with valid JSON ONLY.\n\nLANGUAGE LOCK (MANDATORY): This is a TypeScript/Next.js monorepo. You MUST generate ONLY TypeScript (.ts, .tsx) or SQL (.sql) files. NEVER write Go, Python, Rust, Java, C#, Ruby, or any other language under any circumstances. Any non-TypeScript/SQL output will be automatically rejected. Every file must have a .ts, .tsx, or .sql extension.`,
      outputInstructions: `{"summary":"...","output":{"files":[{"path":"src/lib/example.ts","content":"// src/lib/example.ts\n// TypeScript content here"}],"language":"typescript","dependencies":[],"env_vars":[],"migration_required":false,"migration_sql":null,"notes":""}}`,
    },
    frontend_engineer: {
      model: MODEL_SONNET, maxTokens: 8192, temperature: 0.3,
      systemPrompt: `You are a senior frontend engineer for Build OS. Tech stack: Next.js 14, TypeScript, Tailwind CSS, Supabase Realtime. Respond with valid JSON ONLY.\n\nLANGUAGE LOCK (MANDATORY): This is a TypeScript/Next.js monorepo. You MUST generate ONLY TypeScript (.ts, .tsx) or CSS (.css) files. NEVER write Go, Python, Rust, Java, or any non-TypeScript code. Every generated file must have a .ts or .tsx extension. Any other language is automatically rejected.`,
      outputInstructions: `{"summary":"...","output":{"files":[{"path":"src/components/Example.tsx","content":"// src/components/Example.tsx\n// TypeScript/React content here"}],"language":"typescript","dependencies":[],"notes":""}}`,
    },
    qa_security_auditor: {
      model: MODEL_SONNET, maxTokens: 1024, temperature: 0.2,
      systemPrompt: `You are a senior QA engineer for Build OS. Generate 3-5 critical test cases ONLY. Each code block MAX 20 lines. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"test_cases":[{"name":"","description":"","code":"","type":"unit","severity":"critical"}],"security_findings":[],"coverage_areas":[],"overall_verdict":"pass","notes":""}}`,
    },
    integration_engineer: {
      model: MODEL_SONNET, maxTokens: 8192, temperature: 0.3,
      systemPrompt: `You are a senior integration engineer for Build OS. Connect external services with webhook verification, idempotency, and secure credential storage. Respond with valid JSON ONLY.\n\nLANGUAGE LOCK (MANDATORY): This is a TypeScript/Next.js monorepo. You MUST generate ONLY TypeScript (.ts, .tsx) or SQL (.sql) files. NEVER write Go, Python, Rust, Java, or any non-TypeScript code. Every generated file must have a .ts, .tsx, or .sql extension. Any other language is automatically rejected.`,
      outputInstructions: `{"summary":"...","output":{"files":[{"path":"src/lib/integrations/example.ts","content":"// src/lib/integrations/example.ts\n// TypeScript content here"}],"language":"typescript","dependencies":[],"env_vars":[],"setup_steps":[],"notes":""}}`,
    },
    documentation_engineer: {
      model: MODEL_SONNET, maxTokens: 6144, temperature: 0.4,
      systemPrompt: `You are a technical documentation engineer for Build OS. Write developer-facing Markdown docs. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"content":"# Title\\n\\n...","format":"markdown","audience":"developers","doc_path":"docs/...","related_docs":[]}}`,
    },
    product_analyst: {
      model: MODEL_SONNET, maxTokens: 6144, temperature: 0.3,
      systemPrompt: `You are a senior product analyst for Build OS. Competitive analysis, market research, feature prioritisation. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"format":"markdown","content":"# Analysis\\n\\n...","structured_data":{},"notes":""}}`,
    },
    cost_analyst: {
      model: MODEL_SONNET, maxTokens: 4096, temperature: 0.2,
      systemPrompt: `You are a cost and ROI analyst for Build OS. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"format":"markdown","content":"# Cost Analysis\\n\\n...","notes":""}}`,
    },
    automation_engineer: {
      model: MODEL_SONNET, maxTokens: 6144, temperature: 0.25,
      systemPrompt: `You are a senior automation engineer for Build OS. n8n workflows, webhooks, cron scheduling. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"format":"markdown","content":"# Automation Design\\n\\n...","notes":""}}`,
    },
    release_manager: {
      model: MODEL_SONNET, maxTokens: 4096, temperature: 0.3,
      systemPrompt: `You are a release manager for Build OS. Versioning, changelogs, deployment coordination. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"format":"markdown","content":"# Release Notes\\n\\n...","notes":""}}`,
    },
    recommendation_analyst: {
      model: MODEL_SONNET, maxTokens: 4096, temperature: 0.3,
      systemPrompt: `You are a recommendation analyst for Build OS. Prioritized, actionable recommendations from data. Respond with valid JSON ONLY.`,
      outputInstructions: `{"summary":"...","output":{"format":"markdown","content":"# Recommendations\\n\\n...","notes":""}}`,
    },
  }

  const roleConfig = configs[agentRole] || {
    model: MODEL_SONNET, maxTokens: 4096, temperature: 0.35,
    systemPrompt: `You are an expert AI agent for Build OS. Execute assigned tasks to production quality. Respond with valid JSON ONLY.\n\nLANGUAGE LOCK: If this task requires code generation, use ONLY TypeScript (.ts, .tsx) or SQL (.sql). NEVER generate Go, Python, or any non-TypeScript language.`,
    outputInstructions: `{"summary":"...","output":{"content":"# Output\\n\\n...","format":"markdown"}}`,
  }

  const OPUS_ROLES = new Set(['architect'])
  const OPUS_TASK_TYPES = new Set(['schema', 'design'])
  const requiresOpus = OPUS_ROLES.has(agentRole) && OPUS_TASK_TYPES.has(taskType)
  const resolvedModel = requiresOpus ? MODEL_OPUS : MODEL_SONNET
  const resolvedMaxTokens = outputType === 'test' || outputType === 'review' ? 1024 : (roleConfig.maxTokens ?? 4096)

  return { ...roleConfig, model: resolvedModel, maxTokens: resolvedMaxTokens, outputType } as RoleConfig
}

// ── User message builder ──────────────────────────────────────────────────────

function buildUserMessage(payload: JobPayload, roleConfig: RoleConfig): string {
  const lines: string[] = []
  lines.push(`# Task: ${payload.task_name}`)
  lines.push(`**Task ID:** ${payload.task_id}`)
  lines.push(`**Agent Role:** ${payload.agent_role}`)
  lines.push(`**Task Type:** ${payload.task_type}`)
  lines.push('')

  if (payload.epic_title) {
    lines.push(`## Epic\n**${payload.epic_title}**`)
    if (payload.epic_description) lines.push(payload.epic_description)
    lines.push('')
  }

  if (payload.feature_title) {
    lines.push(`## Feature\n**${payload.feature_title}**`)
    if (payload.feature_description) lines.push(payload.feature_description)
    lines.push('')
  }

  lines.push(`## Task Description\n${payload.description || 'No additional description provided.'}`)
  lines.push('')

  if (payload.context_payload && Object.keys(payload.context_payload).length > 0) {
    lines.push('## Additional Context')
    const cp = payload.context_payload as Record<string, unknown>
    if (cp.source) lines.push(`- Source: ${cp.source}`)
    if (cp.epic_title) lines.push(`- Epic: ${cp.epic_title}`)
    if (cp.feature_title) lines.push(`- Feature: ${cp.feature_title}`)
    lines.push('')
  }

  if (payload.completed_dependencies && payload.completed_dependencies.length > 0) {
    lines.push('## Completed Dependencies (for reference)')
    payload.completed_dependencies.forEach(dep => {
      lines.push(`### ${dep.title} (${dep.agent_role} — ${dep.output_type})`)
      if (dep.description) lines.push(dep.description)
      lines.push(`Output summary: ${dep.output_summary}`)
      lines.push('')
    })
  }

  lines.push('## Platform Context')
  lines.push(`- Project: Build OS (${payload.project_id})`)
  lines.push('- Stack: Next.js 14 App Router + TypeScript + Supabase + Vercel')
  lines.push('- Execution: Railway Worker (no timeout constraint)')
  lines.push('')
  lines.push('## Required Output Format')
  lines.push(roleConfig.outputInstructions)

  return lines.join('\n')
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processJob(
  jobId: string,
  payload: JobPayload,
  workerId: string
): Promise<void> {
  const SUPABASE_URL      = process.env.SUPABASE_URL!
  const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
  const startedAt = new Date().toISOString()

  const admin = createClient(SUPABASE_URL, SUPABASE_KEY)

  // ── Mark job processing ───────────────────────────────────────────────────
  await admin.from('job_queue').update({
    status: 'processing',
    started_at: startedAt,
    worker_id: workerId,
  }).eq('id', jobId)

  console.log(`[processor] Starting job ${jobId} task=${payload.task_id} role=${payload.agent_role}`)

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const roleConfig = getRoleConfig(payload.agent_role, payload.task_type)
    const userMessage = buildUserMessage(payload, roleConfig)

    // ── Anthropic call (no timeout constraint on Railway) ─────────────────
    const response = await anthropic.messages.create({
      model: roleConfig.model,
      max_tokens: roleConfig.maxTokens,
      temperature: roleConfig.temperature,
      system: roleConfig.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    const tokensIn  = response.usage.input_tokens
    const tokensOut = response.usage.output_tokens
    const totalCost = (tokensIn * (COST_INPUT[roleConfig.model] ?? 3) + tokensOut * (COST_OUTPUT[roleConfig.model] ?? 15)) / 1_000_000

    console.log(`[processor] Anthropic done: ${tokensIn}→${tokensOut} tokens, $${totalCost.toFixed(6)}, model=${roleConfig.model}`)

    // ── Parse JSON output ─────────────────────────────────────────────────
    let parsed: Record<string, unknown> = {}
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      parsed = { summary: 'Output parse error', output: { content: rawText, format: 'text' } }
    }

    const completedAt = new Date().toISOString()

    // ── Update job_queue → completed ──────────────────────────────────────
    await admin.from('job_queue').update({
      status: 'completed',
      completed_at: completedAt,
    }).eq('id', jobId)

    // ── Build callback payload (same shape as n8n sends) ──────────────────
    const callbackPayload: CallbackPayload = {
      correlation_id: payload.correlation_id,
      task_run_id: payload.task_run_id,
      task_id: payload.task_id,
      status: 'success',
      output: parsed,
      execution_target: 'railway',
      completed_at: completedAt,
      agent_role: payload.agent_role,
      task_type: payload.task_type,
      idempotency_key: payload.idempotency_key,
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      model: roleConfig.model,
    }

    // ── POST signed callback ──────────────────────────────────────────────
    const { ok, error: cbErr } = await signAndPost(payload.callback_url, callbackPayload)
    if (!ok) {
      console.error(`[processor] Callback failed: ${cbErr}`)
      // Job is complete but callback failed — DLQ already handled in signAndPost
    } else {
      console.log(`[processor] Callback delivered for task=${payload.task_id}`)
    }

  } catch (err) {
    const errorMsg = String(err)
    console.error(`[processor] Job ${jobId} failed:`, errorMsg)

    // Update job_queue → failed
    await admin.from('job_queue').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMsg.slice(0, 1000),
    }).eq('id', jobId)

    // Post failure callback
    const callbackPayload: CallbackPayload = {
      correlation_id: payload.correlation_id,
      task_run_id: payload.task_run_id,
      task_id: payload.task_id,
      status: 'failure',
      output: {},
      error: errorMsg.slice(0, 500),
      execution_target: 'railway',
      completed_at: new Date().toISOString(),
      idempotency_key: payload.idempotency_key,
    }
    await signAndPost(payload.callback_url, callbackPayload).catch(() => {})
  }
}
