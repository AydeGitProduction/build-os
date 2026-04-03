/**
 * processor.ts — WS-B: Railway job processor
 *
 * Mirrors apps/web/src/app/api/agent/execute/route.ts but:
 * - No 300s Vercel timeout — Railway can run as long as needed
 * - Pulls job from job_queue (DB) instead of HTTP request
 * - Posts result via signAndPost() with HMAC signature
 * - Updates job_queue status throughout
 *
 * PLATFORM CONTEXT (PX-1):
 * Before dispatching to Claude, we fetch the project record from Supabase
 * to read project_type, name, and description. This is fed into
 * getPlatformContext() to inject domain-specific terminology into every
 * agent system prompt and user message. Agents no longer hard-code
 * "Build OS" — they understand what product they are building.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signAndPost } from './callback'
import type { JobPayload, CallbackPayload } from './types'
import { getPlatformContext } from './platform-registry'
import type { PlatformContext } from './platform-registry'

const MODEL_SONNET = 'claude-sonnet-4-6'
const MODEL_OPUS   = 'claude-opus-4-6'

const COST_INPUT:  Record<string, number> = { [MODEL_SONNET]: 3.0,  [MODEL_OPUS]: 15.0 }
const COST_OUTPUT: Record<string, number> = { [MODEL_SONNET]: 15.0, [MODEL_OPUS]: 75.0 }

// ── WS3: BuildOS internal schema (BuildOS platform itself) ───────────────────
// Used ONLY when building BuildOS. Client platforms use their own schemaHint
// from the platform registry.
const BUILDOS_SCHEMA_SNAPSHOT = `
REAL DATABASE TABLES (use ONLY these — any other table will cause QA FAIL):
agent_outputs, answers, api_contracts, architecture_decisions, artifacts,
audit_logs, blocked_reason_codes, blockers, blueprint_features,
blueprint_stack_recommendations, blueprints, cost_estimates, cost_events,
cost_models, credentials, cutover_flags, dead_letter_queue,
delivery_checkpoints, deployment_targets, documents, domains, epics,
features, file_locks, gate_policies, generation_events, handoff_events,
idempotency_keys, incident_fixes, incident_root_causes, incidents,
integration_environment_credentials, integration_providers, job_queue,
jsonb_output_schemas, manual_override_log, migration_ledger,
orchestration_runs, organization_members, organizations, prevention_rules,
project_environments, project_files, project_integrations, project_members,
project_settings, project_tech_stack_items, projects, qa_results,
qa_verdicts, questionnaires, recommendation_items, recommendation_reports,
reconciliation_events, release_gate_checks, release_readiness,
resource_locks, retry_logs, settings_changes,
shadow_results, state_ownership_registry, system_incidents,
task_delivery_gates, task_dependencies, task_events, task_runs, tasks,
users, worker_heartbeats, workspace_members, workspaces

FORBIDDEN (do NOT reference — these tables do NOT exist in the database):
distributed_locks, activity_log, ai_usage, sessions, user_sessions,
refresh_tokens, verification_tokens, accounts, profiles, roles,
permissions, subscriptions, payments, invoices, notifications,
messages, conversations, channels, members, teams,
schema_registry, oauth_connections, generation_tasks, generation_runs,
_migrations_noop, _schema_migrations, schema_migrations, _migrations, migration_log
`.trim()

// ── Role configs ──────────────────────────────────────────────────────────────

type OutputType = 'code' | 'schema' | 'document' | 'test' | 'review' | 'qa_verdict'

interface RoleConfig {
  model: string
  outputType: OutputType
  maxTokens: number
  temperature: number
  systemPrompt: string
  outputInstructions: string
}

// ── PX-1: Build platform-aware system prompts ─────────────────────────────────
//
// Every role prompt now receives:
//   - {PLATFORM}     → platform name, e.g. "AI Newsletter Platform"
//   - {DOMAIN}       → domain context, e.g. "email marketing & AI content generation"
//   - {ENTITIES}     → domain entity list, e.g. "Campaign, Subscriber, Template..."
//   - {SCHEMA_LOCK}  → platform-specific schema hint (or BuildOS schema if null)
//   - {FILE_PATHS}   → platform-specific file path rules
//   - {FORBIDDEN}    → domain terms to avoid, preventing BuildOS terminology leakage

function buildSystemPrompt(
  role: string,
  platformCtx: PlatformContext,
  schemaSnapshot: string,
): string {
  const entities = platformCtx.entities.join(', ')
  const forbidden = platformCtx.forbiddenTerms.join(', ')

  const LANGUAGE_LOCK = `
LANGUAGE LOCK (MANDATORY): This is a TypeScript/Next.js monorepo. You MUST generate ONLY TypeScript (.ts, .tsx) or SQL (.sql) files. NEVER write Go, Python, Rust, Java, C#, Ruby, or any other language under any circumstances. Any non-TypeScript/SQL output will be automatically rejected. Every file must have a .ts, .tsx, or .sql extension.`.trim()

  const STACK_LOCK = `
STACK LOCK (MANDATORY — QA WILL REJECT VIOLATIONS): FORBIDDEN packages: prisma, @prisma/client, next-auth, next-auth/, auth.js, better-auth, drizzle-orm, @supabase/auth-helpers-nextjs, @supabase/auth-helpers-shared, createClientComponentClient, createServerComponentClient, createRouteHandlerClient. REQUIRED patterns: For server-side DB/auth use createAdminSupabaseClient() from @/lib/supabase/server. For client-side use createBrowserClient() from @supabase/ssr. For auth use supabase.auth.getUser() and supabase.auth.getSession(). NEVER use deprecated auth-helpers packages.`.trim()

  const FRONTEND_PATH_RULES = `
FILE PATH RULES (MANDATORY): Place files in the correct Next.js location for their type:
- React pages: src/app/(dashboard)/page-name/page.tsx
- React components: src/components/ComponentName.tsx
- React hooks: src/hooks/useHookName.ts
- Layout files: src/app/layout.tsx or src/app/(group)/layout.tsx
- NEVER put UI components or pages in src/app/api/ — that directory is for API routes ONLY.
Always use the semantically correct path for what you are building.
${platformCtx.filePathRules ? `\nPLATFORM-SPECIFIC PATHS:\n${platformCtx.filePathRules}` : ''}`.trim()

  const DOMAIN_LOCK = `
DOMAIN LOCK (MANDATORY): You are building the ${platformCtx.name}.
- Domain: ${platformCtx.domain}
- Core entities you work with: ${entities}
- FORBIDDEN terms (do NOT use these in code, comments, or variable names): ${forbidden}
- This is NOT Build OS. Do not reference Build OS concepts, pipelines, agents, or orchestration unless the task explicitly requires it.`.trim()

  const SCHEMA_LOCK = `
SCHEMA LOCK (MANDATORY — QA WILL REJECT UNKNOWN TABLES):
${schemaSnapshot}`.trim()

  switch (role) {
    case 'architect':
      return `You are a senior software architect building the ${platformCtx.name} — a ${platformCtx.domain} platform. Your specialty: PostgreSQL schemas, TypeScript interfaces, API contracts, and system architecture. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${SCHEMA_LOCK}`

    case 'backend_engineer':
      return `You are a senior backend engineer building the ${platformCtx.name}. Tech stack: Next.js 14 App Router, TypeScript, Supabase, Vercel. All mutations require idempotency keys and writeAuditLog(). Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANGUAGE_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`

    case 'frontend_engineer':
      return `You are a senior frontend engineer building the ${platformCtx.name}. Tech stack: Next.js 14, TypeScript, Tailwind CSS, Supabase Realtime. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANGUAGE_LOCK}\n\n${STACK_LOCK}\n\n${FRONTEND_PATH_RULES}\n\n${SCHEMA_LOCK}`

    case 'qa_security_auditor':
      return `You are a senior QA engineer for the ${platformCtx.name}. Generate 3-5 critical test cases ONLY. Each code block MAX 20 lines. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'integration_engineer':
      return `You are a senior integration engineer building the ${platformCtx.name}. Connect external services with webhook verification, idempotency, and secure credential storage. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANGUAGE_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`

    case 'documentation_engineer':
      return `You are a technical documentation engineer for the ${platformCtx.name}. Write developer-facing Markdown docs. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'product_analyst':
      return `You are a senior product analyst for the ${platformCtx.name}. Competitive analysis, market research, feature prioritisation for a ${platformCtx.domain} product. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'cost_analyst':
      return `You are a cost and ROI analyst for the ${platformCtx.name}. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'automation_engineer':
      return `You are a senior automation engineer for the ${platformCtx.name}. n8n workflows, webhooks, cron scheduling for ${platformCtx.domain}. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'release_manager':
      return `You are a release manager for the ${platformCtx.name}. Versioning, changelogs, deployment coordination. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    case 'recommendation_analyst':
      return `You are a recommendation analyst for the ${platformCtx.name}. Prioritized, actionable recommendations from data. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}`

    default:
      return `You are an expert AI agent building the ${platformCtx.name}. Execute assigned tasks to production quality. Respond with valid JSON ONLY.\n\n${DOMAIN_LOCK}\n\n${LANGUAGE_LOCK}\n\n${STACK_LOCK}\n\n${SCHEMA_LOCK}`
  }
}

function getRoleConfig(
  agentRole: string,
  taskType: string,
  platformCtx: PlatformContext,
  schemaSnapshot: string,
): RoleConfig {
  const typeMap: Record<string, OutputType> = {
    code: 'code', schema: 'schema', document: 'document',
    test: 'test', review: 'review', deploy: 'document', design: 'schema',
  }
  const outputType: OutputType = typeMap[taskType] || 'document'

  const outputInstructions: Record<string, string> = {
    architect:              `{"summary":"...","output":{"tables":[],"migration_sql":"","typescript_types":"","notes":""}}`,
    backend_engineer:       `{"summary":"...","output":{"files":[{"path":"src/lib/example.ts","content":"// src/lib/example.ts\n// TypeScript content here"}],"language":"typescript","dependencies":[],"env_vars":[],"migration_required":false,"migration_sql":null,"notes":""}}`,
    frontend_engineer:      `{"summary":"...","output":{"files":[{"path":"src/components/Example.tsx","content":"// src/components/Example.tsx\n// TypeScript/React content here"}],"language":"typescript","dependencies":[],"notes":""}}`,
    qa_security_auditor:    `{"summary":"...","output":{"test_cases":[{"name":"","description":"","code":"","type":"unit","severity":"critical"}],"security_findings":[],"coverage_areas":[],"overall_verdict":"pass","notes":""}}`,
    integration_engineer:   `{"summary":"...","output":{"files":[{"path":"src/lib/integrations/example.ts","content":"// src/lib/integrations/example.ts\n// TypeScript content here"}],"language":"typescript","dependencies":[],"env_vars":[],"setup_steps":[],"notes":""}}`,
    documentation_engineer: `{"summary":"...","output":{"content":"# Title\\n\\n...","format":"markdown","audience":"developers","doc_path":"docs/...","related_docs":[]}}`,
    product_analyst:        `{"summary":"...","output":{"format":"markdown","content":"# Analysis\\n\\n...","structured_data":{},"notes":""}}`,
    cost_analyst:           `{"summary":"...","output":{"format":"markdown","content":"# Cost Analysis\\n\\n...","notes":""}}`,
    automation_engineer:    `{"summary":"...","output":{"format":"markdown","content":"# Automation Design\\n\\n...","notes":""}}`,
    release_manager:        `{"summary":"...","output":{"format":"markdown","content":"# Release Notes\\n\\n...","notes":""}}`,
    recommendation_analyst: `{"summary":"...","output":{"format":"markdown","content":"# Recommendations\\n\\n...","notes":""}}`,
  }

  const maxTokensByRole: Record<string, number> = {
    architect: 12288, backend_engineer: 16384, frontend_engineer: 16384,
    qa_security_auditor: 1024, integration_engineer: 16384,
    documentation_engineer: 6144, product_analyst: 6144,
    automation_engineer: 6144, cost_analyst: 4096,
    release_manager: 4096, recommendation_analyst: 4096,
  }

  const tempByRole: Record<string, number> = {
    architect: 0.2, backend_engineer: 0.3, frontend_engineer: 0.3,
    qa_security_auditor: 0.2, integration_engineer: 0.3,
    documentation_engineer: 0.4, product_analyst: 0.3,
    cost_analyst: 0.2, automation_engineer: 0.25,
    release_manager: 0.3, recommendation_analyst: 0.3,
  }

  const OPUS_ROLES = new Set(['architect'])
  const OPUS_TASK_TYPES = new Set(['schema', 'design'])
  const requiresOpus = OPUS_ROLES.has(agentRole) && OPUS_TASK_TYPES.has(taskType)
  const resolvedModel = requiresOpus ? MODEL_OPUS : MODEL_SONNET

  const resolvedMaxTokens = (outputType === 'test' || outputType === 'review')
    ? 1024
    : (maxTokensByRole[agentRole] ?? 4096)

  return {
    model: resolvedModel,
    outputType,
    maxTokens: resolvedMaxTokens,
    temperature: tempByRole[agentRole] ?? 0.35,
    systemPrompt: buildSystemPrompt(agentRole, platformCtx, schemaSnapshot),
    outputInstructions: outputInstructions[agentRole] ?? `{"summary":"...","output":{"content":"# Output\\n\\n...","format":"markdown"}}`,
  }
}

// ── User message builder ──────────────────────────────────────────────────────

function buildUserMessage(
  payload: JobPayload,
  roleConfig: RoleConfig,
  platformCtx: PlatformContext,
  projectName: string,
): string {
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

  // PX-1: Platform context section — injects domain DNA into every task
  lines.push('## Platform Context')
  lines.push(`- Product: ${projectName} (${platformCtx.name})`)
  lines.push(`- Domain: ${platformCtx.domain}`)
  lines.push(`- Core Entities: ${platformCtx.entities.join(', ')}`)
  lines.push(`- Stack: Next.js 14 App Router + TypeScript + Supabase + Vercel`)
  lines.push(`- Execution: Railway Worker (no timeout constraint)`)
  if (platformCtx.exampleRoutes.length > 0) {
    lines.push(`- Example API Routes: ${platformCtx.exampleRoutes.slice(0, 4).join(', ')}`)
  }
  lines.push('')

  // WS3: Always inject DB schema for code/schema/test tasks
  const CODE_OUTPUT_TYPES: OutputType[] = ['code', 'schema', 'test']
  if (CODE_OUTPUT_TYPES.includes(roleConfig.outputType)) {
    lines.push('## DB Schema Reference (use ONLY these tables)')
    lines.push(platformCtx.schemaHint)
    lines.push('')
  }

  lines.push('## Required Output Format')
  lines.push(roleConfig.outputInstructions)

  return lines.join('\n')
}

// ── PX-1: Fetch project context from DB ───────────────────────────────────────

interface ProjectRecord {
  id: string
  name: string
  description: string | null
  project_type: string | null
}

async function fetchProjectContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  projectId: string | null,
): Promise<{ project: ProjectRecord | null; platformCtx: PlatformContext; schemaSnapshot: string }> {
  if (!projectId) {
    const platformCtx = getPlatformContext(null)
    return { project: null, platformCtx, schemaSnapshot: BUILDOS_SCHEMA_SNAPSHOT }
  }

  const { data: project } = await admin
    .from('projects')
    .select('id, name, description, project_type')
    .eq('id', projectId)
    .maybeSingle() as { data: ProjectRecord | null }

  const platformCtx = getPlatformContext(project?.project_type)

  // Use platform-specific schema if available, else BuildOS internal schema
  const schemaSnapshot = platformCtx.schemaHint || BUILDOS_SCHEMA_SNAPSHOT

  console.log(
    `[processor] Platform context: project_type=${project?.project_type ?? 'unknown'} → ${platformCtx.name}`
  )

  return { project, platformCtx, schemaSnapshot }
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
    // ── PX-1: Fetch project record + resolve platform context ─────────────
    const { project, platformCtx, schemaSnapshot } = await fetchProjectContext(
      admin,
      payload.project_id ?? null,
    )
    const projectName = project?.name ?? platformCtx.name

    // ── Build role config with injected platform context ──────────────────
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 300_000 })
    const roleConfig = getRoleConfig(payload.agent_role, payload.task_type, platformCtx, schemaSnapshot)
    const userMessage = buildUserMessage(payload, roleConfig, platformCtx, projectName)

    // WS1 — TIMEOUT FIX: use streaming API instead of one-shot create().
    console.log(`[processor] Starting Anthropic stream: role=${payload.agent_role} model=${roleConfig.model} maxTokens=${roleConfig.maxTokens} platform=${platformCtx.name}`)
    const stream = anthropic.messages.stream({
      model: roleConfig.model,
      max_tokens: roleConfig.maxTokens,
      temperature: roleConfig.temperature,
      system: roleConfig.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Collect streaming text in real-time (prevents idle timeout)
    let rawText = ''
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        rawText += chunk.delta.text
      }
    }

    const response = await stream.finalMessage()
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

    // ── Build callback payload ────────────────────────────────────────────
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
    } else {
      console.log(`[processor] Callback delivered for task=${payload.task_id}`)
    }

  } catch (err) {
    const errorMsg = String(err)
    console.error(`[processor] Job ${jobId} failed:`, errorMsg)

    await admin.from('job_queue').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMsg.slice(0, 1000),
    }).eq('id', jobId)

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
