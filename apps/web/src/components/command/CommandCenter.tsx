'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import OverviewPanel from './OverviewPanel'
import ExecutionFeed from './ExecutionFeed'
import AgentRoster from './AgentRoster'
import ActiveWork from './ActiveWork'
import SystemView from './SystemView'
import SupervisorDashboard from './SupervisorDashboard'
import PreviewTab from './PreviewTab'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import {
  LayoutGrid, Radio, Users, Zap, Server, Eye,
} from 'lucide-react'

type Tab = 'overview' | 'feed' | 'agents' | 'active' | 'system' | 'preview'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview',   icon: LayoutGrid },
  { id: 'feed',     label: 'Live Feed',  icon: Radio      },
  { id: 'agents',   label: 'Agents',     icon: Users      },
  { id: 'active',   label: 'Active Work',icon: Zap        },
  { id: 'system',   label: 'System',     icon: Server     },
  { id: 'preview',  label: 'Preview',    icon: Eye        },
]

interface Props {
  projectId: string
  project: {
    id: string
    name: string
    status: string
    target_date?: string | null
    start_date?: string | null
    updated_at: string
  }
  initialStats: {
    totalTasks: number
    completedTasks: number
    blockedTasks: number
    inProgressTasks: number
    estimatedCost: number
    actualCost: number
  }
}

export default function CommandCenter({ projectId, project, initialStats }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-5 -mx-0 pb-0 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
                isActive
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewPanel
            projectId={projectId}
            project={project}
            initialStats={initialStats}
          />
        )}

        {activeTab === 'feed' && (
          <div className="h-full" style={{ minHeight: 500 }}>
            <Card padding="md" className="h-full flex flex-col" style={{ minHeight: 500 }}>
              <ExecutionFeed projectId={projectId} />
            </Card>
          </div>
        )}

        {activeTab === 'agents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Agent Roster</h2>
              <span className="text-xs text-slate-400">Click an agent for details →</span>
            </div>
            <AgentRoster projectId={projectId} />
          </div>
        )}

        {activeTab === 'active' && (
          <Card padding="none">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900">Active Work</h2>
              <span className="text-xs text-slate-400 ml-1">· auto-refreshes every 8s</span>
            </div>
            <div className="px-5">
              <ActiveWork projectId={projectId} />
            </div>
          </Card>
        )}

        {activeTab === 'system' && (
          <div className="space-y-10">
            <section>
              <div className="mb-5">
                <h2 className="text-base font-semibold text-slate-900">Supervisor Intelligence</h2>
                <p className="text-sm text-slate-500 mt-0.5">Real-time loop health, incidents, and auto-remediation.</p>
              </div>
              <SupervisorDashboard projectId={projectId} />
            </section>
            <section>
              <div className="mb-5">
                <h2 className="text-base font-semibold text-slate-900">System Architecture</h2>
                <p className="text-sm text-slate-500 mt-0.5">Database schema, integrations, APIs, and tech stack.</p>
              </div>
              <SystemView projectId={projectId} />
            </section>
          </div>
        )}

        {activeTab === 'preview' && (
          <PreviewTab projectId={projectId} />
        )}
      </div>
    </div>
  )
}
