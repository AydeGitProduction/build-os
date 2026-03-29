/**
 * BUILD OS — Phase 2 Roadmap (Run 2)
 * The next wave of autonomous development after Phase 1 stabilisation.
 * Seeded via POST /api/projects/[id]/seed-phase2-roadmap
 *
 * Phase 2 focuses on:
 *   - AI-powered product intelligence (PRDs, market analysis, prioritisation)
 *   - Self-improving agent loop (quality scoring, prompt optimisation, retrospectives)
 *   - Customer acquisition funnel (landing page, demo mode, email sequences)
 *   - Advanced code generation (file tree, Git integration, live preview)
 *   - Platform marketplace (blueprint templates, community workflows)
 *
 * Column alignment with migration 004 schema:
 *   - title     (tasks/features/epics — NOT 'name')
 *   - task_type: code | schema | document | test | review | deploy | design
 *   - agent_role: orchestrator | architect | product_analyst | backend_engineer |
 *                 frontend_engineer | automation_engineer | integration_engineer |
 *                 qa_security_auditor | documentation_engineer | cost_analyst |
 *                 recommendation_analyst | release_manager
 *   - priority:  critical | high | medium | low
 *   - order_index: 0 = can dispatch immediately; higher = unlocked by predecessors
 */

import type { RoadmapEpic } from './build-os-roadmap'

// ── 5 Epics · 15 Features · 50 Tasks ─────────────────────────────────────────

export const BUILD_OS_ROADMAP_V2: RoadmapEpic[] = [

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 1 — AI Product Intelligence
  // The system analyses its own roadmap health, generates PRDs, and surfaces
  // market intelligence to guide what gets built next.
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'AI Product Intelligence',
    description: 'Automated PRD generation, competitive intelligence, and AI-driven feature prioritisation — the system knows what to build next and why.',
    order_index: 0,
    features: [
      {
        title:       'Automated PRD Generator',
        description: 'Given a feature request or user story, generate a structured Product Requirements Document with goals, acceptance criteria, edge cases, and success metrics.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Design prd_documents schema and API contract',
            description:        'Migration: prd_documents table (project_id, feature_id, title, summary, goals JSONB, acceptance_criteria JSONB, edge_cases JSONB, success_metrics JSONB, status, version, generated_by, created_at). RLS on project_id. Add migration.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Build PRD generation service',
            description:        'src/lib/prd-generator.ts: calls claude-sonnet-4-6 with a structured prompt that takes feature title + description + project blueprint + existing tasks and returns a full PRD JSON. Validates output against Zod schema before saving.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'POST /api/projects/[id]/prds endpoint',
            description:        'POST: generate PRD for a feature or from free text. GET: list all PRDs. GET /api/projects/[id]/prds/[prd_id]: full PRD detail. PATCH: update status (draft/approved/rejected). Auth + RLS. Returns generated PRD with version number.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'PRD viewer and approval UI',
            description:        'Page at /projects/[id]/prds. Card grid of PRDs with status badges. Full-screen PRD reader with structured sections. Approve/reject buttons with comment. Link PRD to feature. Export as PDF. Realtime subscription.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Auto-generate PRD when feature is created',
            description:        'Hook: after a feature is inserted in the features table, auto-trigger PRD generation in the background (non-blocking). Attach prd_id to feature record. Show "Generating PRD..." status in feature card.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        4,
            estimated_cost_usd: 0.14,
          },
        ],
      },
      {
        title:       'Competitive Intelligence Engine',
        description: 'The product_analyst agent researches market alternatives and surfaces competitive insights, positioning, and differentiation opportunities.',
        priority:    'medium',
        order_index: 1,
        tasks: [
          {
            title:              'Competitive analysis schema and API',
            description:        'Migration: competitive_analyses table (project_id, competitor_name, url, strengths JSONB, weaknesses JSONB, differentiators JSONB, pricing JSONB, status, analysed_at). POST /api/projects/[id]/competitive-analysis. GET list + detail.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Product analyst agent with web research',
            description:        'Dispatch product_analyst tasks that use web search to analyse competitors. Agent output: structured JSON with competitor name, core features, pricing tiers, target audience, strengths, weaknesses. Store in competitive_analyses. Schedule weekly re-run.',
            agent_role:         'product_analyst',
            task_type:          'review',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.35,
          },
          {
            title:              'Competitive intelligence dashboard',
            description:        'Tab in project dashboard: competitor cards with last-analysed date, summary, feature comparison matrix, positioning map. Trigger re-analysis button. Export comparison table as CSV.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },
        ],
      },
      {
        title:       'AI Feature Prioritisation',
        description: 'Score and rank backlog features by impact, effort, strategic alignment, and user demand signals using the cost_analyst and recommendation_analyst agents.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'Feature scoring model service',
            description:        'src/lib/feature-scorer.ts: RICE-like scoring (Reach, Impact, Confidence, Effort). Pulls: feature description, linked tasks, cost estimates, PRD acceptance criteria, user feedback if available. Returns score + rationale. Stores in features.priority_score.',
            agent_role:         'cost_analyst',
            task_type:          'code',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.22,
          },
          {
            title:              'Prioritisation API and auto-rank job',
            description:        'POST /api/projects/[id]/prioritise: trigger full backlog scoring. PATCH /api/features/[id]/priority: manual override. Scheduled job: re-score all pending features after each task completion batch. Returns ranked list with score breakdown.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.16,
          },
          {
            title:              'Prioritised backlog view',
            description:        'Ranked list view in features tab, sorted by priority_score desc. Score breakdown tooltip on hover: reach/impact/confidence/effort bars. Drag to override rank. "Why this order" explainer panel. Sort toggle: AI-ranked vs manual vs status.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.20,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 2 — Self-Improving Agent Loop
  // Agents score their own outputs, the system learns from failures, and
  // prompts are automatically optimised based on quality signals.
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Self-Improving Agent Loop',
    description: 'Quality scoring of every agent output, automated prompt A/B testing, and run retrospectives that feed improvements back into the next dispatch cycle.',
    order_index: 1,
    features: [
      {
        title:       'Agent Output Quality Scoring',
        description: 'Every agent_output is scored on completeness, accuracy, contract compliance, and downstream task success rate. Scores inform prompt optimisation.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Quality score schema and migration',
            description:        'Migration: add quality_score NUMERIC(4,2), quality_dimensions JSONB (completeness, accuracy, contract_compliance, downstream_success), scored_at to agent_outputs. Add quality_thresholds to project_settings (default: fail_threshold=0.5, review_threshold=0.7).',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Scoring service: validate output against task contract',
            description:        'src/lib/output-scorer.ts: after each agent_output is accepted, score it: (1) required fields present, (2) status transition valid, (3) output_payload matches expected schema for task_type, (4) no hallucinated keys. Returns 0.0–1.0 per dimension. Store in agent_outputs.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'Downstream success tracking',
            description:        'When a task transitions to completed via QA pass: look back at the agent_output and bump its downstream_success score. When a task fails QA: decrement score. Aggregate per (agent_role, task_type) pair over rolling 7-day window. Store in agent_performance_metrics table.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Quality metrics dashboard',
            description:        'Page at /projects/[id]/quality. Charts: average quality score by agent_role over time, failure rate per task_type, top failing dimensions. Table: lowest-scored recent outputs with "View details" link. Drill-down to individual agent_output comparison.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.26,
          },
        ],
      },
      {
        title:       'Automated Prompt Optimisation',
        description: 'When quality scores drop below threshold, the system automatically proposes improved prompts, runs A/B tests, and promotes winning variants.',
        priority:    'medium',
        order_index: 1,
        tasks: [
          {
            title:              'Prompt variant management schema',
            description:        'Migration: prompt_experiments table (prompt_id, variant_a_id, variant_b_id, start_date, end_date, winner_id, sample_size, significance_threshold). prompt_assignments table tracks which variant was used per dispatch. Add migration.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'A/B test routing in dispatch pipeline',
            description:        'Update POST /api/dispatch/task: if an active experiment exists for the (agent_role, task_type) pair, randomly assign variant A or B (50/50), record in prompt_assignments. Significance testing: when sample_size reached, calculate Mann-Whitney U, promote winner automatically.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'Auto-generate improved prompt variants',
            description:        'Nightly job: for each (agent_role, task_type) pair with avg_quality_score < 0.7 over last 7 days, dispatch a documentation_engineer task to write an improved variant. Attach quality analysis as context. Store proposed variant as prompt_versions.status=proposed for human review.',
            agent_role:         'documentation_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },
        ],
      },
      {
        title:       'Run Retrospectives',
        description: 'After each run batch (all tasks in a feature complete), automatically generate a retrospective document: what worked, what failed, what to improve.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'Retrospective schema and trigger',
            description:        'Migration: retrospectives table (project_id, feature_id, epic_id, scope, summary, wins JSONB, failures JSONB, action_items JSONB, cost_actual, cost_estimated, duration_hours, generated_at). Trigger: auto-create retrospective record when all tasks in a feature reach completed/failed.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.08,
          },
          {
            title:              'Retrospective generator service',
            description:        'src/lib/retro-generator.ts: called on feature completion. Aggregates: all tasks (status/retries/duration), agent_outputs (quality scores), QA pass/fail rates, cost vs estimate variance, blocker count. Calls Claude to synthesise wins, failures, action items JSON. Stores result.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'Retrospectives viewer UI',
            description:        'Page at /projects/[id]/retrospectives. Timeline of completed features with retro summaries. Expand: wins/failures/action items cards. Cost accuracy chart: estimated vs actual bars. "Apply action items" button creates tasks in backlog. Export as PDF.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.22,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 3 — Customer Acquisition Funnel
  // Marketing site, demo mode, and email sequences that convert visitors
  // into paying customers.
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Customer Acquisition Funnel',
    description: 'A high-converting marketing landing page, interactive demo mode with a pre-seeded sample project, and an automated onboarding email sequence.',
    order_index: 2,
    features: [
      {
        title:       'Marketing Landing Page',
        description: 'Production-grade landing page at buildos.dev (or marketing subdomain) with hero, feature sections, social proof, pricing table, and CTA.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Landing page architecture and design system',
            description:        'Design the marketing site structure: hero section (headline, subheadline, live demo CTA), how-it-works 3-step section, feature grid (6 key capabilities), social proof (logos/testimonials placeholder), pricing table (3 tiers), footer. Define motion/animation spec.',
            agent_role:         'architect',
            task_type:          'design',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.12,
          },
          {
            title:              'Build hero and how-it-works sections',
            description:        'Next.js page at /marketing or separate Next.js app. Hero: animated headline, "Watch it build itself" live counter (tasks completed, cost spent), primary CTA "Start building for free". How-it-works: 3 steps with animated code examples. Mobile-responsive.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.35,
          },
          {
            title:              'Pricing table and feature comparison',
            description:        'Pricing section: 3 tier cards (Free/Pro/Enterprise). Feature comparison table (20+ features, checkmarks). Toggle monthly/annual billing. Highlighted recommended plan. Stripe Checkout CTA. FAQ accordion. "Talk to us" enterprise CTA.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'SEO metadata, sitemap, and analytics',
            description:        'Add: Next.js metadata API (title, description, OG image per page). XML sitemap at /sitemap.xml. robots.txt. Google Analytics 4 + Vercel Analytics. Performance audit: Core Web Vitals all green. Structured data (Organization schema).',
            agent_role:         'automation_engineer',
            task_type:          'deploy',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.16,
          },
        ],
      },
      {
        title:       'Interactive Demo Mode',
        description: 'Visitors can explore a pre-seeded "Build a Todo App" sample project without signing up. Read-only with a CTA to create their own.',
        priority:    'high',
        order_index: 1,
        tasks: [
          {
            title:              'Demo project seed data and guest auth',
            description:        'Create a static demo project (id: demo-project) with pre-built epics, features, tasks in various states. Guest mode: anonymous session with read-only RLS. No sign-up required. Demo resets to canonical state every hour via cron. DEMO_PROJECT_ID env var.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'Demo mode UI overlay and guided tour',
            description:        'When DEMO_MODE=true: show "You\'re viewing a live demo" banner. Tooltips on key elements (task card, dispatch button, QA verdict). "This is how it looks when..." annotations. Step-by-step tour using Intro.js or custom overlay. Exit → sign-up CTA.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'Demo project live metrics widget',
            description:        'Public page showing: tasks completed today, total AI cost spent building Build OS itself, active projects across all users, last task completed. Auto-refreshes every 10s. Embed on landing page hero as social proof.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.20,
          },
        ],
      },
      {
        title:       'Onboarding Email Sequence',
        description: 'Automated Resend email drip: welcome, Day 1 tip, Day 3 feature highlight, Day 7 check-in. Triggered on signup.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'Email template system with Resend',
            description:        'Create 5 email templates in Resend: (1) Welcome + quickstart, (2) Day 1: "Create your first project", (3) Day 3: "Did you know about Iris?", (4) Day 7: "Your build progress so far", (5) Day 14: Pro upgrade nudge. Build with React Email. Brand-consistent design.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'Email sequence scheduler',
            description:        'On user signup: create email_sequences record with timestamps for each email. Vercel cron (daily): query email_sequences where send_at <= NOW() and sent=false. Send via Resend. Mark sent. Handle unsubscribe: POST /api/email/unsubscribe with one-click HMAC token.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.20,
          },
          {
            title:              'Email open and click tracking',
            description:        'Add Resend webhook handler: POST /api/email/webhook for email.opened, email.clicked, email.bounced. Store events in email_events table. Dashboard at /admin/emails: delivery rates, open rates, click rates per template. Stop sequence on bounce.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.16,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 4 — Advanced Code Generation
  // The system doesn't just plan — it generates actual files, commits to Git,
  // and deploys live previews.
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Advanced Code Generation',
    description: 'Agents generate real code files organised into a project file tree, auto-commit to GitHub, and deploy live preview environments via Vercel.',
    order_index: 3,
    features: [
      {
        title:       'File Tree & Code Generation Engine',
        description: 'Backend and frontend agents generate actual source files. Files are stored, versioned, and navigable in a project file explorer.',
        priority:    'critical',
        order_index: 0,
        tasks: [
          {
            title:              'generated_files schema and versioning',
            description:        'Migration: generated_files table (project_id, task_id, agent_run_id, file_path, content TEXT, language, size_bytes, version, status, created_at). file_versions table (file_id, version, content, diff, committed_at). RLS. Unique index on (project_id, file_path).',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'critical',
            order_index:        0,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Code generation agent output contract',
            description:        'Extend POST /api/agent/output to accept task_type=code outputs with generated_files[]. Each file: path, content, language. Validate: max file size 100KB, path must be relative, language from allowed list. Upsert into generated_files table. Emit realtime event.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'critical',
            order_index:        1,
            estimated_cost_usd: 0.24,
          },
          {
            title:              'File tree explorer UI',
            description:        'Component at /projects/[id]/code. Left panel: collapsible file tree with language icons. Right panel: syntax-highlighted code viewer (Shiki). Breadcrumb path. Version history drawer (show diffs). Download file button. Copy to clipboard. Generated-by badge (task title + agent role).',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.40,
          },
          {
            title:              'Code generation quality gates',
            description:        'After code files are saved: (1) syntax validation per language (TypeScript tsc --noEmit, Python ast.parse, etc), (2) security scan (detect hardcoded secrets, SQL injection patterns), (3) complexity score (cyclomatic complexity > 20 → flag). Block task completion if critical issues found.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'high',
            order_index:        3,
            estimated_cost_usd: 0.28,
          },
        ],
      },
      {
        title:       'GitHub Auto-Commit Integration',
        description: 'Generated code is automatically committed to the project\'s linked GitHub repository. Each task completion creates a commit or PR.',
        priority:    'high',
        order_index: 1,
        tasks: [
          {
            title:              'GitHub OAuth and repository linking',
            description:        'Add GitHub OAuth to project_integrations (already has schema). Store: github_installation_id, github_repo_full_name, github_default_branch. Settings UI: connect GitHub, select repo, set target branch. Use GitHub App (not personal token) for proper scoping.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.32,
          },
          {
            title:              'Auto-commit service on task completion',
            description:        'src/lib/github-committer.ts: after task completes with generated_files, use GitHub API to: (1) get base tree, (2) create blobs for each file, (3) create new tree, (4) create commit referencing task title + agent_run_id, (5) update branch ref. Commit message format: "feat(task): {title} [BuildOS #{task_id}]".',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.30,
          },
          {
            title:              'Pull request creation for review tasks',
            description:        'When task_type=review or require_qa_on_all_tasks=true: instead of committing directly to main, create a feature branch and open a GitHub PR. PR description: task description, files changed, agent role. Link PR URL back to task. Merge on QA pass.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        2,
            estimated_cost_usd: 0.24,
          },
        ],
      },
      {
        title:       'Live Preview Deployment',
        description: 'Each task batch triggers a Vercel preview deployment. URL is linked to the project preview tab and sent as a notification.',
        priority:    'medium',
        order_index: 2,
        tasks: [
          {
            title:              'Vercel deployment API integration',
            description:        'src/lib/vercel-deployer.ts: after GitHub commit, trigger Vercel deployment via API (VERCEL_API_TOKEN + VERCEL_TEAM_ID). Poll deployment status. On success: update project_environments.deployment_url for preview env. On fail: create deployer blocker.',
            agent_role:         'integration_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.26,
          },
          {
            title:              'Deployment status tracking UI',
            description:        'In preview tab: deployment timeline (commit → build → live). Build log streaming via SSE. Failed deployment diff (what changed). Re-trigger deployment button. Deployment history (last 10 with status and URL). Diff link to GitHub PR.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.28,
          },
          {
            title:              'Visual regression testing on preview',
            description:        'After preview deployment: run Playwright screenshot suite against preview URL. Compare to baseline screenshots. Flag pixel diff > 5% as potential regression. Link report to QA verdict. Store screenshots in Supabase Storage.',
            agent_role:         'qa_security_auditor',
            task_type:          'test',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.30,
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // EPIC 5 — Platform Marketplace
  // Community-submitted blueprint templates, agent workflow presets, and
  // an integration marketplace so teams can share and reuse patterns.
  // ───────────────────────────────────────────────────────────────────────────
  {
    title:       'Platform Marketplace',
    description: 'A community marketplace for blueprint templates, agent workflow presets, and integration packs — teams share and reuse their best Build OS patterns.',
    order_index: 4,
    features: [
      {
        title:       'Blueprint Template Library',
        description: 'Pre-built project blueprints for common SaaS patterns (auth, billing, CRUD, etc.). One-click import to bootstrap a new project\'s epics and features.',
        priority:    'high',
        order_index: 0,
        tasks: [
          {
            title:              'Template schema and import system',
            description:        'Migration: blueprint_templates table (id, name, slug, description, category, epics JSONB, features JSONB, tasks JSONB, is_official, author_org_id, download_count, created_at). POST /api/templates/[id]/import: validate, insert epics+features+tasks into project. Idempotent.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'high',
            order_index:        0,
            estimated_cost_usd: 0.12,
          },
          {
            title:              'Seed 10 official blueprint templates',
            description:        'Create official templates for: (1) SaaS MVP, (2) API-first product, (3) AI-powered app, (4) E-commerce, (5) CRM, (6) Internal tool, (7) Developer tool, (8) Mobile backend, (9) Analytics dashboard, (10) Marketplace. Each with 3-5 epics, 8-15 features, 30-50 tasks.',
            agent_role:         'documentation_engineer',
            task_type:          'document',
            priority:           'high',
            order_index:        1,
            estimated_cost_usd: 0.80,
          },
          {
            title:              'Template marketplace browse UI',
            description:        'Page at /marketplace/templates. Category filter tabs. Card grid: template name, description, epic/feature/task counts, author badge, download count, "Official" crown. Preview modal: epic list with feature counts, estimated cost, "Import to project" button. Search.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'high',
            order_index:        2,
            estimated_cost_usd: 0.35,
          },
          {
            title:              'Template publish flow',
            description:        'Let users export their project structure as a template: POST /api/templates from existing project (scrubs sensitive data from context_payload). Review queue for community submissions (admin UI). Approve/reject with feedback. Version management (semver). Tags.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        3,
            estimated_cost_usd: 0.24,
          },
        ],
      },
      {
        title:       'Agent Workflow Presets',
        description: 'Pre-configured n8n workflow exports and agent prompt bundles for common task patterns, downloadable and importable into any Build OS instance.',
        priority:    'medium',
        order_index: 1,
        tasks: [
          {
            title:              'Workflow preset schema and registry',
            description:        'Migration: workflow_presets table (id, name, slug, description, agent_role, task_type_pattern, n8n_workflow_json JSONB, prompt_bundle JSONB, is_official, download_count). GET /api/marketplace/workflows. POST /api/marketplace/workflows/[id]/install: loads into project n8n and agent_prompts.',
            agent_role:         'architect',
            task_type:          'schema',
            priority:           'medium',
            order_index:        0,
            estimated_cost_usd: 0.10,
          },
          {
            title:              'Seed official n8n workflow presets',
            description:        'Package the 3 existing n8n workflows (standard dispatch, QA runner, human verification) as installable presets. Add 5 new presets: (1) Code review bot, (2) Documentation generator, (3) Security scanner, (4) Cost optimiser, (5) Dependency analyser.',
            agent_role:         'automation_engineer',
            task_type:          'code',
            priority:           'medium',
            order_index:        1,
            estimated_cost_usd: 0.45,
          },
          {
            title:              'Workflow marketplace UI',
            description:        'Page at /marketplace/workflows. Filter by agent_role and task_type. Card: n8n icon, name, description, compatible roles, "Install" button. Install modal: shows what will be changed (prompts, n8n URL), confirm. Installed badge. Update when new version available.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        2,
            estimated_cost_usd: 0.24,
          },
        ],
      },
      {
        title:       'Marketplace Analytics & Governance',
        description: 'Usage analytics for marketplace items, community ratings, admin governance tools, and automated content moderation.',
        priority:    'low',
        order_index: 2,
        tasks: [
          {
            title:              'Usage analytics and ratings',
            description:        'Track: template imports per day, workflow installs, rating (1-5 stars with review text). Aggregate: weekly popular, trending (install velocity), top rated. POST /api/marketplace/[type]/[id]/rate with star + optional review. Recalculate avg_rating on write.',
            agent_role:         'backend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        0,
            estimated_cost_usd: 0.18,
          },
          {
            title:              'Admin moderation queue',
            description:        'Page at /admin/marketplace. Pending submissions list. Side-by-side diff: submitted content vs any existing version. Approve (sets status=published) / Reject with reason (email to author) / Request changes. Bulk actions. Content policy check with AI scanner.',
            agent_role:         'frontend_engineer',
            task_type:          'code',
            priority:           'low',
            order_index:        1,
            estimated_cost_usd: 0.24,
          },
        ],
      },
    ],
  },
]

// ── Computed totals ────────────────────────────────────────────────────────────
export const ROADMAP_V2_SUMMARY = {
  epics:    BUILD_OS_ROADMAP_V2.length,
  features: BUILD_OS_ROADMAP_V2.flatMap(e => e.features).length,
  tasks:    BUILD_OS_ROADMAP_V2.flatMap(e => e.features).flatMap(f => f.tasks).length,
  total_estimated_cost_usd: BUILD_OS_ROADMAP_V2
    .flatMap(e => e.features)
    .flatMap(f => f.tasks)
    .reduce((sum, t) => sum + t.estimated_cost_usd, 0),
}
