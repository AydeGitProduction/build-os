/**
 * platform-registry.ts
 *
 * Maps project_type → full platform context.
 * Used by:
 *   1. processor.ts  — injects domain DNA into every agent system prompt
 *   2. scaffold API  — generates correct initial files after wizard completion
 *
 * ADDING A NEW PLATFORM TYPE:
 *   1. Add entry to PLATFORM_REGISTRY below
 *   2. Add scaffold template in scaffold-generator.ts
 *   3. Add project_type value to the wizard SELECT in projects/new/page.tsx
 */

export interface PlatformContext {
  /** Human-readable product name, e.g. "AI Newsletter Platform" */
  name: string
  /** One-line domain description for agent system prompts */
  domain: string
  /** Core domain entities (nouns). Agents use these for naming. */
  entities: string[]
  /** Sidebar navigation items in order */
  nav: Array<{ label: string; href: string; icon: string }>
  /** Dashboard KPI names */
  metrics: string[]
  /**
   * Terms agents MUST NOT use.
   * Prevents BuildOS terminology leaking into client platforms.
   */
  forbiddenTerms: string[]
  /**
   * Domain-specific DB tables this platform will use.
   * Injected as SCHEMA LOCK for code/schema/test tasks.
   */
  schemaHint: string
  /**
   * Extra file path rules appended to FILE PATH RULES section.
   * Platform-specific conventions beyond Next.js defaults.
   */
  filePathRules: string
  /** Example API routes so agents generate correct paths */
  exampleRoutes: string[]
  /** Short tagline shown in dashboard header subtitle */
  tagline: string
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const PLATFORM_REGISTRY: Record<string, PlatformContext> = {

  // ── AI Newsletter Platform ──────────────────────────────────────────────────
  ai_newsletter: {
    name: 'AI Newsletter Platform',
    tagline: 'AI-powered email campaigns and subscriber management',
    domain: 'email marketing, AI content generation, and subscriber lifecycle management',
    entities: [
      'Campaign', 'Subscriber', 'AudienceList', 'EmailTemplate',
      'SendJob', 'CampaignAnalytics', 'AutomationSequence', 'AIContent',
    ],
    nav: [
      { label: 'Dashboard',     href: '/dashboard',     icon: 'LayoutDashboard' },
      { label: 'Campaigns',     href: '/campaigns',     icon: 'Mail' },
      { label: 'Subscribers',   href: '/subscribers',   icon: 'Users' },
      { label: 'Templates',     href: '/templates',     icon: 'FileText' },
      { label: 'AI Generator',  href: '/ai-generator',  icon: 'Sparkles' },
      { label: 'Automations',   href: '/automations',   icon: 'Zap' },
      { label: 'Analytics',     href: '/analytics',     icon: 'BarChart2' },
      { label: 'Settings',      href: '/settings',      icon: 'Settings' },
    ],
    metrics: [
      'total_subscribers', 'active_campaigns', 'avg_open_rate',
      'avg_click_rate', 'emails_sent_this_month', 'unsubscribe_rate',
    ],
    forbiddenTerms: [
      'Build OS', 'pipeline', 'orchestration', 'task queue', 'agent', 'blueprint',
      'epic', 'ProjectOverviewCards', 'ProjectCard', 'project board',
    ],
    schemaHint: `
PLATFORM SCHEMA — AI Newsletter Platform:
Core tables: campaigns, subscribers, audience_lists, email_templates,
send_jobs, campaign_analytics, automation_sequences, automation_steps,
ai_content_generations, subscriber_events, unsubscribes, bounce_logs,
campaign_segments, api_keys, webhook_endpoints

Use these for all DB references. Do NOT reference BuildOS internal tables
(tasks, blueprints, job_queue, etc.) in this platform's code.
    `.trim(),
    filePathRules: `
- Campaign pages: src/app/(dashboard)/campaigns/page.tsx
- Subscriber pages: src/app/(dashboard)/subscribers/page.tsx
- Template editor: src/app/(dashboard)/templates/[id]/page.tsx
- AI generator: src/app/(dashboard)/ai-generator/page.tsx
- Automation flows: src/app/(dashboard)/automations/page.tsx
- Analytics: src/app/(dashboard)/analytics/page.tsx
- Email-specific components: src/components/email/ComponentName.tsx
- Campaign components: src/components/campaigns/ComponentName.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/campaigns/route.ts',
      'src/app/api/campaigns/[id]/route.ts',
      'src/app/api/subscribers/route.ts',
      'src/app/api/subscribers/[id]/route.ts',
      'src/app/api/templates/route.ts',
      'src/app/api/ai-generate/route.ts',
      'src/app/api/send-jobs/route.ts',
      'src/app/api/analytics/route.ts',
    ],
  },

  // ── Generic SaaS ────────────────────────────────────────────────────────────
  saas: {
    name: 'SaaS Platform',
    tagline: 'Subscription-based web application',
    domain: 'subscription SaaS, user management, and billing',
    entities: [
      'User', 'Organization', 'Subscription', 'Plan', 'Feature',
      'Invoice', 'UsageRecord', 'ApiKey', 'Webhook',
    ],
    nav: [
      { label: 'Dashboard',     href: '/dashboard',     icon: 'LayoutDashboard' },
      { label: 'Users',         href: '/users',         icon: 'Users' },
      { label: 'Organizations', href: '/organizations', icon: 'Building2' },
      { label: 'Billing',       href: '/billing',       icon: 'CreditCard' },
      { label: 'Analytics',     href: '/analytics',     icon: 'BarChart2' },
      { label: 'API Keys',      href: '/api-keys',      icon: 'Key' },
      { label: 'Settings',      href: '/settings',      icon: 'Settings' },
    ],
    metrics: [
      'mrr', 'arr', 'active_subscriptions', 'churn_rate',
      'new_signups_this_month', 'active_users',
    ],
    forbiddenTerms: [
      'Build OS', 'pipeline', 'orchestration', 'task queue', 'blueprint',
      'epic', 'railway worker',
    ],
    schemaHint: `
PLATFORM SCHEMA — SaaS Platform:
Core tables: users, organizations, organization_members, subscriptions,
plans, plan_features, invoices, usage_records, api_keys, webhooks,
webhook_deliveries, audit_logs, feature_flags, sessions

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- User management: src/app/(dashboard)/users/page.tsx
- Billing: src/app/(dashboard)/billing/page.tsx
- Organization pages: src/app/(dashboard)/organizations/[id]/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/users/route.ts',
      'src/app/api/organizations/route.ts',
      'src/app/api/subscriptions/route.ts',
      'src/app/api/billing/route.ts',
    ],
  },

  // ── CRM ─────────────────────────────────────────────────────────────────────
  crm: {
    name: 'CRM Platform',
    tagline: 'Customer relationship management and sales pipeline',
    domain: 'customer relationship management, sales pipeline, and deal tracking',
    entities: [
      'Contact', 'Company', 'Deal', 'Pipeline', 'Stage', 'Activity',
      'Note', 'Task', 'EmailThread', 'Lead', 'Opportunity',
    ],
    nav: [
      { label: 'Dashboard',  href: '/dashboard',  icon: 'LayoutDashboard' },
      { label: 'Contacts',   href: '/contacts',   icon: 'Users' },
      { label: 'Companies',  href: '/companies',  icon: 'Building2' },
      { label: 'Deals',      href: '/deals',      icon: 'TrendingUp' },
      { label: 'Pipeline',   href: '/pipeline',   icon: 'Kanban' },
      { label: 'Activities', href: '/activities', icon: 'Calendar' },
      { label: 'Reports',    href: '/reports',    icon: 'BarChart2' },
      { label: 'Settings',   href: '/settings',   icon: 'Settings' },
    ],
    metrics: [
      'total_contacts', 'open_deals', 'pipeline_value',
      'deals_won_this_month', 'deals_lost_this_month', 'avg_deal_size',
    ],
    forbiddenTerms: [
      'Build OS', 'orchestration', 'task queue', 'blueprint', 'epic',
      'railway worker', 'agent dispatch',
    ],
    schemaHint: `
PLATFORM SCHEMA — CRM:
Core tables: contacts, companies, deals, pipelines, pipeline_stages,
activities, notes, tasks, email_threads, email_messages, leads,
opportunities, tags, contact_tags, deal_activities, users, teams

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- Contact pages: src/app/(dashboard)/contacts/page.tsx
- Deal pages: src/app/(dashboard)/deals/page.tsx
- Pipeline board: src/app/(dashboard)/pipeline/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/contacts/route.ts',
      'src/app/api/deals/route.ts',
      'src/app/api/pipeline/route.ts',
      'src/app/api/activities/route.ts',
    ],
  },

  // ── Marketplace ─────────────────────────────────────────────────────────────
  marketplace: {
    name: 'Marketplace Platform',
    tagline: 'Two-sided platform connecting buyers and sellers',
    domain: 'marketplace, e-commerce, and two-sided platform management',
    entities: [
      'Listing', 'Seller', 'Buyer', 'Order', 'Product', 'Category',
      'Review', 'Payment', 'Payout', 'Dispute', 'Message',
    ],
    nav: [
      { label: 'Dashboard',  href: '/dashboard',  icon: 'LayoutDashboard' },
      { label: 'Listings',   href: '/listings',   icon: 'Package' },
      { label: 'Orders',     href: '/orders',     icon: 'ShoppingCart' },
      { label: 'Sellers',    href: '/sellers',    icon: 'Store' },
      { label: 'Buyers',     href: '/buyers',     icon: 'Users' },
      { label: 'Payments',   href: '/payments',   icon: 'CreditCard' },
      { label: 'Reviews',    href: '/reviews',    icon: 'Star' },
      { label: 'Settings',   href: '/settings',   icon: 'Settings' },
    ],
    metrics: [
      'total_listings', 'active_orders', 'gmv_this_month',
      'new_sellers', 'avg_order_value', 'dispute_rate',
    ],
    forbiddenTerms: [
      'Build OS', 'pipeline', 'orchestration', 'blueprint', 'epic',
      'task queue', 'railway worker',
    ],
    schemaHint: `
PLATFORM SCHEMA — Marketplace:
Core tables: listings, sellers, buyers, orders, order_items, products,
categories, reviews, payments, payouts, disputes, messages, conversations,
shipping_records, promotions, coupons, users

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- Listing pages: src/app/(dashboard)/listings/page.tsx
- Order management: src/app/(dashboard)/orders/page.tsx
- Seller pages: src/app/(dashboard)/sellers/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/listings/route.ts',
      'src/app/api/orders/route.ts',
      'src/app/api/sellers/route.ts',
      'src/app/api/payments/route.ts',
    ],
  },

  // ── AI Application ──────────────────────────────────────────────────────────
  ai_app: {
    name: 'AI Application',
    tagline: 'LLM-powered intelligent system',
    domain: 'AI/LLM application, prompt management, and intelligent automation',
    entities: [
      'Conversation', 'Message', 'Prompt', 'Model', 'Usage',
      'KnowledgeBase', 'Document', 'Embedding', 'APIKey', 'Workspace',
    ],
    nav: [
      { label: 'Dashboard',     href: '/dashboard',     icon: 'LayoutDashboard' },
      { label: 'Conversations', href: '/conversations', icon: 'MessageSquare' },
      { label: 'Prompts',       href: '/prompts',       icon: 'FileText' },
      { label: 'Knowledge',     href: '/knowledge',     icon: 'Database' },
      { label: 'Models',        href: '/models',        icon: 'Cpu' },
      { label: 'Usage',         href: '/usage',         icon: 'BarChart2' },
      { label: 'API Keys',      href: '/api-keys',      icon: 'Key' },
      { label: 'Settings',      href: '/settings',      icon: 'Settings' },
    ],
    metrics: [
      'total_conversations', 'messages_today', 'tokens_used_this_month',
      'active_users', 'avg_response_time_ms', 'monthly_ai_cost',
    ],
    forbiddenTerms: [
      'Build OS', 'orchestration', 'task queue', 'blueprint', 'epic',
      'railway worker',
    ],
    schemaHint: `
PLATFORM SCHEMA — AI Application:
Core tables: conversations, messages, prompts, prompt_versions,
knowledge_bases, documents, embeddings, usage_records, models,
model_configurations, api_keys, workspaces, workspace_members,
users, feedback_records

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- Chat UI: src/app/(dashboard)/conversations/page.tsx
- Prompt library: src/app/(dashboard)/prompts/page.tsx
- Knowledge base: src/app/(dashboard)/knowledge/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/conversations/route.ts',
      'src/app/api/conversations/[id]/messages/route.ts',
      'src/app/api/prompts/route.ts',
      'src/app/api/knowledge/route.ts',
      'src/app/api/chat/route.ts',
    ],
  },

  // ── Productivity Tool ────────────────────────────────────────────────────────
  tool: {
    name: 'Productivity Tool',
    tagline: 'Developer and team productivity software',
    domain: 'developer productivity, workflow automation, and team collaboration',
    entities: [
      'Workspace', 'Project', 'Task', 'User', 'Team',
      'Integration', 'Automation', 'Report', 'Template',
    ],
    nav: [
      { label: 'Dashboard',    href: '/dashboard',    icon: 'LayoutDashboard' },
      { label: 'Workspaces',   href: '/workspaces',   icon: 'Layers' },
      { label: 'Projects',     href: '/projects',     icon: 'FolderKanban' },
      { label: 'Tasks',        href: '/tasks',        icon: 'CheckSquare' },
      { label: 'Automations',  href: '/automations',  icon: 'Zap' },
      { label: 'Integrations', href: '/integrations', icon: 'Plug' },
      { label: 'Reports',      href: '/reports',      icon: 'BarChart2' },
      { label: 'Settings',     href: '/settings',     icon: 'Settings' },
    ],
    metrics: [
      'active_workspaces', 'tasks_completed_today', 'open_tasks',
      'team_members', 'automations_run', 'time_saved_hours',
    ],
    forbiddenTerms: [
      'Build OS', 'blueprint', 'orchestration engine', 'railway worker',
      'agent dispatch', 'job queue',
    ],
    schemaHint: `
PLATFORM SCHEMA — Productivity Tool:
Core tables: workspaces, workspace_members, projects, tasks,
task_assignments, comments, attachments, automations, automation_runs,
integrations, reports, templates, users, teams, team_members

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- Workspace pages: src/app/(dashboard)/workspaces/page.tsx
- Project kanban: src/app/(dashboard)/projects/[id]/page.tsx
- Task views: src/app/(dashboard)/tasks/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/workspaces/route.ts',
      'src/app/api/projects/route.ts',
      'src/app/api/tasks/route.ts',
      'src/app/api/automations/route.ts',
    ],
  },

  // ── API Product ─────────────────────────────────────────────────────────────
  api: {
    name: 'API Platform',
    tagline: 'Developer-facing API product and SDK',
    domain: 'developer API platform, SDK distribution, and API key management',
    entities: [
      'ApiKey', 'Endpoint', 'Request', 'Response', 'Webhook',
      'RateLimit', 'UsageRecord', 'Developer', 'Application', 'Version',
    ],
    nav: [
      { label: 'Dashboard',  href: '/dashboard',  icon: 'LayoutDashboard' },
      { label: 'API Keys',   href: '/api-keys',   icon: 'Key' },
      { label: 'Usage',      href: '/usage',      icon: 'BarChart2' },
      { label: 'Webhooks',   href: '/webhooks',   icon: 'Globe' },
      { label: 'Logs',       href: '/logs',       icon: 'FileText' },
      { label: 'Developers', href: '/developers', icon: 'Users' },
      { label: 'Billing',    href: '/billing',    icon: 'CreditCard' },
      { label: 'Settings',   href: '/settings',   icon: 'Settings' },
    ],
    metrics: [
      'api_calls_today', 'active_api_keys', 'error_rate',
      'avg_latency_ms', 'monthly_revenue', 'registered_developers',
    ],
    forbiddenTerms: [
      'Build OS', 'blueprint', 'orchestration', 'railway worker',
      'task queue', 'epic',
    ],
    schemaHint: `
PLATFORM SCHEMA — API Platform:
Core tables: api_keys, applications, developers, requests, responses,
webhooks, webhook_deliveries, rate_limits, usage_records, invoices,
plans, plan_limits, audit_logs, endpoints, versions, users

Use these for all DB references in this platform.
    `.trim(),
    filePathRules: `
- API key management: src/app/(dashboard)/api-keys/page.tsx
- Usage analytics: src/app/(dashboard)/usage/page.tsx
- Request logs: src/app/(dashboard)/logs/page.tsx
    `.trim(),
    exampleRoutes: [
      'src/app/api/v1/keys/route.ts',
      'src/app/api/v1/usage/route.ts',
      'src/app/api/v1/webhooks/route.ts',
      'src/app/api/v1/logs/route.ts',
    ],
  },

}

// ── Fallback for unknown project types ────────────────────────────────────────

const DEFAULT_CONTEXT: PlatformContext = {
  name: 'Web Platform',
  tagline: 'Custom web application',
  domain: 'web application development',
  entities: ['User', 'Resource', 'Settings'],
  nav: [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Settings',  href: '/settings',  icon: 'Settings' },
  ],
  metrics: ['active_users', 'sessions_today'],
  forbiddenTerms: ['Build OS', 'blueprint', 'orchestration', 'railway worker'],
  schemaHint: 'Use appropriate tables for the domain being built.',
  filePathRules: '',
  exampleRoutes: [],
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getPlatformContext(projectType: string | null | undefined): PlatformContext {
  if (!projectType) return DEFAULT_CONTEXT
  return PLATFORM_REGISTRY[projectType] ?? DEFAULT_CONTEXT
}

export function listPlatformTypes(): string[] {
  return Object.keys(PLATFORM_REGISTRY)
}
