'use client'

import { Bell, Search } from 'lucide-react'

interface TopBarProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur-sm">
      {/* Title area */}
      <div className="flex-1 min-w-0">
        {title && (
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-slate-900 truncate">{title}</h1>
            {subtitle && (
              <span className="text-xs text-slate-500 truncate hidden sm:block">{subtitle}</span>
            )}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {actions}
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
