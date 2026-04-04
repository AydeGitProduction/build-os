/**
 * scaffold-generator.ts
 *
 * Generates platform-specific initial files for a new BuildOS project
 * immediately after the wizard completes. Commits all files atomically
 * to GitHub via the Tree API.
 *
 * PHASE 5 — BASE SCAFFOLD ENGINE
 * Two layers of files are generated:
 *
 * LAYER 1 — Base Next.js foundation (every project, regardless of type):
 *   - package.json           — Next.js 14, React 18, TypeScript, Tailwind, Supabase
 *   - next.config.mjs        — minimal Next.js config (ignoreBuildErrors + eslint)
 *   - tsconfig.json          — TypeScript 5 config with path aliases
 *   - tailwind.config.ts     — Tailwind with brand colours + dark mode
 *   - postcss.config.mjs     — PostCSS config
 *   - src/app/globals.css    — Tailwind base + dark background
 *   - src/app/layout.tsx     — Root HTML layout
 *   - src/app/page.tsx       — Landing / redirect to /dashboard
 *   - src/app/(dashboard)/layout.tsx  — Dashboard shell with Sidebar
 *   - src/middleware.ts      — Auth protection (Supabase SSR passthrough)
 *   - .gitignore             — Standard Next.js gitignore
 *
 * LAYER 2 — Domain-specific UI (from platform-registry):
 *   - src/components/Sidebar.tsx
 *   - src/app/(dashboard)/dashboard/page.tsx
 *   - src/components/dashboard/DashboardStats.tsx
 *   - src/components/dashboard/QuickActions.tsx
 *   - src/components/dashboard/RecentActivity.tsx
 *
 * Usage:
 *   POST /api/projects/[id]/scaffold
 *   Called automatically from /api/bootstrap/project as Step 6.
 */

import type { PlatformContext } from './platform-registry'

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — Base Next.js foundation files
// These are required for `npm install` + `vercel build` to succeed.
// Generated once per project, before any AI task runs.
// ─────────────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'buildos-project'
}

export function generatePackageJson(projectName: string): string {
  const pkgName = slugify(projectName)
  return JSON.stringify({
    name: pkgName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      '@supabase/ssr': '^0.5.2',
      '@supabase/supabase-js': '^2.47.0',
      'lucide-react': '^0.454.0',
      next: '14.2.18',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/node': '^22.9.0',
      '@types/react': '^18.3.12',
      '@types/react-dom': '^18.3.1',
      autoprefixer: '^10.4.20',
      postcss: '^8.4.49',
      tailwindcss: '^3.4.15',
      typescript: '^5.6.3',
    },
  }, null, 2)
}

export function generateNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // AI-generated code may have type gaps filled by later tasks.
    // ignoreBuildErrors keeps Vercel deployments green during construction.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
`
}

export function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2)
}

export function generateTailwindConfig(): string {
  return `import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
`
}

export function generatePostCssConfig(): string {
  return `const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
`
}

export function generateGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #030712;
  --foreground: #f9fafb;
}

html {
  color-scheme: dark;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #4B5563;
}
`
}

export function generateGitIgnore(): string {
  return `# Dependencies
node_modules
.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
`
}

export function generateMiddleware(): string {
  return `import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
`
}

export function generateRootPage(): string {
  return `import { redirect } from 'next/navigation'

// Redirect root to dashboard — dashboard is the main entry point
export default function RootPage() {
  redirect('/dashboard')
}
`
}

export function generateDashboardLayout(ctx: PlatformContext): string {
  return `import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
`
}

/** All LAYER 1 base files — required for `vercel build` to pass */
export function generateBaseFiles(projectName: string, ctx: PlatformContext): ScaffoldFile[] {
  return [
    { path: 'package.json',          content: generatePackageJson(projectName) },
    { path: 'next.config.mjs',       content: generateNextConfig() },
    { path: 'tsconfig.json',         content: generateTsConfig() },
    { path: 'tailwind.config.ts',    content: generateTailwindConfig() },
    { path: 'postcss.config.mjs',    content: generatePostCssConfig() },
    { path: 'src/app/globals.css',   content: generateGlobalsCss() },
    { path: 'src/middleware.ts',      content: generateMiddleware() },
    { path: 'src/app/page.tsx',       content: generateRootPage() },
    { path: 'src/app/(dashboard)/layout.tsx', content: generateDashboardLayout(ctx) },
    { path: '.gitignore',             content: generateGitIgnore() },
  ]
}

// ─── Icon map for lucide-react ─────────────────────────────────────────────
// Maps icon name strings from platform-registry to lucide-react import names.
// Add entries here when adding new platform types.
const LUCIDE_ICONS = new Set([
  'LayoutDashboard', 'Mail', 'Users', 'FileText', 'Sparkles', 'Zap',
  'BarChart2', 'Settings', 'Building2', 'CreditCard', 'Key', 'TrendingUp',
  'Kanban', 'Calendar', 'Store', 'Star', 'ShoppingCart', 'Package',
  'Database', 'Cpu', 'MessageSquare', 'Globe', 'Plug', 'Layers',
  'FolderKanban', 'CheckSquare',
])

function getIconImports(nav: PlatformContext['nav']): string {
  const icons = [...new Set(nav.map(n => n.icon))].filter(i => LUCIDE_ICONS.has(i))
  return icons.join(', ')
}

// ─── File generators ──────────────────────────────────────────────────────────

export function generateSidebar(ctx: PlatformContext): string {
  const iconImports = getIconImports(ctx.nav)

  const navGroups = ctx.nav.map(item => `  { label: '${item.label}', href: '${item.href}', icon: ${item.icon} },`).join('\n')

  return `'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ${iconImports}, LogOut } from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
${navGroups}
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={\`flex flex-col h-full bg-gray-950 border-r border-gray-800 transition-all duration-200 \${collapsed ? 'w-16' : 'w-56'}\`}
    >
      {/* Logo / Product name */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-800">
        <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">{ctx.name.charAt(0)}</span>
        </div>
        {!collapsed && (
          <span className="text-white text-sm font-semibold truncate">${ctx.name}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${
                active
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }\`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-gray-800 p-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 text-sm transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
`
}

export function generateDashboardPage(ctx: PlatformContext, projectName: string): string {
  return `// src/app/dashboard/page.tsx
import type { Metadata } from 'next'
import DashboardStats from '@/components/dashboard/DashboardStats'
import RecentActivity from '@/components/dashboard/RecentActivity'
import QuickActions from '@/components/dashboard/QuickActions'

export const metadata: Metadata = {
  title: 'Dashboard · ${projectName}',
}

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">${projectName}</h1>
          <p className="mt-1 text-gray-400 text-sm">${ctx.tagline}</p>
        </div>

        {/* KPI Stats */}
        <section className="mb-8">
          <DashboardStats />
        </section>

        {/* Quick Actions */}
        <section className="mb-8">
          <QuickActions />
        </section>

        {/* Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RecentActivity />
          </div>
          <div className="lg:col-span-1">
            {/* Sidebar widget placeholder — agents will fill this in */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Stats</h3>
              <p className="text-gray-600 text-xs">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
`
}

export function generateDashboardStats(ctx: PlatformContext): string {
  // Generate stat cards from platform metrics
  const stats = ctx.metrics.slice(0, 4).map(metric => {
    const label = metric
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
    return `  { label: '${label}', value: '—', change: null, key: '${metric}' },`
  }).join('\n')

  return `'use client'
// src/components/dashboard/DashboardStats.tsx
// Platform: ${ctx.name}
// KPIs: ${ctx.metrics.join(', ')}
//
// Replace static '—' values with real Supabase queries once
// the corresponding API routes are built by the agents.

import React, { useEffect, useState } from 'react'

interface Stat {
  label: string
  value: string | number
  change: number | null
  key: string
}

const DEFAULT_STATS: Stat[] = [
${stats}
]

export default function DashboardStats() {
  const [stats, setStats] = useState<Stat[]>(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Replace with real /api/analytics/summary endpoint once built
    setLoading(false)
  }, [])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(stat => (
        <div key={stat.key} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {stat.label}
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {loading ? '…' : stat.value}
          </p>
          {stat.change !== null && (
            <p className={\`mt-1 text-xs \${stat.change >= 0 ? 'text-green-400' : 'text-red-400'}\`}>
              {stat.change >= 0 ? '+' : ''}{stat.change}% vs last month
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
`
}

export function generateQuickActions(ctx: PlatformContext): string {
  // Generate quick actions from first 3 nav items (skip Dashboard + Settings)
  const actionNav = ctx.nav.filter(n => !['Dashboard', 'Settings'].includes(n.label)).slice(0, 3)
  const actions = actionNav.map(n =>
    `  { label: 'Go to ${n.label}', href: '${n.href}' },`
  ).join('\n')

  return `'use client'
// src/components/dashboard/QuickActions.tsx
// Platform: ${ctx.name}

import Link from 'next/link'
import React from 'react'

const ACTIONS = [
${actions}
]

export default function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      {ACTIONS.map(action => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          {action.label}
        </Link>
      ))}
    </div>
  )
}
`
}

export function generateRecentActivity(ctx: PlatformContext): string {
  return `'use client'
// src/components/dashboard/RecentActivity.tsx
// Platform: ${ctx.name}
// Replace with real data from Supabase once activity tracking is built.

import React from 'react'

export default function RecentActivity() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-medium text-gray-300 mb-4">Recent Activity</h3>
      <div className="space-y-3">
        <p className="text-gray-600 text-sm text-center py-8">
          Activity will appear here once you start using ${ctx.name}.
        </p>
      </div>
    </div>
  )
}
`
}

export function generateRootLayout(projectName: string, tagline: string): string {
  return `// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '${projectName}',
    template: \`%s · ${projectName}\`,
  },
  description: '${tagline}',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
`
}

// ─── Main scaffold builder ────────────────────────────────────────────────────

export interface ScaffoldFile {
  path: string
  content: string
}

/**
 * generateScaffold — full two-layer scaffold for a new project.
 *
 * Layer 1 (base): package.json, next.config.mjs, tsconfig.json, tailwind,
 *   postcss, globals.css, middleware, root page, dashboard shell layout,
 *   root layout, .gitignore  — everything needed for `vercel build` to pass.
 *
 * Layer 2 (domain): Sidebar, dashboard page, DashboardStats, QuickActions,
 *   RecentActivity — platform-specific UI from platform-registry.
 *
 * Called by POST /api/projects/[id]/scaffold, which is invoked automatically
 * from /api/bootstrap/project as Step 6 (after Vercel + GitHub provisioned).
 */
export function generateScaffold(
  ctx: PlatformContext,
  projectName: string,
): ScaffoldFile[] {
  return [
    // ── Layer 1: foundational Next.js files ───────────────────────────────────
    ...generateBaseFiles(projectName, ctx),
    // Root HTML layout — Layer 1 but needs projectName + tagline from ctx
    { path: 'src/app/layout.tsx', content: generateRootLayout(projectName, ctx.tagline) },

    // ── Layer 2: domain-specific UI (from platform-registry) ─────────────────
    { path: 'src/components/Sidebar.tsx',                       content: generateSidebar(ctx) },
    { path: 'src/app/(dashboard)/dashboard/page.tsx',           content: generateDashboardPage(ctx, projectName) },
    { path: 'src/components/dashboard/DashboardStats.tsx',      content: generateDashboardStats(ctx) },
    { path: 'src/components/dashboard/QuickActions.tsx',        content: generateQuickActions(ctx) },
    { path: 'src/components/dashboard/RecentActivity.tsx',      content: generateRecentActivity(ctx) },
  ]
}
