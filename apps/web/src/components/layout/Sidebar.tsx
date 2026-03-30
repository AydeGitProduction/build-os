'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, FolderKanban, Cpu, BookOpen, Plug, DollarSign,
  ChevronDown, ChevronRight, Settings, LogOut, Zap, Rocket, Activity,
  Terminal, Users, Server, Eye, Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
}

interface ProjectNavItem extends NavItem {
  projectId: string
}

const TOP_NAV: NavItem[] = [
  { label: 'Projects', href: '/projects', icon: FolderKanban, exact: true },
  { label: 'Wizard', href: '/wizard', icon: Wand2 },
]

function getProjectNav(projectId: string): ProjectNavItem[] {
  return [
    { label: 'Command Center', href: `/projects/${projectId}`,              icon: Terminal,    exact: true, projectId },
    { label: 'Tasks',          href: `/projects/${projectId}/tasks`,        icon: Cpu,                      projectId },
    { label: 'Agents',         href: `/projects/${projectId}/agents`,       icon: Users,                    projectId },
    { label: 'System',         href: `/projects/${projectId}/system`,       icon: Server,                   projectId },
    { label: 'Docs',           href: `/projects/${projectId}/docs`,         icon: BookOpen,                 projectId },
    { label: 'Integrations',   href: `/projects/${projectId}/integrations`, icon: Plug,                     projectId },
    { label: 'Cost',           href: `/projects/${projectId}/cost`,         icon: DollarSign,               projectId },
    { label: 'Orchestrate',    href: `/projects/${projectId}/orchestrate`,  icon: Activity,                 projectId },
    { label: 'Preview',        href: `/projects/${projectId}/preview`,      icon: Eye,                      projectId },
    { label: 'Release',        href: `/projects/${projectId}/release`,      icon: Rocket,                   projectId },
  ]
}

interface SidebarProps {
  projectId?: string
  projectName?: string
}

export default function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [projectOpen, setProjectOpen] = useState(true)

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col bg-navy-900"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-white/10">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">Build OS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* Top-level nav */}
        {TOP_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              isActive(item.href, item.exact)
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}

        {/* Project-scoped nav */}
        {projectId && (
          <div className="mt-4">
            {/* Collapsible section header */}
            <button
              onClick={() => setProjectOpen(v => !v)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors"
            >
              {projectOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span className="truncate">{projectName || 'Current Project'}</span>
            </button>

            {projectOpen && (
              <div className="mt-0.5 space-y-0.5">
                {getProjectNav(projectId).map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive(item.href, item.exact)
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
