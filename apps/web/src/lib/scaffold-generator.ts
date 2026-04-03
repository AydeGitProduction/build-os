/**
 * scaffold-generator.ts
 *
 * Generates platform-specific initial files for a new BuildOS project
 * immediately after the wizard completes. Commits all files atomically
 * to GitHub via the Tree API.
 *
 * What it creates per platform type:
 *   - src/components/Sidebar.tsx           — correct nav items for the domain
 *   - src/app/dashboard/page.tsx           — correct product title + metrics
 *   - src/components/dashboard/DashboardStats.tsx  — domain KPIs
 *   - src/app/layout.tsx (root)            — product name in metadata
 *   - src/middleware.ts                    — auth protection (unchanged)
 *
 * Usage:
 *   POST /api/projects/[id]/scaffold
 *   Called automatically from the onboarding completion step.
 */

import type { PlatformContext } from './platform-registry'

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

export function generateScaffold(
  ctx: PlatformContext,
  projectName: string,
): ScaffoldFile[] {
  return [
    {
      path: 'src/components/Sidebar.tsx',
      content: generateSidebar(ctx),
    },
    {
      path: 'src/app/dashboard/page.tsx',
      content: generateDashboardPage(ctx, projectName),
    },
    {
      path: 'src/components/dashboard/DashboardStats.tsx',
      content: generateDashboardStats(ctx),
    },
    {
      path: 'src/components/dashboard/QuickActions.tsx',
      content: generateQuickActions(ctx),
    },
    {
      path: 'src/components/dashboard/RecentActivity.tsx',
      content: generateRecentActivity(ctx),
    },
    {
      path: 'src/app/layout.tsx',
      content: generateRootLayout(projectName, ctx.tagline),
    },
  ]
}
