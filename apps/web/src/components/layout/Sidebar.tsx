
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Wand2,
  ChevronDown,
  ChevronRight,
  Settings,
  LogOut,
  Bot,
  FolderKanban,
  FileText,
  GitBranch,
  ListTodo,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const TOP_NAV: NavItem[] = [
  { label: 'Projects', href: '/projects', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Wizard', href: '/wizard', icon: <Wand2 className="h-4 w-4" /> },
]

function getProjectNav(projectId: string): NavItem[] {
  const base = `/projects/${projectId}`
  return [
    { label: 'Overview', href: base, icon: <FolderKanban className="h-4 w-4" /> },
    { label: 'PRDs', href: `${base}/prds`, icon: <FileText className="h-4 w-4" /> },
    { label: 'Tasks', href: `${base}/tasks`, icon: <ListTodo className="h-4 w-4" /> },
    { label: 'Branches', href: `${base}/branches`, icon: <GitBranch className="h-4 w-4" /> },
    { label: 'Stack', href: `${base}/stack`, icon: <Layers className="h-4 w-4" /> },
  ]
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  // Extract projectId from path like /projects/[id]/...
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/)
  const projectId = projectMatch ? projectMatch[1] : null

  const [projectNavOpen, setProjectNavOpen] = useState(true)

  // ── Workspace Switcher state ──────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<Array<{id: string, name: string, slug: string}>>([])
  const [currentWs, setCurrentWs]   = useState<string>('Build OS')
  const [wsOpen, setWsOpen]          = useState(false)

  useEffect(() => {
    fetch('/api/workspaces')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data?.length) {
          setWorkspaces(d.data)
          setCurrentWs(d.data[0].name)
        }
      })
      .catch(() => {/* silently ignore — workspaces are optional */})
  }, [])

  const projectNav = projectId ? getProjectNav(projectId) : []

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.push('/login')
    } catch {
      router.push('/login')
    }
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-navy-950 border-r border-white/10">
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-sm">
          B
        </div>
        <span className="text-base font-semibold text-white tracking-tight">Build OS</span>
      </div>

      {/* ── Workspace Switcher ────────────────────────────────────────── */}
      <div className="relative px-3 py-2 border-b border-white/10">
        <button
          onClick={() => setWsOpen(v => !v)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-white text-xs font-bold shrink-0">
            {currentWs.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 truncate text-left">{currentWs}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', wsOpen && 'rotate-180')} />
        </button>
        {wsOpen && workspaces.length > 1 && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md border border-white/10 bg-navy-900 shadow-lg overflow-hidden">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => { setCurrentWs(ws.name); setWsOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded bg-brand-600 text-white text-xs font-bold shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Top Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {TOP_NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}

        {/* ── Project-scoped nav (collapsible) ────────────────────────── */}
        {projectId && projectNav.length > 0 && (
          <div className="pt-3 mt-3 border-t border-white/10">
            <button
              onClick={() => setProjectNavOpen(v => !v)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              {projectNavOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Project
            </button>
            {projectNavOpen && (
              <div className="mt-1 space-y-0.5">
                {projectNav.map(item => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Autopilot Mode ──────────────────────────────────────────── */}
        {projectId && (
          <div className="pt-3 mt-3 border-t border-white/10">
            <Link
              href={`/projects/${projectId}/autopilot`}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                pathname.includes('/autopilot')
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}
            >
              <Bot className="h-4 w-4" />
              Autopilot Mode
            </Link>
          </div>
        )}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="border-t border-white/10 px-3 py-3 space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
