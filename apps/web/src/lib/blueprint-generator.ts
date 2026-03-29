/**
 * Build OS — Blueprint Generator V1 (Template-Based)
 *
 * Phase 3 implementation. No AI — uses deterministic templates based on
 * questionnaire answers. Phase 4 will replace this with AI agent execution.
 */

import type { OnboardingAnswers, ProjectType } from '@/lib/types'

// ─── Blueprint Output ─────────────────────────────────────────────────────────
export interface GeneratedBlueprint {
  summary: string
  goals: string[]
  non_goals: string[]
  user_personas: string[]
  features: GeneratedFeature[]
  tech_stack: TechStackRecommendation
  risk_flags: RiskFlag[]
}

export interface GeneratedFeature {
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface TechStackRecommendation {
  frontend: string[]
  backend: string[]
  database: string[]
  auth: string[]
  devops: string[]
  ai?: string[]
}

export interface RiskFlag {
  area: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

// ─── Execution Plan ───────────────────────────────────────────────────────────
export interface GeneratedEpic {
  title: string
  description: string
  order_index: number
  features: GeneratedEpicFeature[]
}

export interface GeneratedEpicFeature {
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  order_index: number
  tasks: GeneratedTask[]
}

export interface GeneratedTask {
  title: string
  description: string
  agent_role: string
  task_type: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  order_index: number
  estimated_cost_usd: number
}

// ─── Tech Stack Templates ─────────────────────────────────────────────────────
const TECH_STACKS: Record<string, TechStackRecommendation> = {
  saas: {
    frontend:  ['Next.js 14', 'Tailwind CSS', 'TypeScript'],
    backend:   ['Next.js API Routes', 'tRPC'],
    database:  ['Supabase (PostgreSQL)', 'pgvector'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel', 'GitHub Actions'],
  },
  crm: {
    frontend:  ['Next.js 14', 'Tailwind CSS', 'TypeScript'],
    backend:   ['Next.js API Routes', 'Prisma'],
    database:  ['Supabase (PostgreSQL)'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel', 'GitHub Actions'],
  },
  ai_app: {
    frontend:  ['Next.js 14', 'Tailwind CSS', 'TypeScript'],
    backend:   ['Next.js API Routes', 'LangChain'],
    database:  ['Supabase (PostgreSQL)', 'pgvector'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel', 'GitHub Actions'],
    ai:        ['Anthropic Claude', 'OpenAI GPT-4o'],
  },
  marketplace: {
    frontend:  ['Next.js 14', 'Tailwind CSS', 'TypeScript'],
    backend:   ['Next.js API Routes', 'tRPC'],
    database:  ['Supabase (PostgreSQL)'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel', 'Cloudflare CDN'],
  },
  tool: {
    frontend:  ['Next.js 14', 'Tailwind CSS', 'TypeScript'],
    backend:   ['Next.js API Routes'],
    database:  ['Supabase (PostgreSQL)'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel'],
  },
  api: {
    frontend:  ['None (API-only)'],
    backend:   ['Node.js', 'Fastify', 'tRPC'],
    database:  ['Supabase (PostgreSQL)'],
    auth:      ['API Keys', 'JWT'],
    devops:    ['Vercel', 'Docker', 'GitHub Actions'],
  },
  other: {
    frontend:  ['Next.js 14', 'Tailwind CSS'],
    backend:   ['Next.js API Routes'],
    database:  ['Supabase (PostgreSQL)'],
    auth:      ['Supabase Auth'],
    devops:    ['Vercel'],
  },
}

// ─── Execution Plan Templates ─────────────────────────────────────────────────
function buildEpicsFromFeatures(features: GeneratedFeature[], projectType: string): GeneratedEpic[] {
  const isAI = projectType === 'ai_app'

  const systemEpic: GeneratedEpic = {
    title: 'Foundation & Infrastructure',
    description: 'Project scaffolding, database schema, authentication, and core infrastructure',
    order_index: 0,
    features: [
      {
        title: 'Project Scaffold & Repository Setup',
        description: 'Initialize monorepo, configure Next.js, Tailwind, TypeScript, and ESLint',
        priority: 'critical',
        order_index: 0,
        tasks: [
          { title: 'Initialize Next.js 14 project with TypeScript', description: 'npx create-next-app with App Router and TypeScript configuration', agent_role: 'backend_engineer', task_type: 'code', priority: 'critical', order_index: 0, estimated_cost_usd: 0.02 },
          { title: 'Configure Tailwind CSS and design system tokens', description: 'Set up Tailwind with custom color palette and typography', agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 1, estimated_cost_usd: 0.02 },
          { title: 'Set up Supabase project and connection', description: 'Create Supabase client, configure environment variables, test connection', agent_role: 'backend_engineer', task_type: 'code', priority: 'critical', order_index: 2, estimated_cost_usd: 0.02 },
        ],
      },
      {
        title: 'Database Schema & Migrations',
        description: 'Design and apply all required database tables with RLS policies',
        priority: 'critical',
        order_index: 1,
        tasks: [
          { title: 'Write core schema migrations (users, orgs, projects)', description: 'Create migration files for all primary entities', agent_role: 'backend_engineer', task_type: 'schema', priority: 'critical', order_index: 0, estimated_cost_usd: 0.05 },
          { title: 'Apply RLS policies for multi-tenant isolation', description: 'Implement workspace-scoped Row Level Security policies', agent_role: 'backend_engineer', task_type: 'schema', priority: 'critical', order_index: 1, estimated_cost_usd: 0.04 },
          { title: 'Generate TypeScript types from Supabase schema', description: 'Run supabase gen types and integrate into codebase', agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.01 },
        ],
      },
      {
        title: 'Authentication & User Management',
        description: 'Supabase Auth integration with login, signup, and session handling',
        priority: 'critical',
        order_index: 2,
        tasks: [
          { title: 'Implement login and signup pages', description: 'Email/password auth with error handling and validation', agent_role: 'frontend_engineer', task_type: 'code', priority: 'critical', order_index: 0, estimated_cost_usd: 0.03 },
          { title: 'Build auth middleware for protected routes', description: 'Next.js middleware to enforce authentication on app routes', agent_role: 'backend_engineer', task_type: 'code', priority: 'critical', order_index: 1, estimated_cost_usd: 0.02 },
          { title: 'Create user profile and organization setup flow', description: 'Auto-create org and workspace on first login', agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 2, estimated_cost_usd: 0.03 },
        ],
      },
    ],
  }

  const coreEpic: GeneratedEpic = {
    title: 'Core Product Features',
    description: 'Main application functionality derived from product requirements',
    order_index: 1,
    features: features.slice(0, 4).map((f, i) => ({
      title: f.title,
      description: f.description,
      priority: f.priority,
      order_index: i,
      tasks: generateTasksForFeature(f.title, f.description, projectType),
    })),
  }

  const uxEpic: GeneratedEpic = {
    title: 'UX & Frontend',
    description: 'User interface, navigation, and experience polish',
    order_index: 2,
    features: [
      {
        title: 'Navigation & Layout System',
        description: 'Sidebar navigation, responsive layout, page transitions',
        priority: 'high',
        order_index: 0,
        tasks: [
          { title: 'Build sidebar navigation component', description: 'Responsive sidebar with route highlighting and collapse support', agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 0, estimated_cost_usd: 0.03 },
          { title: 'Create reusable UI component library', description: 'Button, Input, Card, Badge, Modal, Toast components', agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.04 },
          { title: 'Implement dark/light mode toggle', description: 'System-preference detection and manual toggle with Tailwind', agent_role: 'frontend_engineer', task_type: 'code', priority: 'low', order_index: 2, estimated_cost_usd: 0.02 },
        ],
      },
      {
        title: 'Dashboard & Analytics Views',
        description: 'Overview metrics, activity feed, and progress tracking',
        priority: 'high',
        order_index: 1,
        tasks: [
          { title: 'Build main dashboard page', description: 'Project overview cards, recent activity, quick stats', agent_role: 'frontend_engineer', task_type: 'code', priority: 'high', order_index: 0, estimated_cost_usd: 0.04 },
          { title: 'Create metrics and KPI components', description: 'Reusable stat cards with trend indicators', agent_role: 'frontend_engineer', task_type: 'code', priority: 'medium', order_index: 1, estimated_cost_usd: 0.03 },
        ],
      },
    ],
  }

  const apiEpic: GeneratedEpic = {
    title: 'API & Backend Logic',
    description: 'API routes, business logic, and data access layer',
    order_index: 3,
    features: [
      {
        title: 'Core API Endpoints',
        description: 'RESTful API for all primary resources',
        priority: 'critical',
        order_index: 0,
        tasks: [
          { title: 'Implement project CRUD API routes', description: 'GET, POST, PATCH, DELETE for projects with validation', agent_role: 'backend_engineer', task_type: 'code', priority: 'critical', order_index: 0, estimated_cost_usd: 0.04 },
          { title: 'Build API error handling and response utilities', description: 'Standardised error codes, response format, logging', agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.02 },
          { title: 'Write API integration tests', description: 'Test all endpoints with valid and invalid payloads', agent_role: 'qa_security_auditor', task_type: 'test', priority: 'high', order_index: 2, estimated_cost_usd: 0.05 },
        ],
      },
      {
        title: 'API Documentation',
        description: 'Auto-generated OpenAPI spec and developer documentation',
        priority: 'medium',
        order_index: 1,
        tasks: [
          { title: 'Generate OpenAPI specification', description: 'Document all endpoints with request/response schemas', agent_role: 'documentation_engineer', task_type: 'document', priority: 'medium', order_index: 0, estimated_cost_usd: 0.04 },
        ],
      },
    ],
  }

  const qualityEpic: GeneratedEpic = {
    title: 'Quality & Launch',
    description: 'Testing, security review, performance, and production deployment',
    order_index: 4,
    features: [
      {
        title: 'Security Audit & Hardening',
        description: 'RLS validation, input sanitisation, dependency audit',
        priority: 'critical',
        order_index: 0,
        tasks: [
          { title: 'Audit RLS policies with multi-tenant test suite', description: 'Verify workspace isolation with cross-tenant attack scenarios', agent_role: 'qa_security_auditor', task_type: 'test', priority: 'critical', order_index: 0, estimated_cost_usd: 0.08 },
          { title: 'Run dependency security audit', description: 'npm audit, check for known CVEs, update vulnerable packages', agent_role: 'qa_security_auditor', task_type: 'review', priority: 'high', order_index: 1, estimated_cost_usd: 0.03 },
        ],
      },
      {
        title: 'Production Deployment',
        description: 'Vercel deployment, domain config, environment variables',
        priority: 'critical',
        order_index: 1,
        tasks: [
          { title: 'Configure Vercel project and environment', description: 'Connect GitHub, set env vars, configure domains', agent_role: 'release_manager', task_type: 'deploy', priority: 'critical', order_index: 0, estimated_cost_usd: 0.02 },
          { title: 'Run production smoke tests', description: 'Validate all critical paths in production environment', agent_role: 'qa_security_auditor', task_type: 'test', priority: 'critical', order_index: 1, estimated_cost_usd: 0.05 },
        ],
      },
    ],
  }

  const epics = [systemEpic, coreEpic, uxEpic, apiEpic, qualityEpic]

  // Add AI epic for AI projects
  if (isAI) {
    epics.splice(2, 0, {
      title: 'AI Integration Layer',
      description: 'LLM integration, prompt engineering, and AI feature implementation',
      order_index: 2,
      features: [
        {
          title: 'LLM Provider Integration',
          description: 'Connect Anthropic and OpenAI with unified adapter pattern',
          priority: 'critical',
          order_index: 0,
          tasks: [
            { title: 'Build unified AI provider adapter', description: 'Abstract OpenAI and Anthropic behind common interface', agent_role: 'backend_engineer', task_type: 'code', priority: 'critical', order_index: 0, estimated_cost_usd: 0.05 },
            { title: 'Implement streaming response handler', description: 'Server-sent events for streaming LLM responses to frontend', agent_role: 'backend_engineer', task_type: 'code', priority: 'high', order_index: 1, estimated_cost_usd: 0.04 },
            { title: 'Design and test core prompts', description: 'Engineer system and user prompts for primary AI features', agent_role: 'product_analyst', task_type: 'document', priority: 'critical', order_index: 2, estimated_cost_usd: 0.06 },
          ],
        },
      ],
    })
  }

  return epics.map((e, i) => ({ ...e, order_index: i }))
}

function generateTasksForFeature(
  featureTitle: string,
  _description: string,
  _projectType: string
): GeneratedTask[] {
  // Generic task templates for core features
  return [
    {
      title: `Design data model for ${featureTitle}`,
      description: `Define entities, relationships, and schema for ${featureTitle}`,
      agent_role: 'architect',
      task_type: 'schema',
      priority: 'high',
      order_index: 0,
      estimated_cost_usd: 0.04,
    },
    {
      title: `Build API endpoints for ${featureTitle}`,
      description: `Implement CRUD and business logic API routes for ${featureTitle}`,
      agent_role: 'backend_engineer',
      task_type: 'code',
      priority: 'high',
      order_index: 1,
      estimated_cost_usd: 0.06,
    },
    {
      title: `Build UI for ${featureTitle}`,
      description: `Create frontend components and pages for ${featureTitle}`,
      agent_role: 'frontend_engineer',
      task_type: 'code',
      priority: 'high',
      order_index: 2,
      estimated_cost_usd: 0.05,
    },
    {
      title: `Write tests for ${featureTitle}`,
      description: `Unit and integration tests covering happy path and edge cases`,
      agent_role: 'qa_security_auditor',
      task_type: 'test',
      priority: 'medium',
      order_index: 3,
      estimated_cost_usd: 0.04,
    },
  ]
}

// ─── Main Generator ───────────────────────────────────────────────────────────
export function generateBlueprint(
  answers: OnboardingAnswers,
  projectType: ProjectType = 'saas'
): GeneratedBlueprint {
  const keyFeaturesRaw = answers.key_features || ''
  const keyFeatures = keyFeaturesRaw
    .split(/[,\n;]/)
    .map((f) => f.trim())
    .filter((f) => f.length > 2)
    .slice(0, 6)

  const features: GeneratedFeature[] = keyFeatures.map((f, i) => ({
    title: f,
    description: `Enable ${answers.target_user} to ${f.toLowerCase()}`,
    priority: i === 0 ? 'critical' : i < 2 ? 'high' : 'medium',
  }))

  // Ensure at least 3 features
  const defaultFeatures: GeneratedFeature[] = [
    { title: 'User Onboarding', description: 'Guided setup flow for new users', priority: 'critical' },
    { title: 'Core Dashboard', description: 'Overview of key metrics and recent activity', priority: 'high' },
    { title: 'Settings & Profile', description: 'User and organisation settings management', priority: 'medium' },
  ]

  const allFeatures = features.length >= 2
    ? features
    : [...defaultFeatures, ...features]

  const goals = [
    `Enable ${answers.target_user} to ${answers.core_outcome}`,
    `Deliver a seamless experience for ${answers.what_building}`,
    `Launch a production-ready product within defined budget and timeline`,
  ]

  const personas = [answers.target_user || 'End User']

  const techStack = TECH_STACKS[projectType] || TECH_STACKS['saas']

  const riskFlags: RiskFlag[] = [
    { area: 'Scope', description: 'Feature scope may expand during build — keep MVP strict', severity: 'medium' },
    { area: 'Auth', description: 'Multi-tenant isolation must be validated before launch', severity: 'high' },
  ]

  if (projectType === 'ai_app') {
    riskFlags.push({
      area: 'AI Cost',
      description: 'LLM API costs may spike — implement token budgets and monitoring from day 1',
      severity: 'high',
    })
  }

  const summary = `${answers.what_building} is a ${projectType.replace('_', ' ')} platform designed for ${answers.target_user}. The core objective is to ${answers.core_outcome}. This blueprint defines the foundation, execution plan, and recommended tech stack for Phase 1 delivery.`

  return {
    summary,
    goals,
    non_goals: [
      'Native mobile app (web-first, mobile-responsive instead)',
      'Offline support (deferred to Phase 2)',
      'Custom billing infrastructure (Stripe Checkout used initially)',
    ],
    user_personas: personas,
    features: allFeatures,
    tech_stack: techStack,
    risk_flags: riskFlags,
  }
}

export function generateExecutionPlan(
  blueprint: GeneratedBlueprint,
  projectType: ProjectType = 'saas'
): GeneratedEpic[] {
  return buildEpicsFromFeatures(blueprint.features, projectType)
}

// ─── Cost Estimation ──────────────────────────────────────────────────────────
export function estimateBuildCost(epics: GeneratedEpic[]): number {
  let total = 0
  for (const epic of epics) {
    for (const feature of epic.features) {
      for (const task of feature.tasks) {
        total += task.estimated_cost_usd
      }
    }
  }
  return Math.round(total * 100) / 100
}
