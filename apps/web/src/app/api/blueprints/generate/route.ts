/**
 * POST /api/blueprints/generate
 *
 * Phase 2 — Blueprint + Task Seed Engine
 * ----------------------------------------
 * Input:  idea_id (wizard_conversation id) + optional user_id
 * Output: blueprint_id, features[], epics[], tasks[], DB records
 *
 * Flow:
 *   1. Read wizard_conversation → collected_fields
 *   2. Map idea → features using FEATURE_MAP + keyword enrichment
 *   3. Create synthetic questionnaire (satisfies blueprint.questionnaire_id NOT NULL)
 *   4. Create blueprint
 *   5. Create blueprint_features
 *   6. Create epics (one per feature)
 *   7. Create features (one per epic)
 *   8. Create tasks (2-3 per feature, with dependencies)
 *   9. Update wizard_session → blueprint_ready
 *  10. Return full proof payload
 *
 * NO build trigger. NO GitHub. NO Vercel. Data only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollectedFields {
  raw_idea?: string
  idea_category?: string
  core_action?: string
  complexity?: string
  primary_user_action?: string
  confirmed?: boolean
}

interface FeatureTemplate {
  key: string
  title: string
  description: string
  priority?: 'critical' | 'high' | 'medium' | 'low'
}

interface TaskTemplate {
  title: string
  task_type: 'code' | 'schema' | 'document' | 'test' | 'design'
  agent_role: string
  description: string
  slug_suffix: string
  depends_on?: string[]  // slug suffixes within same feature
}

// ─── Feature Map ─────────────────────────────────────────────────────────────

const FEATURE_MAP: Record<string, FeatureTemplate[]> = {
  ai_product: [
    { key: 'dashboard', title: 'Dashboard', description: 'Main project dashboard with KPIs and status overview', priority: 'critical' },
    { key: 'file_upload', title: 'File Upload', description: 'Upload and manage input files for processing', priority: 'critical' },
    { key: 'processing_logic', title: 'AI Processing Engine', description: 'Core AI/ML processing logic and pipeline', priority: 'critical' },
    { key: 'results_view', title: 'Results View', description: 'Display processed results and actionable insights', priority: 'high' },
  ],
  marketplace: [
    { key: 'listings', title: 'Listings', description: 'Create, browse, and manage marketplace listings', priority: 'critical' },
    { key: 'search', title: 'Search & Filter', description: 'Search and filter listings by category and attributes', priority: 'high' },
    { key: 'user_profile', title: 'User Profiles', description: 'Buyer and seller profiles with ratings and history', priority: 'high' },
    { key: 'transactions', title: 'Transactions', description: 'End-to-end purchase and escrow flow', priority: 'critical' },
  ],
  saas: [
    { key: 'auth', title: 'Authentication', description: 'User signup, login, OAuth, and session management', priority: 'critical' },
    { key: 'dashboard', title: 'Dashboard', description: 'Main application dashboard with core metrics', priority: 'critical' },
    { key: 'settings', title: 'Settings', description: 'User and account settings management', priority: 'medium' },
    { key: 'api', title: 'Core API', description: 'Core product REST API endpoints with auth and validation', priority: 'critical' },
  ],
}

const DEFAULT_FEATURES: FeatureTemplate[] = [
  { key: 'auth', title: 'Authentication', description: 'User signup, login, and session management', priority: 'critical' },
  { key: 'dashboard', title: 'Dashboard', description: 'Main application dashboard', priority: 'high' },
  { key: 'api', title: 'Core API', description: 'Core product API endpoints', priority: 'critical' },
]

// ─── Keyword Enrichment ───────────────────────────────────────────────────────

const KEYWORD_MODULES: Array<{ keywords: string[]; feature: FeatureTemplate }> = [
  {
    keywords: ['invoice', 'invoic', 'receipt', 'reconcil', 'purchase order'],
    feature: { key: 'invoicing_module', title: 'Invoicing Module', description: 'Invoice creation, PO matching, and reconciliation engine', priority: 'critical' },
  },
  {
    keywords: ['payment', 'stripe', 'checkout', 'subscription'],
    feature: { key: 'stripe_module', title: 'Payment Integration', description: 'Stripe Checkout, subscriptions, and payment webhooks', priority: 'high' },
  },
  {
    keywords: ['email', 'newsletter', 'campaign', 'subscriber'],
    feature: { key: 'email_module', title: 'Email Engine', description: 'Email sending, templates, and campaign management', priority: 'high' },
  },
  {
    keywords: ['analytics', 'report', 'metric', 'chart', 'insight', 'tracking'],
    feature: { key: 'analytics_module', title: 'Analytics & Reporting', description: 'Metrics, charts, trend analysis, and data export', priority: 'medium' },
  },
  {
    keywords: ['notification', 'alert', 'remind'],
    feature: { key: 'notifications', title: 'Notifications', description: 'In-app and push notifications for key events', priority: 'medium' },
  },
]

// ─── Task Templates ───────────────────────────────────────────────────────────

const TASK_TEMPLATES: Record<string, TaskTemplate[]> = {
  dashboard: [
    { title: 'Create dashboard layout', task_type: 'code', agent_role: 'frontend_engineer', description: 'Build main dashboard layout with sidebar nav and content area', slug_suffix: 'layout' },
    { title: 'Create dashboard API route', task_type: 'code', agent_role: 'backend_engineer', description: 'GET /api/dashboard returning KPIs and recent activity', slug_suffix: 'api' },
    { title: 'Build dashboard UI components', task_type: 'code', agent_role: 'frontend_engineer', description: 'KPI cards, activity feed, and summary charts', slug_suffix: 'ui', depends_on: ['layout', 'api'] },
  ],
  file_upload: [
    { title: 'Create file upload endpoint', task_type: 'code', agent_role: 'backend_engineer', description: 'POST /api/upload with multipart form support, type validation, and size limits', slug_suffix: 'endpoint' },
    { title: 'Implement storage logic', task_type: 'code', agent_role: 'backend_engineer', description: 'Connect upload endpoint to Supabase Storage with path management', slug_suffix: 'storage', depends_on: ['endpoint'] },
    { title: 'Build file upload UI component', task_type: 'code', agent_role: 'frontend_engineer', description: 'Drag-and-drop upload zone with progress bar and file list', slug_suffix: 'ui', depends_on: ['endpoint'] },
  ],
  processing_logic: [
    { title: 'Implement core AI processing algorithm', task_type: 'code', agent_role: 'backend_engineer', description: 'Core processing logic: parse inputs, call AI model, return structured output', slug_suffix: 'algorithm' },
    { title: 'Create background processing job', task_type: 'code', agent_role: 'automation_engineer', description: 'Async job runner for long-running AI tasks with retry and timeout handling', slug_suffix: 'job', depends_on: ['algorithm'] },
    { title: 'Add processing status tracking', task_type: 'code', agent_role: 'backend_engineer', description: 'GET /api/jobs/[id] status endpoint + DB updates for progress polling', slug_suffix: 'status', depends_on: ['job'] },
  ],
  results_view: [
    { title: 'Create results API endpoint', task_type: 'code', agent_role: 'backend_engineer', description: 'GET /api/results/[id] returning structured processed output', slug_suffix: 'api' },
    { title: 'Build results UI component', task_type: 'code', agent_role: 'frontend_engineer', description: 'Results table, summary cards, and visual diff view', slug_suffix: 'ui', depends_on: ['api'] },
    { title: 'Add CSV/PDF export', task_type: 'code', agent_role: 'backend_engineer', description: 'Export results endpoint with CSV and PDF format support', slug_suffix: 'export', depends_on: ['api'] },
  ],
  invoicing_module: [
    { title: 'Create invoice and PO schema', task_type: 'schema', agent_role: 'backend_engineer', description: 'DB schema: invoices, purchase_orders, reconciliation_records, line_items', slug_suffix: 'schema' },
    { title: 'Build invoice matching API', task_type: 'code', agent_role: 'backend_engineer', description: 'POST /api/invoices/match — AI-powered PO-to-invoice matching with confidence scores', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Build invoice management UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Invoice list, detail view, approve/flag discrepancy actions', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  stripe_module: [
    { title: 'Integrate Stripe Checkout', task_type: 'code', agent_role: 'integration_engineer', description: 'Stripe Checkout session creation, success/cancel redirect handling', slug_suffix: 'checkout' },
    { title: 'Implement Stripe webhook handler', task_type: 'code', agent_role: 'backend_engineer', description: 'Handle payment_intent.succeeded, invoice.paid, subscription events', slug_suffix: 'webhook', depends_on: ['checkout'] },
    { title: 'Build pricing and payment UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Pricing page, checkout button, payment confirmation screen', slug_suffix: 'ui', depends_on: ['checkout'] },
  ],
  email_module: [
    { title: 'Set up email sending service', task_type: 'code', agent_role: 'integration_engineer', description: 'Integrate Resend or SendGrid with domain verification and rate limits', slug_suffix: 'service' },
    { title: 'Create email template engine', task_type: 'code', agent_role: 'backend_engineer', description: 'Dynamic email templates with React Email or MJML', slug_suffix: 'templates', depends_on: ['service'] },
    { title: 'Build campaign management UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Create, schedule, preview, and monitor email campaigns', slug_suffix: 'ui', depends_on: ['templates'] },
  ],
  analytics_module: [
    { title: 'Create analytics aggregation API', task_type: 'code', agent_role: 'backend_engineer', description: 'Postgres aggregation queries for metrics, timeseries, and breakdown data', slug_suffix: 'api' },
    { title: 'Build analytics dashboard', task_type: 'code', agent_role: 'frontend_engineer', description: 'Recharts/Chart.js dashboard with date range picker and KPI cards', slug_suffix: 'dashboard', depends_on: ['api'] },
  ],
  notifications: [
    { title: 'Create notifications schema', task_type: 'schema', agent_role: 'backend_engineer', description: 'DB schema for notifications with read/unread state and channels', slug_suffix: 'schema' },
    { title: 'Build notification API', task_type: 'code', agent_role: 'backend_engineer', description: 'Realtime notification delivery via Supabase Realtime + polling fallback', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Build notification bell UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Notification bell dropdown with badge count and mark-all-read', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  listings: [
    { title: 'Create listing schema', task_type: 'schema', agent_role: 'backend_engineer', description: 'DB schema: listings, categories, attributes, images, status', slug_suffix: 'schema' },
    { title: 'Build listings CRUD API', task_type: 'code', agent_role: 'backend_engineer', description: 'Create, read, update, delete + publish/unpublish endpoints', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Build listing cards and detail page', task_type: 'code', agent_role: 'frontend_engineer', description: 'Listing grid, card component, and full detail page', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  search: [
    { title: 'Implement full-text search API', task_type: 'code', agent_role: 'backend_engineer', description: 'Postgres FTS with tsvector, filters, pagination, and relevance ranking', slug_suffix: 'api' },
    { title: 'Build search and filter UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Search bar with autocomplete, filter sidebar, and results grid', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  user_profile: [
    { title: 'Create profile schema', task_type: 'schema', agent_role: 'backend_engineer', description: 'DB schema: profiles, ratings, verification_status, public fields', slug_suffix: 'schema' },
    { title: 'Build profile API', task_type: 'code', agent_role: 'backend_engineer', description: 'Public profile endpoint, profile edit, rating submission', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Build profile page UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Profile header, listings grid, ratings display, and edit form', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  transactions: [
    { title: 'Create transaction schema', task_type: 'schema', agent_role: 'backend_engineer', description: 'DB schema: transactions, escrow_status, dispute_records', slug_suffix: 'schema' },
    { title: 'Build transaction API', task_type: 'code', agent_role: 'backend_engineer', description: 'Purchase initiation, confirmation, release, and dispute endpoints', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Build checkout flow UI', task_type: 'code', agent_role: 'frontend_engineer', description: 'Cart, purchase form, confirmation, and order history screens', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  auth: [
    { title: 'Configure Supabase Auth', task_type: 'code', agent_role: 'backend_engineer', description: 'Supabase Auth setup with email/password, OAuth (Google/GitHub), and MFA', slug_suffix: 'setup' },
    { title: 'Build login, signup, and reset pages', task_type: 'code', agent_role: 'frontend_engineer', description: 'Login, signup, forgot-password, and email-verification pages', slug_suffix: 'pages', depends_on: ['setup'] },
    { title: 'Implement session middleware', task_type: 'code', agent_role: 'backend_engineer', description: 'Next.js middleware for protected routes and session cookie refresh', slug_suffix: 'middleware', depends_on: ['setup'] },
  ],
  settings: [
    { title: 'Create settings API', task_type: 'code', agent_role: 'backend_engineer', description: 'GET/PATCH /api/settings for profile, notification, and account preferences', slug_suffix: 'api' },
    { title: 'Build settings page', task_type: 'code', agent_role: 'frontend_engineer', description: 'Tabbed settings page: profile, notifications, billing, danger zone', slug_suffix: 'ui', depends_on: ['api'] },
  ],
  api: [
    { title: 'Design core data schema', task_type: 'schema', agent_role: 'architect', description: 'Database schema for core product entities, relationships, and indexes', slug_suffix: 'schema' },
    { title: 'Build core CRUD API', task_type: 'code', agent_role: 'backend_engineer', description: 'Core product endpoints with Zod validation, auth middleware, and error handling', slug_suffix: 'api', depends_on: ['schema'] },
    { title: 'Write API documentation', task_type: 'document', agent_role: 'documentation_engineer', description: 'OpenAPI 3.0 spec and developer guide for all core endpoints', slug_suffix: 'docs', depends_on: ['api'] },
  ],
}

// ─── Tech Stack ───────────────────────────────────────────────────────────────

const TECH_STACK: Record<string, object> = {
  ai_product: {
    frontend: { tool: 'Next.js 14 (App Router)', reasoning: 'SSR for fast initial load; App Router for nested layouts' },
    backend: { tool: 'Next.js API Routes + Supabase', reasoning: 'Serverless API with managed Postgres and auth' },
    ai: { tool: 'OpenAI GPT-4o / Claude Haiku', reasoning: 'LLM API for processing logic; Haiku for cost efficiency' },
    storage: { tool: 'Supabase Storage', reasoning: 'S3-compatible storage with Postgres integration' },
    styling: { tool: 'Tailwind CSS + shadcn/ui', reasoning: 'Rapid UI development with accessible components' },
  },
  marketplace: {
    frontend: { tool: 'Next.js 14 (App Router)', reasoning: 'SEO-critical pages need SSR; dynamic routing for listings' },
    backend: { tool: 'Next.js API Routes + Supabase', reasoning: 'Realtime updates for bids/offers; managed auth' },
    payments: { tool: 'Stripe Connect', reasoning: 'Marketplace payment splits and escrow management' },
    search: { tool: 'Postgres FTS + Supabase', reasoning: 'Full-text search without additional infrastructure' },
    styling: { tool: 'Tailwind CSS + shadcn/ui', reasoning: 'Clean marketplace UI with consistent component library' },
  },
  saas: {
    frontend: { tool: 'Next.js 14 (App Router)', reasoning: 'App Router for nested layouts and data fetching patterns' },
    backend: { tool: 'Next.js API Routes + Supabase', reasoning: 'Managed Postgres, auth, and realtime — all in one' },
    payments: { tool: 'Stripe Checkout + Billing', reasoning: 'Subscription management with minimal setup' },
    styling: { tool: 'Tailwind CSS + shadcn/ui', reasoning: 'Accessible SaaS UI components out of the box' },
    deployment: { tool: 'Vercel', reasoning: 'Zero-config Next.js deployment with edge network' },
  },
}

// ─── Helper: slugify ──────────────────────────────────────────────────────────

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

// ─── Helper: resolve features from idea ──────────────────────────────────────

function resolveFeatures(fields: CollectedFields): FeatureTemplate[] {
  const category = fields.idea_category || 'saas'
  const baseFeatures: FeatureTemplate[] = FEATURE_MAP[category] ?? DEFAULT_FEATURES

  // Keyword enrichment against raw_idea + primary_user_action
  const text = `${fields.raw_idea || ''} ${fields.primary_user_action || ''}`.toLowerCase()
  const enriched: FeatureTemplate[] = [...baseFeatures]

  for (const mod of KEYWORD_MODULES) {
    if (mod.keywords.some(kw => text.includes(kw))) {
      // Only add if not already in list
      if (!enriched.find(f => f.key === mod.feature.key)) {
        enriched.push(mod.feature)
      }
    }
  }

  return enriched
}

// ─── Helper: build blueprint summary ─────────────────────────────────────────

function buildSummary(fields: CollectedFields, features: FeatureTemplate[]): string {
  const category = fields.idea_category ?? 'product'
  const action = fields.primary_user_action ?? fields.raw_idea ?? 'the core use case'
  const featureNames = features.map(f => f.title).join(', ')
  return `This is a ${category} built around the core user action: "${action}". ` +
    `The blueprint covers ${features.length} feature modules: ${featureNames}. ` +
    `Complexity: ${fields.complexity ?? 'medium'}. Ready for task-level execution.`
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function resolveAuth(req: NextRequest): Promise<{ userId: string | null; isInternal: boolean }> {
  const secret = process.env.BUILDOS_SECRET || process.env.BUILDOS_INTERNAL_SECRET || ''
  const header = req.headers.get('X-Buildos-Secret') || ''
  if (secret && header === secret) {
    return { userId: null, isInternal: true }
  }
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { userId: user?.id ?? null, isInternal: false }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleGenerate(req: NextRequest): Promise<NextResponse> {
  const { userId, isInternal } = await resolveAuth(req)
  if (!isInternal && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { idea_id, user_id: bodyUserId } = body as { idea_id?: string; user_id?: string }
  const effectiveUserId = bodyUserId || userId

  if (!idea_id) {
    return NextResponse.json({ error: 'idea_id is required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // ── 1. Load wizard_conversation ──────────────────────────────────────────
  const { data: conv, error: convErr } = await admin
    .from('wizard_conversations')
    .select('id, project_id, session_id, collected_fields, readiness')
    .eq('id', idea_id)
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: `Idea not found: ${idea_id}` }, { status: 404 })
  }

  const fields = (conv.collected_fields ?? {}) as CollectedFields
  const projectId = conv.project_id as string

  if (!fields.confirmed) {
    return NextResponse.json({ error: 'Idea must be confirmed before generating blueprint' }, { status: 422 })
  }

  // ── 2. Load project ──────────────────────────────────────────────────────
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('id, name, project_type, workspace_id')
    .eq('id', projectId)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: `Project not found: ${projectId}` }, { status: 404 })
  }

  // ── 3. Feature resolution ────────────────────────────────────────────────
  const features = resolveFeatures(fields)
  const category = fields.idea_category ?? 'saas'

  // ── 4. Create synthetic questionnaire (satisfies blueprints.questionnaire_id FK) ─
  // Upsert by (project_id, version=1) — idempotent
  const questionnairePayload = {
    project_id: projectId,
    version: 1,
    status: 'completed',
    questions: [
      { id: 'raw_idea', question: 'Describe your idea', answer: fields.raw_idea ?? '' },
      { id: 'idea_category', question: 'Product category', answer: fields.idea_category ?? '' },
      { id: 'core_action', question: 'Core user action', answer: fields.core_action ?? '' },
      { id: 'complexity', question: 'Complexity', answer: fields.complexity ?? '' },
      { id: 'primary_user_action', question: 'Primary user action', answer: fields.primary_user_action ?? '' },
    ],
    completed_at: new Date().toISOString(),
  }

  const { data: questionnaire, error: qErr } = await admin
    .from('questionnaires')
    .upsert(questionnairePayload, { onConflict: 'project_id,version', ignoreDuplicates: false })
    .select('id')
    .single()

  if (qErr || !questionnaire) {
    return NextResponse.json({ error: `Questionnaire upsert failed: ${qErr?.message}` }, { status: 500 })
  }

  // ── 5. Create blueprint ──────────────────────────────────────────────────
  const blueprintVersion = 1
  const techStack = TECH_STACK[category] ?? TECH_STACK['saas']
  const summary = buildSummary(fields, features)

  const { data: blueprint, error: bpErr } = await admin
    .from('blueprints')
    .upsert({
      project_id: projectId,
      questionnaire_id: questionnaire.id,
      version: blueprintVersion,
      status: 'draft',
      summary,
      goals: [
        `Enable users to ${fields.primary_user_action ?? fields.core_action ?? 'achieve their goal'}`,
        `Deliver a production-ready ${category} within defined scope`,
        `Achieve core functionality for ${fields.idea_category ?? 'the product'} use case`,
      ],
      non_goals: [
        'Native mobile app (web-first, mobile-responsive)',
        'Offline support (deferred to Phase 2)',
        'Multi-language i18n (English only for v1)',
      ],
      user_personas: [fields.raw_idea?.slice(0, 120) ?? 'End user'],
      feature_list: features.map(f => f.title),
      tech_stack_recommendation: techStack,
      risk_flags: [
        'AI processing costs may scale non-linearly with usage',
        'Third-party API rate limits may affect throughput',
      ],
      generated_by_agent: 'phase2-blueprint-generator',
    }, { onConflict: 'project_id,version', ignoreDuplicates: false })
    .select('id, status, version')
    .single()

  if (bpErr || !blueprint) {
    return NextResponse.json({ error: `Blueprint creation failed: ${bpErr?.message}` }, { status: 500 })
  }

  // ── 6. Create blueprint_features ─────────────────────────────────────────
  const bpFeaturePayloads = features.map((f, i) => ({
    blueprint_id: blueprint.id,
    project_id: projectId,
    title: f.title,
    description: f.description,
    priority: f.priority ?? 'medium',
    order_index: i + 1,
  }))

  const { data: bpFeatures, error: bpfErr } = await admin
    .from('blueprint_features')
    .insert(bpFeaturePayloads)
    .select('id, title, priority, order_index')

  if (bpfErr) {
    console.error('[blueprints/generate] blueprint_features insert failed:', bpfErr)
    // Non-fatal — continue
  }

  // ── 7. Create epics (one per feature) ────────────────────────────────────
  const epicPayloads = features.map((f, i) => ({
    project_id: projectId,
    title: f.title,
    description: f.description,
    status: 'pending',
    priority: f.priority ?? 'medium',
    order_index: i + 1,
    slug: toSlug(f.title),
  }))

  const { data: epics, error: epicErr } = await admin
    .from('epics')
    .insert(epicPayloads)
    .select('id, title, slug, order_index')

  if (epicErr || !epics) {
    return NextResponse.json({ error: `Epic creation failed: ${epicErr?.message}` }, { status: 500 })
  }

  // ── 8. Create features (one per epic, representing the feature module) ───
  const featurePayloads = features.map((f, i) => ({
    epic_id: epics[i].id,
    project_id: projectId,
    title: `${f.title} — Core Implementation`,
    description: f.description,
    acceptance_criteria: `${f.title} is fully implemented, tested, and integrated with the rest of the system`,
    status: 'pending',
    priority: f.priority ?? 'medium',
    order_index: 1,
    slug: toSlug(`${f.title}-core`),
  }))

  const { data: dbFeatures, error: featErr } = await admin
    .from('features')
    .insert(featurePayloads)
    .select('id, title, slug, epic_id')

  if (featErr || !dbFeatures) {
    return NextResponse.json({ error: `Feature creation failed: ${featErr?.message}` }, { status: 500 })
  }

  // ── 9. Create tasks (per feature, with dependencies) ─────────────────────
  const allTaskPayloads: object[] = []

  for (let fi = 0; fi < features.length; fi++) {
    const feat = features[fi]
    const dbFeat = dbFeatures[fi]
    const templates = TASK_TEMPLATES[feat.key] ?? TASK_TEMPLATES['api']

    // Build slug → order_index map for dependency resolution
    const slugMap: Record<string, number> = {}
    templates.forEach((t, ti) => {
      slugMap[t.slug_suffix] = ti + 1
    })

    templates.forEach((t, ti) => {
      const taskSlug = toSlug(`${feat.key}-${t.slug_suffix}`)
      const depSlugs = (t.depends_on ?? []).map(d => toSlug(`${feat.key}-${d}`))

      allTaskPayloads.push({
        feature_id: dbFeat.id,
        project_id: projectId,
        title: t.title,
        description: t.description,
        agent_role: t.agent_role,
        status: 'pending',
        task_type: t.task_type,
        priority: feat.priority ?? 'medium',
        order_index: ti + 1,
        slug: taskSlug,
        context_payload: {
          source: 'phase2_blueprint_generator',
          blueprint_id: blueprint.id,
          epic_title: feat.title,
          feature_title: `${feat.title} — Core Implementation`,
          task_description: t.description,
          agent_role: t.agent_role,
          idea_category: category,
          primary_user_action: fields.primary_user_action ?? '',
        },
        expected_output_schema: {
          type: 'object',
          properties: {
            files_created: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
        },
      })
    })
  }

  const { data: tasks, error: taskErr } = await admin
    .from('tasks')
    .insert(allTaskPayloads)
    .select('id, title, status, task_type, agent_role, order_index, slug, feature_id')

  if (taskErr || !tasks) {
    return NextResponse.json({ error: `Task creation failed: ${taskErr?.message}` }, { status: 500 })
  }

  // ── 10. Update wizard_session → blueprint_ready ───────────────────────────
  if (conv.session_id) {
    await admin
      .from('wizard_sessions')
      .update({
        current_step: 'blueprint_ready',
        status: 'IN_PROGRESS',
        metadata: {
          wizard_state: {
            step: 5,
            phase: 'blueprint_ready',
            blueprint_id: blueprint.id,
            ready_for_build: true,
          },
        },
      })
      .eq('id', conv.session_id)
  }

  // ── 11. Update project → blueprint linked ─────────────────────────────────
  await admin
    .from('projects')
    .update({ status: 'draft' })  // remains draft — no build trigger yet
    .eq('id', projectId)

  // ── 12. Build response ────────────────────────────────────────────────────
  const tasksByFeature = features.map((feat, fi) => {
    const dbFeat = dbFeatures[fi]
    const featTasks = tasks.filter(t => t.feature_id === dbFeat.id)
    return {
      feature_key: feat.key,
      feature_title: feat.title,
      feature_id: dbFeat.id,
      epic_id: epics[fi].id,
      task_count: featTasks.length,
      tasks: featTasks.map(t => ({
        task_id: t.id,
        title: t.title,
        task_type: t.task_type,
        agent_role: t.agent_role,
        status: t.status,
        slug: t.slug,
      })),
    }
  })

  return NextResponse.json({
    blueprint_id: blueprint.id,
    project_id: projectId,
    status: blueprint.status,
    version: blueprint.version,
    summary,
    features_generated: features.map(f => ({ key: f.key, title: f.title, priority: f.priority })),
    task_seeds: tasksByFeature,
    totals: {
      features: features.length,
      epics: epics.length,
      tasks: tasks.length,
    },
    ready_for_build: true,
    created_at: new Date().toISOString(),
  })
}

// ─── Route export ─────────────────────────────────────────────────────────────

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    return await handleGenerate(req)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[blueprints/generate]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
