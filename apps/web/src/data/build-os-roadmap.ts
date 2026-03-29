/**
 * BUILD OS — Self-Referential Roadmap
 * The system's own remaining development plan, stored as structured seed data.
 * Seeded via POST /api/projects/[id]/seed-self-roadmap
 *
 * Column alignment with migration 004:
 *   - title     (tasks/features/epics — NOT 'name')
 *   - task_type: code | schema | document | test | review | deploy | design
 *   - agent_role: orchestrator | architect | product_analyst | backend_engineer |
 *                 frontend_engineer | automation_engineer | integration_engineer |
 *                 qa_security_auditor | documentation_engineer | cost_analyst |
 *                 recommendation_analyst | release_manager
 *   - priority:  critical | high | medium | low
 *   - order_index: 0 = can dispatch immediately; higher = unlocked by predecessors
 */

export interface RoadmapTask {
  title: string
  description: string
  agent_role: string
  task_type: string
  priority: string
  order_index: number
  estimated_cost_usd: number
  max_retries?: number
}

export interface RoadmapFeature {
  title: string
  description: string
  priority: string
  order_index: number
  tasks: RoadmapTask[]
}

export interface RoadmapEpic {
  title: string
  description: string
  order_index: number
  features: RoadmapFeature[]
}

// ── 5 Epics · 14 Features · 53 Tasks ─────────────────────────────────────────

export const BUILD_OS_ROADMAP: RoadmapEpic[] = [

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 1 — Agent Intelligence Layer
  // All tasks that make agents actually useful: prompts, context, recommendations
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Agent Intelligence Layer',
    description: 'Prompt library, context assembly, and recommendation engine so every agent has full knowledge to act autonomously.',
    order_index: 0,
    features: [
      {
        title:       'Agent Prompt Library',
        description: 'Per-role, per-task-type system prompts stored in DB. Dispatched with every agent call.',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title:              'Design agent_prompts schema',
            description:        'Create agent_prompts table (agent_role, task_type, system_prompt, version) and prompt_versions audit trail. Add RLS and migration.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Build agent prompts CRUD API',
            description:        'POST /api/agent-prompts, GET list by role/type, PATCH update with version bump, DELETE soft-delete. Auth + RLS enforced.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'Seed default system prompts for all 12 agent roles',
            description:        'Write production-quality system prompts for each agent_role × task_type combination (≈60 prompts). Focus on structured JSON output, reasoning steps, and Phase 2.5 contract compliance.',
            agent_role:         'documentation_engineer',
            task_type:          'document',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.45,
          },
          {
            title:              'Attach system prompt to dispatch payload',
            description:        'Update POST /api/dispatch/task to fetch the matching agent_prompt and append it to context_payload.system_prompt before emitting to n8n.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        3,
            estimated_cost_usd: 0.12,
          },
          {
            title:              'Prompt editor UI',
            description:        'Page at /settings/prompts. List prompts by role. Inline markdown editor with preview. Version history drawer. Rollback to prior version.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        4,
            estimated_cost_usd: 0.22,
          },
        ],
      },
      {
        title:       'Context Assembly Engine',
        description: 'Automatically gather task history, related documents, and prior agent outputs to build rich context_payload for each dispatch.',
        priority:    'high',
        order_index: 1,
        tasks: [
          {
            title:              'Design context assembly service interface',
            description:        'Specify the ContextAssembler interface: inputs (task_id, project_id), outputs (context_payload enrichment). Define what data sources to tap: task history, documents, artifacts, cost model, blockers.',
            agent_role:         'architect',
            task_type:          'design',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.06,
          },
          {
            title:              'Implement context assembler service',
            description:        'src/lib/context-assembler.ts. Fetches: (1) task + feature + epic tree, (2) related documents by doc_type, (3) prior agent_outputs for this task, (4) current cost model, (5) open blockers. Returns enriched context_payload.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Integrate context assembler with dispatch route',
            description:        'Update POST /api/dispatch/task to call assembleContext() before emitting to n8n. Log context size to audit trail. Add CONTEXT_ASSEMBLY_TIMEOUT_MS env guard.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.14,
          },
        ],
      },
      {
        title:       'Recommendation Engine',
        description: 'Agents can emit architectural recommendations. Tracked, reviewed, and accepted by humans or auto-applied by the orchestrator.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'Implement emit_recommendation Phase 2.5 contract',
            description:        'POST /api/recommendations — full contract: idempotency, audit log, recommendation_type enum (architecture/tech_stack/cost/security/process). Store in recommendations table.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Recommendations list and review API',
            description:        'GET /api/recommendations?project_id= with status filter. PATCH accept/reject with audit. Accepted recommendations trigger a new task creation if action_required.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'Recommendations dashboard UI',
            description:        'Page at /projects/[id]/recommendations. Card list grouped by type. Accept/reject buttons with rationale input. Count badge on sidebar. Realtime subscription.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Wire recommendation_analyst agent role',
            description:        'Add recommendation_analyst to n8n dispatch workflow routing. Define recommendation_analyst system prompt. Write integration test.',
            agent_role:         'recommendation_analyst',
            task_type:          'review',
            priority:           'low',
            order_index:        3,
            estimated_cost_usd: 0.10,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 2 — Autonomous Orchestration Hardening
  // Dependency graph, persistent state, circuit breakers
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Autonomous Orchestration Hardening',
    description: 'Robust dependency resolution, persistent run history, and circuit breakers that keep the loop healthy and safe under load.',
    order_index: 1,
    features: [
      {
        title:       'Dependency Graph Engine',
        description: 'Explicit task_dependencies table + order_index-based implicit resolution. Auto-unlock when prerequisites complete.',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title:              'Verify task_dependencies schema and indices',
            description:        'Validate migration 014 task_dependencies table, buildos_find_unlockable_tasks() function, and RLS policy are correct. Write SQL test assertions.',
            agent_role:         'architect',
            task_type:          'review',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Build dependency resolution algorithm',
            description:        'Implement unlockDependencies() in orchestration.ts: (1) find tasks just unlockable via order_index, (2) find tasks with all explicit deps completed, (3) batch-update status pending→ready, (4) emit realtime event.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Cross-feature and cross-epic dependency wiring',
            description:        'After all tasks in Feature N complete, auto-unlock first tasks of Feature N+1. After all features in Epic N complete, unlock first feature of Epic N+1. Update seed-self-roadmap to add explicit cross-epic dependency edges.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'Dependency chain test suite',
            description:        'Vitest tests: (1) task unlock when predecessor completes, (2) task stays pending if any predecessor is incomplete, (3) circular dependency detection, (4) cascade cancel when upstream cancelled.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.20,
          },
        ],
      },
      {
        title:       'Persistent Orchestration State',
        description: 'Every tick is persisted. Dead-letter queue for permanently failed tasks. Metrics endpoint.',
        priority:    'high',
        order_index: 1,
        tasks: [
          {
            title:              'Persist orchestration_runs records per tick',
            description:        'Update runOrchestrationTick() to insert an orchestration_runs row with: tick_number, triggered_by, tasks_dispatched[], tasks_unlocked[], guardrail_hit, queue_depth, active_before/after.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'Dead letter queue for permanently failed tasks',
            description:        'Tasks with retry_count >= max_retries → status=failed. DLQ view: GET /api/orchestrate/dlq. Retry override: POST /api/orchestrate/dlq/retry with bump of max_retries. Alert when DLQ grows.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Orchestration metrics endpoint',
            description:        'GET /api/orchestrate/metrics: tick_count, avg_dispatch_time_ms, avg_completion_time_ms, throughput_per_hour, cost_per_task_avg, guardrail_hit_rate, dlq_depth.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.12,
          },
        ],
      },
      {
        title:       'Guardrails & Circuit Breakers',
        description: 'Budget ceiling, per-role rate limiting, safe-stop mechanism. System cannot overspend or thrash.',
        priority:    'high',
        order_index: 2,
        tasks: [
          {
            title:              'Budget ceiling hard stop',
            description:        'Before each dispatch: check total_cost_usd >= cost_alert_threshold_usd. If exceeded: set safe_stop=true, create a cost_threshold_exceeded blocker, emit guardrail audit event. Tick returns immediately with guardrail_hit=true.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'Per-agent-role concurrency caps',
            description:        'Count currently dispatched+in_progress tasks per agent_role. Configurable caps per role (default: architect=1, qa=2, engineer=3). Enforce in checkGuardrails() before dispatch.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.12,
          },
          {
            title:              'Safe-stop with state snapshot',
            description:        'POST /api/orchestrate/safe-stop: sets safe_stop=true, waits for in-progress tasks to complete (no new dispatches), snapshots system state to orchestration_runs, returns summary. Resumable via activate endpoint.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Guardrail breach integration tests',
            description:        'Tests: (1) budget ceiling stops dispatch, (2) safe_stop blocks new work but completes in-flight, (3) per-role cap respected, (4) resume after safe-stop restores correct queue state.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.18,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 3 — Team & Multi-Tenancy
  // Invites, RBAC, workspace isolation
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Team & Multi-Tenancy',
    description: 'Multi-user workspaces with role-based access control, email invitations, and per-organization data isolation.',
    order_index: 2,
    features: [
      {
        title:       'Team Members & Invitations',
        description: 'Email-token invite flow, role assignment (owner/admin/member), and team management UI.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Member invite API with email token',
            description:        'POST /api/workspaces/[id]/invite: generate signed invitation token (24h TTL), send via Resend, store in workspace_invitations table. GET /api/invitations/[token] to verify. POST /api/invitations/[token]/accept to create workspace_member.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Role-based access control enforcement',
            description:        'Middleware: check workspace_members.role before all workspace-scoped API routes. owner: all actions. admin: all except billing. member: read + create projects. Viewer: read only. Enforce in both API routes and RLS.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'Team members management UI',
            description:        'Page at /workspaces/[id]/team. Member list with roles. Invite form. Remove member button. Role change dropdown (owner-only). Pending invitation list with resend/revoke.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'Multi-user access control tests',
            description:        'Tests: (1) member cannot access another workspace, (2) admin cannot change billing, (3) invitation token expiry, (4) duplicate invite rejected, (5) removed member loses access immediately.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'critical',
            order_index:        3,
            estimated_cost_usd: 0.22,
          },
        ],
      },
      {
        title:       'Workspace Isolation & Quotas',
        description: 'Per-org data isolation hardening, usage quotas, and cross-workspace contamination prevention.',
        priority:    'critical',
        order_index: 1,
        tasks: [
          {
            title:              'RLS policy hardening review',
            description:        'Security review of all 9 RLS migrations. Verify: (1) no policy allows cross-org read, (2) service_role bypasses are only in approved functions, (3) audit log cannot be deleted, (4) credentials_safe_view never exposes encrypted_values.',
            agent_role:         'qa_security_auditor',
            task_type:          'review',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Per-org usage quota enforcement',
            description:        'Add org.plan quota checks: max_projects (free:3, pro:20, enterprise:unlimited), max_tasks_per_project (free:100, pro:1000), max_cost_usd_per_month (free:5, pro:50). Block operations that exceed quota with 429 + quota_exceeded error.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Cross-workspace data isolation test',
            description:        'Penetration test: create 2 orgs with 2 users each. Verify user A cannot read, write, or infer data from org B via any API route, even with valid JWT. Test all 40+ routes.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'critical',
            order_index:        2,
            estimated_cost_usd: 0.30,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 4 — SaaS Infrastructure
  // Billing, notifications, external API
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'SaaS Infrastructure',
    description: 'Production-grade billing (Stripe), notification delivery (Resend + Slack), and a public REST API with key management.',
    order_index: 3,
    features: [
      {
        title:       'Billing & Plans',
        description: 'Stripe integration, plan tier enforcement, usage metering, billing portal.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Stripe SDK setup and webhook handler',
            description:        'Install stripe npm. Configure STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. POST /api/billing/webhook: handle customer.subscription.created/updated/deleted, invoice.payment_succeeded/failed. Store subscription state in organizations table.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'Plan tier schema and enforcement',
            description:        'Migration: add stripe_customer_id, stripe_subscription_id, plan_expires_at to organizations. Add plan_limits JSONB column. Seed plan limits for free/starter/pro/enterprise. Middleware enforces limits before quota-gated operations.',
            agent_role:         'backend_engineer',
            task_type:          'schema',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'Usage metering hooks',
            description:        'Increment usage counters on: project create, task dispatch, cost event. POST /api/billing/usage-record to emit Stripe metered usage. Track monthly rollup in org_usage_metrics table.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Billing portal page',
            description:        'Page at /settings/billing. Current plan badge. Usage bars (projects, tasks, cost). Upgrade button (Stripe Checkout redirect). Manage subscription (Stripe Customer Portal redirect). Invoice history table.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'Cost model per plan tier document',
            description:        'Document: per-plan AI cost pass-through rates, margin targets, break-even analysis, projected MRR at 100/500/1000 customers. Store as approved cost_model doc in the Build OS project.',
            agent_role:         'cost_analyst',
            task_type:          'document',
            priority:           'medium',
            order_index:        4,
            estimated_cost_usd: 0.12,
          },
        ],
      },
      {
        title:       'Notifications',
        description: 'Email via Resend, Slack outbound webhooks, and in-app notification feed.',
        priority:    'medium',
        order_index: 1,
        tasks: [
          {
            title:              'Email notifications via Resend',
            description:        'Install resend npm. Configure RESEND_API_KEY. Send emails on: blocker_created (owner + reporter), task_completed (if require_notification), qa_failed (reporter), release_ready (owner). Template with Build OS branding. Unsubscribe link.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Slack outbound webhook integration',
            description:        'Use notification_webhook_url from project_settings (already in schema). POST formatted Slack blocks on: task dispatched, task completed, blocker created, QA fail, release check pass. Preview in /settings/notifications.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'In-app notification feed UI',
            description:        'Bell icon in TopBar with unread count badge. Dropdown feed (last 20 events). Mark as read. Realtime subscription on a new notifications table. Notification types: task_complete, blocker, qa_fail, cost_alert, release_ready.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.24,
          },
        ],
      },
      {
        title:       'External REST API',
        description: 'Public API with key management, rate limiting, and generated OpenAPI docs for external integrations.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'API key generation and management',
            description:        'POST /api/keys: generate sha256 API key, store hashed in api_keys table with (org_id, name, scopes[], last_used_at, expires_at). Middleware: extract Bearer token, validate hash, inject org context. UI at /settings/api-keys.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'Rate limiting middleware',
            description:        'Sliding window rate limiter (Redis or Upstash). Limits: free=60/min, starter=300/min, pro=1000/min, api_key=varies by scope. Return Retry-After header on 429. Track rate limit metrics.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'OpenAPI 3.1 specification',
            description:        'Generate openapi.yaml covering all 25+ public API routes. Include: auth schemes, request/response schemas, error codes, examples. Serve at /api/openapi.json. Interactive Swagger UI at /api/docs.',
            agent_role:         'documentation_engineer',
            task_type:          'document',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Developer documentation site',
            description:        'MDX-based docs at /docs (or docs.buildos.dev subdomain). Sections: Quick start, Authentication, Projects API, Tasks API, Webhooks, n8n integration guide, SDK examples (TypeScript, Python). Auto-generated from OpenAPI spec.',
            agent_role:         'documentation_engineer',
            task_type:          'document',
            priority:           'low',
            order_index:        3,
            estimated_cost_usd: 0.30,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 5 — Quality & Reliability
  // Testing suite, observability, CI/CD
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Quality & Reliability',
    description: 'Comprehensive testing pyramid, structured observability, and CI/CD pipeline that gate every deployment.',
    order_index: 4,
    features: [
      {
        title:       'Testing Suite',
        description: 'Vitest unit + integration tests, Playwright E2E for critical flows.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Set up Vitest with coverage tooling',
            description:        'Install vitest, @vitest/coverage-v8. Configure vitest.config.ts with alias matching tsconfig. Coverage threshold: 80% lines. Add test script to package.json. Create test/setup.ts with Supabase mock client factory.',
            agent_role:         'qa_security_auditor',
            task_type:          'deploy',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Unit tests: execution engine (orchestration, idempotency, locking)',
            description:        'Test all functions in src/lib/execution.ts and src/lib/orchestration.ts: validateAgentOutput(), isValidTransition(), checkIdempotency(), unlockDependencies(), checkGuardrails(), runOrchestrationTick(). Mock Supabase client. 100% branch coverage target.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Integration tests: all API routes',
            description:        'Test all 25+ API routes against real Supabase test instance. Cover: auth guards, idempotency, state machine transitions, cost event aggregation, credential encryption. Use test fixtures. Parallel execution.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.40,
          },
          {
            title:              'E2E tests: Playwright critical user flows',
            description:        'Playwright tests for: (1) signup → create project → complete onboarding, (2) generate blueprint → seed tasks → dispatch → see live update, (3) connect integration → trigger task → see cost, (4) run release check → all gates pass.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.35,
          },
        ],
      },
      {
        title:       'Observability',
        description: 'Structured logging, error tracking, and performance monitoring for production operations.',
        priority:    'medium',
        order_index: 1,
        tasks: [
          {
            title:              'Structured logging with Pino',
            description:        'Install pino, pino-pretty. Create src/lib/logger.ts with log levels and request context (request_id, user_id, project_id). Replace all console.log/error with structured log calls. Add request logging middleware.',
            agent_role:         'automation_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'Error tracking with Sentry',
            description:        'Install @sentry/nextjs. Configure SENTRY_DSN. Capture: unhandled API errors, agent output validation failures, orchestration loop errors, budget threshold breaches. Add user context (org, project) to Sentry events. Ignore 400/401/404.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Performance monitoring hooks',
            description:        'Track p50/p95/p99 for: dispatch → agent output round-trip, orchestration tick duration, Supabase query time. Expose at GET /api/metrics/performance. Alert if p95 dispatch time > 30s.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.14,
          },
        ],
      },
      {
        title:       'CI/CD Pipeline',
        description: 'GitHub Actions workflow for test/lint/build, Vercel deployment config, and staging environment.',
        priority:    'high',
        order_index: 2,
        tasks: [
          {
            title:              'GitHub Actions: lint + typecheck + test',
            description:        'Create .github/workflows/ci.yml. Jobs: lint (eslint), typecheck (tsc --noEmit), unit-tests (vitest), integration-tests (against Supabase test project). Cache node_modules. Block PR merge on failure.',
            agent_role:         'automation_engineer',
            task_type:          'deploy',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.14,
          },
          {
            title:              'Vercel deployment configuration',
            description:        'vercel.json: framework=nextjs, build command, output directory. Cron job for orchestration tick (every 5 minutes via /api/orchestrate/cron). Environment variable groups: production/preview/development. Automatic preview deployments on PR.',
            agent_role:         'automation_engineer',
            task_type:          'deploy',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.12,
          },
          {
            title:              'Environment secrets management',
            description:        'Document all required env vars: Supabase, Stripe, Resend, Sentry, n8n, CREDENTIAL_ENCRYPTION_KEY. Create .env.example. Vercel environment variable import script. Secret rotation runbook.',
            agent_role:         'automation_engineer',
            task_type:          'deploy',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Staging environment and smoke tests',
            description:        'Provision staging Supabase project. Deploy to Vercel staging with staging env vars. Smoke test script: create project → seed tasks → run release check → assert score > 0. Run after every successful deploy.',
            agent_role:         'release_manager',
            task_type:          'deploy',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.18,
          },
        ],
      },
    ],
  },
]

// ── Computed totals ────────────────────────────────────────────────────────────
export const ROADMAP_SUMMARY = {
  epics:    BUILD_OS_ROADMAP.length,
  features: BUILD_OS_ROADMAP.flatMap(e => e.features).length,
  tasks:    BUILD_OS_ROADMAP.flatMap(e => e.features).flatMap(f => f.tasks).length,
  total_estimated_cost_usd: BUILD_OS_ROADMAP
    .flatMap(e => e.features)
    .flatMap(f => f.tasks)
    .reduce((sum, t) => sum + t.estimated_cost_usd, 0),
}
