'use client'
/**
 * AppShell — client wrapper that conditionally renders the Sidebar.
 * On /projects/[id]/autopilot routes: full-screen, no sidebar, no margin.
 * On all other routes: standard layout with Sidebar + flex layout.
 *
 * FIX (layout-shift): Removed `marginLeft: var(--sidebar-width)` from <main>.
 * The flex container already positions <main> to the right of <Sidebar>.
 * Adding marginLeft on top of flex positioning caused a 240px content shift.
 */

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

interface AppShellProps {
  children: React.ReactNode
  projectName?: string
}

// Extract projectId from pathname like /projects/[id] or /projects/[id]/anything
function extractProjectId(pathname: string): string | undefined {
  const match = pathname.match(/^\/projects\/([^/]+)/)
  return match?.[1]
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const projectId = extractProjectId(pathname)

  // Autopilot mode — full screen, no sidebar
  const isAutopilot = pathname.includes('/autopilot')
  if (isAutopilot) {
    return (
      <div className="fixed inset-0 z-40 bg-slate-950">
        {children}
      </div>
    )
  }

  // Standard layout — flex handles the sidebar + content positioning naturally
  return (
    <div className="flex h-full">
      <Sidebar projectId={projectId} />
      <main className="flex-1 flex flex-col min-h-full overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
