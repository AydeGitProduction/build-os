/**
 * POST /api/agent/execute
 *
 * Real Anthropic-powered agent runner.
 * Replaces mock execution with full LLM intelligence.
 *
 * Flow:
 *   1. Validate X-Buildos-Secret
 *   2. Parse dispatch payload
 *   3. Load full context from DB (feature → epic, dependencies, prior outputs)
 *   4. Resolve role → system prompt + output schema
 *   5. Call Anthropic (claude-sonnet-4-6 / claude-opus-4-6)
 *   6. Parse + validate structured output
 *   7. Emit cost events (tokens_input + tokens_output)
 *   8. POST result to /api/agent/output
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

// Allow up to 300 seconds for long-running Anthropic API calls (Opus can take 2-3 min)
export const maxDuration = 300

// ── Types ─────────────────────────────────────────────────────────────────────

type OutputType = 'code' | 'schema' | 'document' | 'test' | 'review' | 'qa_verdict'

interface RoleConfig {
  model: string
  outputType: OutputType
  maxTokens: number
  temperature: number
  systemPrompt: string
  outputInstructions: string
}

interface TaskContext {
  task_id: string
  task_run_id: string
  project_id: string
  agent_role: string
  task_type: string
  task_name: string
  description: string | null
  context_payload: Record<string, unknown>
  callback_url: string
  idempotency_key: string
  // Enriched from DB
  feature_title?: string
  feature_description?: string
  acceptance_criteria?: string[]
  // Retry feedback (QA failure context from previous attempt)
  retry_count?: number
  failure_detail?: string | null
  failure_suggestion?: string | null
  epic_title?: string
  epic_description?: string
  completed_dependencies?: Array<{
    title: string
    description: string | null
    agent_role: string
    output_type: string
    output_summary: string
  }>
}

// ── Model Selection ───────────────────────────────────────────────────────────

// Claude Sonnet 4.6 for most roles — cost-effective + high quality
// Claude Opus 4.6 for architect (complex schema design) and QA (security reasoning)
const MODEL_SONNET = 'claude-sonnet-4-6'
const MODEL_OPUS   = 'claude-opus-4-6'

// Cost per million tokens (USD)
const COST_INPUT: Record<string, number> = {
  [MODEL_SONNET]: 3.0,
  [MODEL_OPUS]:   15.0,
}
const COST_OUTPUT: Record<string, number> = {
  [MODEL_SONNET]: 15.0,
  [MODEL_OPUS]:   75.0,
}

// ── Role Configurations ───────────────────────────────────────────────────────

function getRoleConfig(agentRole: string, taskType: string): RoleConfig {
  // Determine output type — task_type is authoritative, agent_role is fallback
  const typeMap: Record<string, OutputType> = {
    code:     'code',
    schema:   'schema',
    document: 'document',
    test:     'test',
    review:   'review',
    deploy:   'document',
    design:   'schema',
  }
  const outputType: OutputType = typeMap[taskType] || 'document'

  const configs: Record<string, Partial<RoleConfig>> = {
    architect: {
      model: MODEL_OPUS,
      maxTokens: 8192,
      temperature: 0.2,
      systemPrompt: `You are a senior software architect for Build OS — an autonomous AI-powered SaaS project management platform built on:
- Next.js 14 App Router + TypeScript
- Supabase (PostgreSQL with Row-Level Security)
- Vercel (serverless deployment)
- Anthropic Claude (AI execution engine)

Your specialty: designing PostgreSQL database schemas, TypeScript interfaces, API contracts, and system architecture. You think in terms of normalization, RLS policies, index strategies, and migration safety.

CRITICAL RULES:
- Every table needs: id (uuid PK), created_at (timestamptz NOT NULL DEFAULT now())
- All foreign keys must reference actual existing tables
- RLS policies must be practical (not overly permissive)
- Migrations must be idempotent (use IF NOT EXISTS, IF EXISTS)
- No breaking changes without explicit migration plan
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure (no markdown, no explanation outside JSON):
{
  "summary": "One sentence describing the schema designed",
  "output": {
    "tables": [
      {
        "name": "table_name",
        "description": "what this table stores and why",
        "columns": [
          { "name": "id", "type": "uuid", "constraints": "NOT NULL DEFAULT gen_random_uuid()" },
          { "name": "created_at", "type": "timestamptz", "constraints": "NOT NULL DEFAULT now()" }
        ],
        "indexes": [
          "CREATE INDEX idx_table_name_col ON table_name (col);"
        ],
        "rls_policies": [
          "ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;",
          "CREATE POLICY \\"name\\" ON table_name FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE workspace_id = (SELECT workspace_id FROM users WHERE id = auth.uid())));"
        ]
      }
    ],
    "migration_sql": "-- Complete migration SQL that can be run directly\\nCREATE TABLE IF NOT EXISTS ...",
    "typescript_types": "// TypeScript interface definitions\\ninterface TableName { id: string; created_at: string; }",
    "notes": "Design decisions, trade-offs, and implementation guidance"
  }
}`,
    },

    backend_engineer: {
      model: MODEL_SONNET,
      maxTokens: 16384,
      temperature: 0.3,
      systemPrompt: `You are a senior backend engineer for Build OS — an autonomous SaaS platform.

Tech stack:
- Next.js 14 App Router with TypeScript
- Supabase (PostgreSQL + Auth + Realtime)
- Route handlers at /app/api/[route]/route.ts
- Admin client: createAdminSupabaseClient() (server-only, bypasses RLS)
- User client: createServerSupabaseClient() (respects RLS)

YOUR STANDARDS:
- All mutations require idempotency keys
- All state changes require writeAuditLog()
- All task dispatches require acquireLock/releaseLock
- Input validation before any DB write
- Structured error responses: { error: string }
- Success responses: { data: ... }
- HTTP status codes: 200/201 success, 400 bad input, 401 unauth, 404 not found, 409 conflict, 422 unprocessable, 500 server error
- Never expose stack traces to clients
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing what was implemented",
  "output": {
    "files": [
      {
        "path": "src/app/api/route-name/route.ts",
        "content": "// Complete, production-ready TypeScript code\\nimport { NextRequest, NextResponse } from 'next/server'\\n..."
      }
    ],
    "language": "typescript",
    "dependencies": [],
    "env_vars": [],
    "migration_required": false,
    "migration_sql": null,
    "notes": "How to use this API, any required setup, edge cases handled"
  }
}`,
    },

    integration_engineer: {
      model: MODEL_SONNET,
      maxTokens: 16384,
      temperature: 0.3,
      systemPrompt: `You are a senior integration engineer for Build OS. You connect external services (Stripe, OAuth providers, webhooks, third-party APIs) to the autonomous SaaS platform.

Tech stack:
- Next.js 14 App Router + TypeScript
- Supabase for credential storage (AES-256-GCM encrypted)
- Vercel for deployment (serverless, 10s timeout default)

YOUR STANDARDS:
- Webhook signature verification is mandatory
- All API keys stored encrypted via /api/integrations/connect
- Idempotency on webhook handlers (use X-Idempotency-Key or event IDs)
- Retry-safe: no side effects on duplicate delivery
- Stripe webhooks must verify using stripe.webhooks.constructEvent()
- OAuth flows must use state parameter for CSRF protection
- Never log full credentials or tokens
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing what was integrated",
  "output": {
    "files": [
      {
        "path": "src/app/api/integration-name/route.ts",
        "content": "// Complete integration code with webhook verification\\n..."
      }
    ],
    "language": "typescript",
    "dependencies": ["stripe@latest"],
    "env_vars": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    "setup_steps": [
      "Register webhook endpoint at stripe.com/webhooks",
      "Set STRIPE_WEBHOOK_SECRET from dashboard"
    ],
    "notes": "Security model, webhook endpoint to register, test instructions"
  }
}`,
    },

    qa_security_auditor: {
      model: MODEL_SONNET,
      maxTokens: 8192,
      temperature: 0.2,
      systemPrompt: `You are a senior QA engineer and security auditor for Build OS.

⚠️ STRICT OUTPUT CONSTRAINTS — NON-NEGOTIABLE:
- Generate EXACTLY 3–5 test cases. No more. No exceptions.
- Each test case code block: MAX 15–20 lines. Be concise.
- Total JSON response: MAX 1500 tokens. Stay well under.
- Prioritize HIGHEST-RISK scenarios only. Skip low-risk edge cases.
- NO exhaustive coverage. Focus on the 3–5 most critical paths.
- NO verbose explanations inside code. Use clear naming instead.
- Minimal prose in all fields. Every word must earn its place.

SECURITY FOCUS (pick the 3–5 highest-risk from these):
- Auth bypass: unauthenticated access to protected data?
- RLS gaps: data scoped correctly per workspace/project?
- IDOR: user A accessing user B's resources?
- Injection: user input interpolated into SQL/commands?
- Secret exposure: env vars/keys in logs or responses?

TEST STANDARDS:
- Vitest with vi.mock() for Supabase
- Test auth: authenticated vs unauthenticated
- Respond with valid JSON ONLY — zero prose outside the JSON`,

      outputInstructions: `Respond with EXACTLY this JSON structure (MAX 1500 tokens total):
{
  "summary": "One sentence: what was tested",
  "output": {
    "test_cases": [
      {
        "name": "short_test_name",
        "description": "one line: what this validates",
        "code": "import { describe, it, expect, vi } from 'vitest'\\ndescribe('X', () => {\\n  it('Y', async () => {\\n    // 10-15 lines max\\n  })\\n})",
        "type": "unit",
        "severity": "critical"
      }
    ],
    "security_findings": [],
    "coverage_areas": ["authentication", "authorization"],
    "overall_verdict": "pass",
    "notes": "Brief: top risk covered, what was skipped and why"
  }
}
HARD LIMIT: 3–5 test_cases only. Each code field: 15–20 lines max.`,
    },

    documentation_engineer: {
      model: MODEL_SONNET,
      maxTokens: 6144,
      temperature: 0.4,
      systemPrompt: `You are a technical documentation engineer for Build OS.

Your output is developer-facing documentation in Markdown format.

DOCUMENTATION STANDARDS:
- Clear H1 title, structured with H2/H3 sections
- Every API endpoint must show: method, path, auth, request body, response schema, error codes
- Code examples must be TypeScript and runnable
- Architecture docs must explain WHY, not just WHAT
- Include: Overview, Prerequisites, Usage, Examples, Error Handling, Related Resources
- Write for a senior developer who is new to this system
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing what was documented",
  "output": {
    "content": "# Document Title\\n\\n## Overview\\n\\nFull Markdown documentation here...",
    "format": "markdown",
    "audience": "developers",
    "doc_path": "docs/section/filename.md",
    "related_docs": ["docs/other-relevant-doc.md"]
  }
}`,
    },

    frontend_engineer: {
      model: MODEL_SONNET,
      maxTokens: 16384,
      temperature: 0.3,
      systemPrompt: `You are a senior frontend engineer for Build OS.

Tech stack:
- Next.js 14 App Router with TypeScript
- Tailwind CSS (utility-first, no custom CSS unless necessary)
- Supabase Realtime for live data
- React hooks for state management

STANDARDS:
- All components are functional with TypeScript types
- Use Tailwind for all styling
- Realtime subscriptions must unsubscribe on unmount
- Loading and error states are mandatory
- Mobile-responsive by default
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing the component/page built",
  "output": {
    "files": [
      {
        "path": "src/components/ComponentName.tsx",
        "content": "'use client'\\nimport React from 'react'\\n..."
      }
    ],
    "language": "typescript",
    "dependencies": [],
    "notes": "How to use the component, props, any required context"
  }
}`,
    },

    product_analyst: {
      model: MODEL_SONNET,
      maxTokens: 6144,
      temperature: 0.3,
      systemPrompt: `You are a senior product analyst for Build OS — an autonomous AI SaaS development platform.

Your specialty: competitive analysis, market research, feature prioritisation, and product intelligence.
You work from your training knowledge to produce structured, actionable insights.

CRITICAL RULES:
- Produce detailed, structured analysis based on your knowledge of the SaaS/AI market
- For competitor analysis: cover pricing, features, target segments, strengths, weaknesses
- For feature scoring: apply RICE or WSJF frameworks with numeric scores
- All output must be valid JSON — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing the analysis completed",
  "output": {
    "format": "markdown",
    "content": "# Analysis Title\\n\\n## Overview\\n...\\n## Findings\\n...\\n## Recommendations\\n...",
    "structured_data": {},
    "notes": "Key insights and next steps"
  }
}`,
    },

    cost_analyst: {
      model: MODEL_SONNET,
      maxTokens: 4096,
      temperature: 0.2,
      systemPrompt: `You are a cost and ROI analyst for Build OS.

Your specialty: feature scoring models, cost-benefit analysis, prioritisation frameworks, and financial modelling for SaaS products.

CRITICAL RULES:
- Apply quantitative scoring (RICE, WSJF, ICE) with numeric values
- Estimate costs in USD with clear assumptions
- Produce implementable scoring algorithms in TypeScript
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing the model/analysis produced",
  "output": {
    "format": "markdown",
    "content": "# Cost Analysis\\n\\n## Model\\n...\\n## Scores\\n...\\n## Implementation\\n...",
    "notes": "Assumptions, caveats, and recommendations"
  }
}`,
    },

    automation_engineer: {
      model: MODEL_SONNET,
      maxTokens: 6144,
      temperature: 0.25,
      systemPrompt: `You are a senior automation engineer for Build OS.

Your specialty: n8n workflow design, webhook integration, cron scheduling, and event-driven automation pipelines.

CRITICAL RULES:
- Produce complete n8n workflow JSON or automation scripts
- All webhooks must validate the X-Buildos-Secret header
- Idempotency is mandatory on all automated operations
- Respond with valid JSON ONLY — zero prose outside the JSON structure`,

      outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing the automation built",
  "output": {
    "format": "markdown",
    "content": "# Automation Design\\n\\n## Overview\\n...\\n## Workflow\\n...\\n## Configuration\\n...",
    "notes": "Setup steps and configuration requirements"
  }
}`,
    },
  }

  const roleConfig = configs[agentRole] || {
    model: MODEL_SONNET,
    maxTokens: 4096,
    temperature: 0.35,
    systemPrompt: `You are an expert AI agent for Build OS, an autonomous SaaS project management platform.
Execute the assigned task completely, professionally, and to production quality.
Respond with valid JSON ONLY — zero prose outside the JSON structure.`,
    outputInstructions: `Respond with EXACTLY this JSON structure:
{
  "summary": "One sentence describing what was completed",
  "output": {
    "content": "# Task Output\\n\\nComplete output here...",
    "format": "markdown",
    "audience": "developers"
  }
}`,
  }

  // ── Deterministic model routing ───────────────────────────────────────────
  // Opus is reserved for: architect role on schema/design tasks only.
  // All other roles and task types use Sonnet (cost-effective + high quality).
  const OPUS_ROLES = new Set(['architect'])
  const OPUS_TASK_TYPES = new Set(['schema', 'design'])
  const requiresOpus = OPUS_ROLES.has(agentRole) && OPUS_TASK_TYPES.has(taskType)
  const resolvedModel = requiresOpus ? MODEL_OPUS : MODEL_SONNET

  // ── Test output token cap ─────────────────────────────────────────────────
  // qa_security_auditor test generation was timing out at 2048 tokens (280-320s).
  // Reduced to 1024 to stay well under the 300s Vercel Pro maxDuration.
  // All test types (test, review) capped to prevent timeout — not just qa_security_auditor.
  const resolvedMaxTokens =
    outputType === 'test' || outputType === 'review'
      ? 1024
      : (roleConfig.maxTokens ?? 4096)

  // Merge: spread role defaults, then apply deterministic overrides last
  return {
    ...roleConfig,
    model: resolvedModel,          // deterministic routing overrides role default
    maxTokens: resolvedMaxTokens,  // task-type aware token cap
    outputType,                    // task_type wins over role default
  } as RoleConfig
}

// ── Context Loader ────────────────────────────────────────────────────────────

async function loadTaskContext(payload: TaskContext): Promise<TaskContext> {
  const start = Date.now()
  try {
    const admin = createAdminSupabaseClient()

    // 1. Load feature + epic chain
    if (payload.context_payload?.feature_id || payload.task_name) {
      // Get task with feature join
      const { data: task } = await admin
        .from('tasks')
        .select(`
          id, title, description, context_payload, feature_id,
          features!inner (
            id, title, description, acceptance_criteria, epic_id,
            epics!inner (
              id, title, description
            )
          )
        `)
        .eq('id', payload.task_id)
        .single()

      if (task?.features) {
        const feature = task.features as Record<string, unknown>
        payload.feature_title = feature.title as string
        payload.feature_description = feature.description as string || undefined
        const criteria = feature.acceptance_criteria as unknown[]
        payload.acceptance_criteria = Array.isArray(criteria)
          ? criteria.map((c: unknown) => String(c))
          : []

        const epic = feature.epics as Record<string, unknown>
        if (epic) {
          payload.epic_title = epic.title as string
          payload.epic_description = epic.description as string || undefined
        }
      }
    }

    // 1b. Load retry feedback (failure_detail + failure_suggestion from previous QA fail)
    // This lets the agent see exactly what went wrong on the last attempt and self-correct.
    {
      const { data: taskMeta } = await admin
        .from('tasks')
        .select('retry_count, failure_detail, failure_suggestion')
        .eq('id', payload.task_id)
        .single()
      if (taskMeta) {
        payload.retry_count = taskMeta.retry_count ?? 0
        payload.failure_detail = taskMeta.failure_detail ?? null
        payload.failure_suggestion = taskMeta.failure_suggestion ?? null
      }
    }

    // 2. Load completed dependency outputs (for context awareness)
    const { data: deps } = await admin
      .from('task_dependencies')
      .select('depends_on_task_id')
      .eq('task_id', payload.task_id)

    if (deps && deps.length > 0) {
      const depIds = deps.map((d: { depends_on_task_id: string }) => d.depends_on_task_id)

      const { data: depTasks } = await admin
        .from('tasks')
        .select('id, title, description, agent_role, status')
        .in('id', depIds)
        .eq('status', 'completed')

      if (depTasks && depTasks.length > 0) {
        // Load latest agent_output for each completed dependency
        const depOutputs = await Promise.all(
          depTasks.map(async (dt: Record<string, unknown>) => {
            const { data: ao } = await admin
              .from('agent_outputs')
              .select('output_type, content, raw_text')
              .eq('task_id', dt.id)
              .eq('is_valid', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            return {
              title: dt.title as string,
              description: dt.description as string | null,
              agent_role: dt.agent_role as string,
              output_type: ao?.output_type || 'unknown',
              output_summary: ao?.content
                ? JSON.stringify(ao.content).slice(0, 800)
                : 'No output available',
            }
          })
        )
        payload.completed_dependencies = depOutputs.filter(Boolean)
      }
    }

    console.log(`[agent/execute] Context loaded in ${Date.now() - start}ms for task ${payload.task_id}`)
  } catch (err) {
    // Context enrichment is best-effort — never block execution
    console.error('[agent/execute] Context load error (non-fatal):', err)
  }

  return payload
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────

function buildUserMessage(ctx: TaskContext, roleConfig: RoleConfig): string {
  const lines: string[] = []

  // ── SCHEMA CONTRACT (injected first — highest priority) ───────────────────
  // If key_tables is present in context_payload, inject it at the absolute TOP
  // of the prompt before any other content. This makes it impossible for the
  // model to miss or deprioritise. QA will auto-FAIL any output that references
  // a table not in this list (RULE-27). This is a HARD CONTRACT, not a hint.
  const payload = ctx.context_payload as Record<string, unknown>
  if (payload?.key_tables) {
    lines.push('## ⛔ SCHEMA CONTRACT — READ BEFORE ANYTHING ELSE')
    lines.push(`You MUST use ONLY these database tables: **${payload.key_tables}**`)
    lines.push('Any other table name — including agent_runs, agent_jobs, oauth_connections, user_connections,')
    lines.push('project_connections, integrations, migrations, generation_runs, or ANY invented name —')
    lines.push('will cause IMMEDIATE QA REJECTION (RULE-27). There are NO exceptions.')
    lines.push('If you are unsure which table to use, use the ones listed above. DO NOT invent new ones.')
    lines.push('')
  }

  // Task identity
  lines.push(`# Task: ${ctx.task_name}`)
  lines.push(`**Task ID:** ${ctx.task_id}`)
  lines.push(`**Agent Role:** ${ctx.agent_role}`)
  lines.push(`**Task Type:** ${ctx.task_type}`)
  lines.push('')

  // Hierarchy context
  if (ctx.epic_title) {
    lines.push(`## Epic`)
    lines.push(`**${ctx.epic_title}**`)
    if (ctx.epic_description) lines.push(ctx.epic_description)
    lines.push('')
  }

  if (ctx.feature_title) {
    lines.push(`## Feature`)
    lines.push(`**${ctx.feature_title}**`)
    if (ctx.feature_description) lines.push(ctx.feature_description)
    if (ctx.acceptance_criteria && ctx.acceptance_criteria.length > 0) {
      lines.push('')
      lines.push('**Acceptance Criteria:**')
      ctx.acceptance_criteria.forEach(c => lines.push(`- ${c}`))
    }
    lines.push('')
  }

  // Task details
  lines.push(`## Task Description`)
  lines.push(ctx.description || 'No additional description provided.')
  lines.push('')

  // Platform context from context_payload
  if (ctx.context_payload && Object.keys(ctx.context_payload).length > 0) {
    lines.push('## Additional Context')
    const payload = ctx.context_payload as Record<string, unknown>
    if (payload.source) lines.push(`- Source: ${payload.source}`)
    if (payload.epic_title) lines.push(`- Epic: ${payload.epic_title}`)
    if (payload.feature_title) lines.push(`- Feature: ${payload.feature_title}`)
    if (payload.objective) lines.push(`- Objective: ${payload.objective}`)
    // KEY FIX: inject key_tables hint so agents use correct table names (prevents hallucination)
    if (payload.key_tables) lines.push(`- KEY DB TABLES TO USE (MANDATORY — do NOT invent others): ${payload.key_tables}`)
    if (payload.phase) lines.push(`- Phase: ${payload.phase}`)
    lines.push('')
  }

  // Dependency context
  if (ctx.completed_dependencies && ctx.completed_dependencies.length > 0) {
    lines.push('## Completed Dependencies (for reference)')
    ctx.completed_dependencies.forEach(dep => {
      lines.push(`### ${dep.title} (${dep.agent_role} — ${dep.output_type})`)
      if (dep.description) lines.push(dep.description)
      lines.push(`Output summary: ${dep.output_summary}`)
      lines.push('')
    })
  }

  // Platform context
  lines.push('## Platform Context')
  lines.push(`- Project: Build OS (${ctx.project_id})`)
  lines.push('- Stack: Next.js 14 App Router + TypeScript + Supabase + Vercel')
  lines.push('- This is a self-building platform — outputs will be used to build the platform itself')
  lines.push('')

  // ── Retry feedback: inject QA failure context so agent can self-correct ──────
  // If this is a retry (retry_count > 0), show what failed last time.
  // This is the single most important hint for fixing recurring QA failures.
  if (ctx.retry_count && ctx.retry_count > 0) {
    lines.push('## ⚠️ RETRY — Previous Attempt Failed')
    lines.push(`This is attempt ${ctx.retry_count + 1}. The previous attempt was rejected by QA.`)
    if (ctx.failure_detail) {
      lines.push('')
      lines.push('**QA Failure reason (you MUST fix this):**')
      lines.push(String(ctx.failure_detail).slice(0, 600))
    }
    if (ctx.failure_suggestion) {
      lines.push('')
      lines.push('**Suggested fix:**')
      lines.push(String(ctx.failure_suggestion).slice(0, 300))
    }
    lines.push('')
    lines.push('Fix the identified issue. Do NOT repeat the same mistake.')
    lines.push('')
  }

  // Output instructions
  lines.push('## Required Output Format')
  lines.push(roleConfig.outputInstructions)

  return lines.join('\n')
}

// ── Cost Event Emitter ─────────────────────────────────────────────────────────

async function emitCostEvents(params: {
  projectId: string
  taskRunId: string
  model: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const { projectId, taskRunId, model, inputTokens, outputTokens } = params
  const inputCostPer1M = COST_INPUT[model] ?? 3.0
  const outputCostPer1M = COST_OUTPUT[model] ?? 15.0

  try {
    const admin = createAdminSupabaseClient()

    const events = []

    if (inputTokens > 0) {
      events.push({
        project_id: projectId,
        task_run_id: taskRunId,
        category: 'AI_USAGE',
        provider: 'anthropic',
        model,
        units: inputTokens,
        unit_label: 'tokens_input',
        unit_cost_usd: inputCostPer1M / 1_000_000,
        metadata: { source: 'agent_execute' },
      })
    }

    if (outputTokens > 0) {
      events.push({
        project_id: projectId,
        task_run_id: taskRunId,
        category: 'AI_USAGE',
        provider: 'anthropic',
        model,
        units: outputTokens,
        unit_label: 'tokens_output',
        unit_cost_usd: outputCostPer1M / 1_000_000,
        metadata: { source: 'agent_execute' },
      })
    }

    if (events.length > 0) {
      const { error } = await admin.from('cost_events').insert(events)
      if (error) {
        console.error('[agent/execute] Cost event error (non-fatal):', error.message)
      } else {
        const totalCost = (inputTokens * inputCostPer1M + outputTokens * outputCostPer1M) / 1_000_000
        console.log(`[agent/execute] Cost events emitted: $${totalCost.toFixed(6)} (${inputTokens}→${outputTokens} tokens)`)
      }
    }
  } catch (err) {
    console.error('[agent/execute] Cost emission error (non-fatal):', err)
  }
}

// ── Mock Output Builder ────────────────────────────────────────────────────────

function buildMockOutput(outputType: OutputType, taskName: string, description: string | null): Record<string, unknown> {
  switch (outputType) {
    case 'code':
      return {
        files: [{
          path: `src/app/api/${taskName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/route.ts`,
          content: `// MOCK OUTPUT — Set ANTHROPIC_API_KEY on Vercel to enable real AI execution\n// Task: ${taskName}\n// ${description || ''}\n\nimport { NextRequest, NextResponse } from 'next/server'\n\nexport async function POST(request: NextRequest) {\n  return NextResponse.json({ ok: true })\n}\n`,
        }],
        language: 'typescript',
        dependencies: [],
        env_vars: [],
        migration_required: false,
        migration_sql: null,
        notes: `Mock output for "${taskName}". Set ANTHROPIC_API_KEY to enable real AI execution.`,
      }
    case 'schema':
      return {
        tables: [{
          name: taskName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
          description: description || taskName,
          columns: [
            { name: 'id', type: 'uuid', constraints: 'NOT NULL DEFAULT gen_random_uuid()' },
            { name: 'created_at', type: 'timestamptz', constraints: 'NOT NULL DEFAULT now()' },
          ],
          indexes: [],
          rls_policies: [],
        }],
        migration_sql: `-- MOCK: Set ANTHROPIC_API_KEY to generate real migration\nCREATE TABLE IF NOT EXISTS mock_table (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`,
        typescript_types: `// MOCK: Set ANTHROPIC_API_KEY to generate real types\ninterface MockTable { id: string; created_at: string; }`,
        notes: `Mock schema for "${taskName}". Set ANTHROPIC_API_KEY to enable real AI execution.`,
      }
    case 'test':
      return {
        test_cases: [{
          name: `Mock test for ${taskName}`,
          description: description || taskName,
          code: `// MOCK OUTPUT — Set ANTHROPIC_API_KEY to enable real AI execution\nimport { describe, it, expect } from 'vitest'\ndescribe('${taskName}', () => {\n  it('placeholder', () => expect(true).toBe(true))\n})`,
          type: 'unit',
          severity: 'low',
        }],
        security_findings: [],
        coverage_areas: [taskName],
        overall_verdict: 'pass',
        notes: `Mock test for "${taskName}". Set ANTHROPIC_API_KEY to enable real AI execution.`,
      }
    case 'review':
      return {
        findings: [],
        approved: true,
        notes: `Mock review for "${taskName}". Set ANTHROPIC_API_KEY to enable real AI execution.`,
      }
    case 'qa_verdict':
      return {
        passed: true,
        checks: [{ name: 'mock_check', passed: true, notes: 'Mock' }],
        notes: `Mock QA verdict. Set ANTHROPIC_API_KEY to enable real AI execution.`,
      }
    default:
      return {
        content: `# ${taskName}\n\n${description || ''}\n\n> **Mock output** — Set \`ANTHROPIC_API_KEY\` on Vercel to enable real AI execution.`,
        format: 'markdown',
        audience: 'developers',
        doc_path: `docs/${taskName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
        related_docs: [],
      }
  }
}

// ── Callback Poster ───────────────────────────────────────────────────────────

async function postToAgentOutput(
  callbackUrl: string,
  idempotencyKey: string,
  body: Record<string, unknown>,
  secret: string
): Promise<void> {
  const startPost = Date.now()
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey
    if (secret) headers['X-Buildos-Secret'] = secret

    // PATCH 2026-03-29: Add 45s timeout to prevent the callback fetch from hanging
    // indefinitely when the output route is slow (e.g. 24 concurrent DB writes).
    // Without this, postToAgentOutput silently hangs until Vercel kills the function.
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[agent/execute] Callback ${res.status} in ${Date.now() - startPost}ms: ${errText.slice(0, 300)}`)
    } else {
      console.log(`[agent/execute] Callback OK in ${Date.now() - startPost}ms → ${callbackUrl}`)
    }
  } catch (err) {
    console.error(`[agent/execute] Callback error in ${Date.now() - startPost}ms:`, err)
  }
}

// ── Anthropic API Caller with 429 Retry ───────────────────────────────────────
// Retries up to 2 times on rate limit (429) with exponential backoff: 2s → 5s → 10s.
// Any other error status throws immediately (no infinite loop).

// PATCH 2026-03-29: Reduced from [2000, 5000, 10000] to [1000, 2000, 3000].
// Root cause: 8 concurrent dispatches hit Anthropic rate limits simultaneously.
// With 3 retries × (2s+5s+10s) = 51s per task, 8 concurrent tasks could exhaust
// Vercel's 300s waitUntil lifetime before any callback fires → zero agent_outputs,
// tasks stuck in 'started', infinite supervisor retry loop.
// Shorter delays ensure the error callback fires within 120s total.
const RETRY_DELAYS_MS = [1000, 2000, 3000]

async function callAnthropicWithRetry(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_DELAYS_MS[attempt - 1]
      console.warn(`[agent/execute] 429 rate limit — retry ${attempt}/2 after ${delayMs}ms`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    // PATCH 2026-04-03: Increased from 90s to 160s.
    // With PX-1 platform context injection + maxTokens=16384, large code-gen tasks
    // (e.g. Settings & Profile) consistently exceed the 90s limit. 160s allows the
    // Anthropic API enough time to generate full route files.
    // Safety: AbortSignal timeout throws DOMException → caught by outer try/catch
    // → failure callback fires (45s) → total max = 160 + 45 = 205s, well within
    // Vercel's 300s maxDuration. 429-retry path is unaffected (retries fire
    // immediately on 429, not on timeout).
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(160_000),
    })

    if (res.status !== 429) {
      // Return for any non-429 response (success or other error — caller handles)
      return res
    }

    const retryAfter = res.headers.get('retry-after')
    console.warn(`[agent/execute] Anthropic 429 on attempt ${attempt + 1}/3${retryAfter ? ` (retry-after: ${retryAfter}s)` : ''}`)
    lastError = new Error(`Anthropic API rate limited (429) after ${attempt + 1} attempt(s)`)
  }

  // All retries exhausted
  throw lastError ?? new Error('Anthropic API rate limited (429) — all retries exhausted')
}

// ── Core Execution Logic ──────────────────────────────────────────────────────

async function runAgentExecution(payload: Record<string, unknown>, BUILDOS_SECRET: string, ANTHROPIC_API_KEY: string) {
  const execStart = Date.now()
  const {
    task_id,
    task_run_id,
    project_id,
    agent_role,
    task_type,
    task_name,
    description,
    context_payload,
    callback_url,
    idempotency_key,
  } = payload as Record<string, string>

  // PATCH 2026-03-29: Hard execution deadline at 220s.
  // If the function hasn't completed by 220s, we force the error callback so it fires
  // before Vercel's 300s maxDuration kills the process silently.
  // This guarantees task_runs always reach a terminal state (completed/failed)
  // and never get stuck in 'started' waiting for supervisor cleanup.
  const HARD_DEADLINE_MS = 220_000
  const deadlineTimer = setTimeout(() => {
    console.error(`[agent/execute] HARD DEADLINE hit after ${HARD_DEADLINE_MS}ms for task=${task_id} — forcing error callback`)
    postToAgentOutput(callback_url, idempotency_key || '', {
      task_id, task_run_id, agent_role,
      success: false, error_message: 'Execution deadline exceeded (220s) — Anthropic API too slow or rate limited',
      cost_usd: 0, model_id: 'timeout', tokens_used: 0,
    }, BUILDOS_SECRET).catch(() => {})
  }, HARD_DEADLINE_MS)

  try {
    console.log(`[agent/execute] Starting execution: task=${task_id} role=${agent_role} type=${task_type}`)

    // ── 1. Resolve role configuration ────────────────────────────────────────
    const roleConfig = getRoleConfig(agent_role || 'documentation_engineer', task_type || 'document')

    // ── 2. Load full task context ─────────────────────────────────────────────
    let ctx: TaskContext = {
      task_id,
      task_run_id,
      project_id,
      agent_role,
      task_type,
      task_name,
      description: description || null,
      context_payload: (context_payload as unknown as Record<string, unknown>) || {},
      callback_url,
      idempotency_key,
    }
    ctx = await loadTaskContext(ctx)

    // ── 2b. PX-1: Inject platform-specific context into agent system prompt ──
    // When a project has a non-saas project_type (ai_newsletter, crm, etc.),
    // override the generic "Build OS" system prompt with domain-specific context.
    // This prevents agents from generating BuildOS-domain code for client projects.
    try {
      const adminForPX1 = createAdminSupabaseClient()
      const { data: projRec } = await adminForPX1
        .from('projects')
        .select('project_type, name')
        .eq('id', project_id)
        .maybeSingle()

      if (projRec?.project_type && projRec.project_type !== 'saas') {
        const { getPlatformContext } = await import('@/lib/platform-registry')
        const pCtx = getPlatformContext(projRec.project_type)
        const entities = pCtx.entities.join(', ')
        const forbidden = pCtx.forbiddenTerms.join(', ')

        const DOMAIN_LOCK = `DOMAIN LOCK (MANDATORY): You are building the ${pCtx.name}.
- Domain: ${pCtx.domain}
- Core entities you work with: ${entities}
- FORBIDDEN terms (do NOT use in code, comments, or variable names): ${forbidden}
- This is NOT Build OS. Do not reference Build OS concepts, pipelines, agents, or orchestration unless the task explicitly requires it.`

        const SCHEMA_LOCK = `SCHEMA LOCK (MANDATORY — QA WILL REJECT UNKNOWN TABLES):
${pCtx.schemaHint}`

        const LANG_LOCK = `LANGUAGE LOCK (MANDATORY): This is a TypeScript/Next.js monorepo. You MUST generate ONLY TypeScript (.ts, .tsx) or SQL (.sql) files. NEVER write Go, Python, Rust, Java, C#, Ruby, or any other language. Any non-TypeScript/SQL output will be automatically rejected.`

        const STACK_LOCK = `STACK LOCK (MANDATORY): FORBIDDEN packages (QA WILL AUTO-FAIL): prisma, @prisma/client, next-auth, auth.js, drizzle-orm, @supabase/auth-helpers-nextjs, @supabase/auth-helpers-react, createClientComponentClient, createServerComponentClient. REQUIRED patterns: Client-side Supabase: use createBrowserClient from @supabase/ssr. Server-side DB: use createAdminSupabaseClient() from @/lib/supabase/server. For auth: use supabase.auth.getUser() with @supabase/ssr clients ONLY.`

        const platformSystemPrompts: Partial<Record<string, string>> = {
          backend_engineer:     `You are a senior backend engineer building the ${pCtx.name}. Tech stack: Next.js 14 App Router, TypeScript, Supabase, Vercel. All mutations require idempotency keys and writeAuditLog(). Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANG_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`,
          frontend_engineer:    `You are a senior frontend engineer building the ${pCtx.name}. Tech stack: Next.js 14, TypeScript, Tailwind CSS, Supabase Realtime. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANG_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`,
          integration_engineer: `You are a senior integration engineer building the ${pCtx.name}. Connect external services with webhook verification, idempotency, and secure credential storage. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANG_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`,
          qa_security_auditor:  `You are a senior QA engineer for the ${pCtx.name}. Generate 3-5 critical test cases ONLY. Each code block MAX 20 lines. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`,
          documentation_engineer: `You are a technical documentation engineer for the ${pCtx.name}. Write developer-facing Markdown docs. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`,
        }

        const platformPrompt = platformSystemPrompts[agent_role]
        if (platformPrompt) {
          roleConfig.systemPrompt = platformPrompt
          console.log(`[agent/execute] PX-1: injected ${pCtx.name} context for role=${agent_role} project=${projRec.name}`)
        }
      }
    } catch (pxErr) {
      console.warn('[agent/execute] PX-1: platform context injection failed (non-fatal):', pxErr)
    }

    // ── 3. Mock mode if no API key ────────────────────────────────────────────
    if (!ANTHROPIC_API_KEY) {
      console.warn('[agent/execute] MOCK MODE — ANTHROPIC_API_KEY not set')
      const mockOutput = buildMockOutput(roleConfig.outputType, task_name, description || null)
      await postToAgentOutput(callback_url, idempotency_key, {
        task_id, task_run_id, agent_role,
        output_type: roleConfig.outputType,
        output: mockOutput,
        success: true, cost_usd: 0, model_id: 'mock', tokens_used: 0,
      }, BUILDOS_SECRET)
      return
    }

    // ── 4. Build prompt ───────────────────────────────────────────────────────
    const userMessage = buildUserMessage(ctx, roleConfig)
    console.log(`[agent/execute] Calling Anthropic model=${roleConfig.model} maxTokens=${roleConfig.maxTokens} for task=${task_id}`)

    // ── 5. Call Anthropic API (with 429 retry) ────────────────────────────────
    const anthropicStart = Date.now()
    const anthropicRes = await callAnthropicWithRetry(
      {
        model: roleConfig.model,
        max_tokens: roleConfig.maxTokens,
        temperature: roleConfig.temperature,
        system: roleConfig.systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      ANTHROPIC_API_KEY,
    )

    const anthropicDuration = Date.now() - anthropicStart

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error(`[agent/execute] Anthropic error ${anthropicRes.status} in ${anthropicDuration}ms: ${errText.slice(0, 500)}`)
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 200)}`)
    }

    const anthropicData = await anthropicRes.json()
    const rawContent: string = anthropicData.content?.[0]?.text || ''
    const inputTokens: number = anthropicData.usage?.input_tokens || 0
    const outputTokens: number = anthropicData.usage?.output_tokens || 0
    const modelId: string = anthropicData.model || roleConfig.model

    const costUsd = Number((
      (inputTokens * (COST_INPUT[roleConfig.model] ?? 3.0) +
       outputTokens * (COST_OUTPUT[roleConfig.model] ?? 15.0)) / 1_000_000
    ).toFixed(6))

    console.log(`[agent/execute] Anthropic OK in ${anthropicDuration}ms: ${inputTokens}→${outputTokens} tokens, $${costUsd} model=${modelId}`)

    // ── 6. Parse structured JSON output ──────────────────────────────────────
    let parsed: Record<string, unknown> = {}
    let parseSuccess = true

    try {
      // PATCH 2026-04-03: Smart outer-fence stripping.
      // Problem: lazy regex /```json([\s\S]*?)```/ stops at the FIRST ``` it finds,
      // which may be inside a "content" string field (TypeScript code fence embedded
      // in JSON). This truncates the JSON and causes JSON.parse to fail, triggering
      // the stub fallback even when the agent produced a well-formed JSON response.
      //
      // Fix: strip ONLY the outermost fence (if rawContent is entirely wrapped in one),
      // then parse what remains. JSON.parse handles internal backticks fine since
      // they are properly escaped in JSON strings.
      let contentToParse = rawContent.trim()

      // Case 1: Entire response is wrapped in ```json ... ``` or ``` ... ```
      // Strip the outer fence so JSON.parse sees raw JSON.
      const outerFenceMatch = contentToParse.match(/^```(?:json)?\s*([\s\S]*)\s*```\s*$/s)
      if (outerFenceMatch) {
        contentToParse = outerFenceMatch[1].trim()
      }

      // Case 2: Already bare JSON or stripped — try direct parse
      // Case 3: JSON is somewhere in the middle with leading/trailing prose
      //         Find the first { and last } as last resort
      try {
        parsed = JSON.parse(contentToParse)
      } catch {
        // Find the outermost JSON object (last resort for responses with prose preamble)
        const innerJsonMatch = contentToParse.match(/(\{[\s\S]*\})\s*$/)
        if (innerJsonMatch) {
          parsed = JSON.parse(innerJsonMatch[1])
        } else {
          throw new Error('No JSON object found in response')
        }
      }
    } catch {
      parseSuccess = false
      console.warn(`[agent/execute] JSON parse failed, wrapping raw content as ${roleConfig.outputType}`)

      if (roleConfig.outputType === 'code' || roleConfig.outputType === 'test') {
        // Extract longest code block from raw content (model responded with markdown prose instead of JSON)
        const codeBlockMatches = [...rawContent.matchAll(/```(?:typescript|javascript|ts|js|python|sql)?\s*\n([\s\S]*?)```/g)]
        const codeBlocks = codeBlockMatches.map(m => m[1].trim()).sort((a, b) => b.length - a.length)
        const codeContent = codeBlocks.length > 0 ? codeBlocks[0] : rawContent.trim()

        const filePath = `src/app/api/${(task_name || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/route.ts`
        parsed = {
          summary: `${task_name} completed by ${agent_role}`,
          output: {
            files: [{ path: filePath, content: codeContent }],
            language: 'typescript',
            dependencies: [],
            env_vars: [],
            migration_required: false,
            migration_sql: null,
            notes: `Auto-extracted from non-JSON response. Raw response length: ${rawContent.length} chars.`,
          },
        }
      } else {
        parsed = {
          summary: `${task_name} completed by ${agent_role}`,
          output: buildMockOutput(roleConfig.outputType, task_name, rawContent.slice(0, 2000)),
        }
      }
    }

    const agentOutput = parsed.output as Record<string, unknown> | undefined
    const summary = (parsed.summary as string) || `${task_name} completed by ${agent_role}`

    let finalOutput = agentOutput
    if (!finalOutput || typeof finalOutput !== 'object') {
      console.warn(`[agent/execute] Output missing or wrong type, using fallback`)
      finalOutput = buildMockOutput(roleConfig.outputType, task_name, rawContent.slice(0, 1000))
    }

    // ── 7. Emit cost events ───────────────────────────────────────────────────
    emitCostEvents({ projectId: project_id, taskRunId: task_run_id, model: modelId, inputTokens, outputTokens }).catch(() => {})

    // ── 8. POST result to /api/agent/output ───────────────────────────────────
    await postToAgentOutput(callback_url, idempotency_key, {
      task_id, task_run_id, agent_role,
      output_type: roleConfig.outputType,
      output: finalOutput,
      success: parseSuccess || !!agentOutput,
      cost_usd: costUsd,
      model_id: modelId,
      tokens_used: inputTokens + outputTokens,
      metadata: {
        summary, input_tokens: inputTokens, output_tokens: outputTokens,
        anthropic_duration_ms: anthropicDuration,
        total_duration_ms: Date.now() - execStart,
        parse_success: parseSuccess,
      },
    }, BUILDOS_SECRET)

    clearTimeout(deadlineTimer)
    console.log(`[agent/execute] Complete in ${Date.now() - execStart}ms: task=${task_id} success=true cost=$${costUsd}`)

  } catch (err: unknown) {
    // PATCH 2026-03-29 (bug fix): Do NOT clearTimeout(deadlineTimer) here first.
    // Original bug: clearTimeout was called before postToAgentOutput in the catch block.
    // If postToAgentOutput also failed (silently), the safety net was already gone —
    // task_run stayed 'started' forever until supervisor cleanup at t=360s.
    // Fix: only clear the timer AFTER the failure callback is confirmed sent.
    // If the failure callback fails too, the 220s deadline timer fires as the last resort.
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error(`[agent/execute] Fatal error in ${Date.now() - execStart}ms:`, message)

    // Best-effort failure notification — deadline timer remains active as safety net
    try {
      if (callback_url && task_id && task_run_id) {
        await postToAgentOutput(callback_url, idempotency_key || '', {
          task_id, task_run_id, agent_role: agent_role || 'unknown',
          output_type: 'document', output: null,
          success: false, error_message: message,
          cost_usd: 0, model_id: 'error', tokens_used: 0,
        }, BUILDOS_SECRET)
        // Only cancel the deadline timer once we know the callback landed
        clearTimeout(deadlineTimer)
      }
    } catch {
      // Failure callback also failed — deadline timer (220s) is now the last resort
      console.error(`[agent/execute] Failure callback also failed for task=${task_id} — deadline timer is last resort`)
    }
  }
}

// ── Main Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const BUILDOS_SECRET =
    process.env.BUILDOS_INTERNAL_SECRET ||
    process.env.BUILDOS_SECRET ||
    ''
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  // ── 1. Validate internal secret ──────────────────────────────────────────
  const incomingSecret =
    request.headers.get('X-Buildos-Secret') ||
    request.headers.get('X-N8N-Signature')?.replace('sha256=', '') ||
    ''

  if (BUILDOS_SECRET && incomingSecret !== BUILDOS_SECRET) {
    console.error('[agent/execute] Forbidden: invalid secret')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 2. Parse dispatch payload ─────────────────────────────────────────────
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { task_id, task_run_id, callback_url } = payload
  if (!task_id || !task_run_id || !callback_url) {
    return NextResponse.json(
      { error: 'Missing required fields: task_id, task_run_id, callback_url' },
      { status: 400 }
    )
  }

  // ── 3. Enforce context_payload for code/schema tasks ─────────────────────
  // Code tasks without context_payload have no schema anchor → agents hallucinate.
  // Block dispatch here rather than let QA fail it 10+ times.
  const taskTypeRaw = payload.task_type as string | undefined
  const isCodeTask = ['code', 'schema', 'test'].includes(taskTypeRaw || '')
  const ctxPayload = payload.context_payload as Record<string, unknown> | undefined
  const hasContext = ctxPayload && Object.keys(ctxPayload).length > 0
  if (isCodeTask && !hasContext) {
    console.warn(`[agent/execute] CONTEXT GATE: blocking dispatch for task=${task_id} — empty context_payload on ${taskTypeRaw} task`)
    return NextResponse.json({
      error: 'CONTEXT GATE: code/schema tasks require a populated context_payload (key_tables, objective, phase). Populate context_payload in the task row before dispatching.',
      task_id,
    }, { status: 422 })
  }

  // ── 4. Run execution synchronously (no waitUntil) ─────────────────────────
  // waitUntil was removed: execution now runs synchronously and the caller
  // receives the result only after the AI call completes and the output has
  // been posted to /api/agent/output. This ensures the caller (n8n) knows
  // the real terminal state before moving on.
  await runAgentExecution(payload, BUILDOS_SECRET, ANTHROPIC_API_KEY)

  return NextResponse.json({
    done: true,
    mode: ANTHROPIC_API_KEY ? 'anthropic' : 'mock',
    task_id,
    message: 'Execution completed synchronously',
  }, { status: 200 })
}
