'use client'

import Link from 'next/link'
import Card, { CardHeader, CardTitle } from '@/components/ui/Card'
import Badge, { StatusBadge } from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import { formatDate, formatRelative, formatUSD, percentage, snakeToTitle } from '@/lib/utils'
import {
  Layers, CheckSquare, AlertTriangle, DollarSign,
  Clock, Zap, ArrowRight, TrendingUp,
} from 'lucide-react'

interface Epic {
  id: string
  title: string
  status: string
  priority: string
  features: {
    id: string
    title: string
    status: string
    tasks: { id: string; status: string; estimated_cost_usd?: number | null }[]
  }[]
}

interface DashboardData {
  project: {
    id: string
    name: string
    status: string
    project_type?: string | null
    target_date?: string | null
    start_date?: string | null
    updated_at: string
  }
  epics: Epic[]
  totalTasks: number
  completedTasks: number
  blockedTasks: number
  inProgressTasks: number
  estimatedCost: number
  riskFlags?: string[]
}

export default function ProjectDashboard({ data }: { data: DashboardData }) {
  const { project, epics, totalTasks, completedTasks, blockedTasks, inProgressTasks, estimatedCost } = data
  const progress = percentage(completedTasks, totalTasks)

  const statCards = [
    {
      label: 'Total tasks',
      value: totalTasks,
      icon: CheckSquare,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'In progress',
      value: inProgressTasks,
      icon: Zap,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Blocked',
      value: blockedTasks,
      icon: AlertTriangle,
      color: blockedTasks > 0 ? 'text-red-600' : 'text-slate-400',
      bg: blockedTasks > 0 ? 'bg-red-50' : 'bg-slate-50',
    },
    {
      label: 'Est. cost',
      value: formatUSD(estimatedCost),
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header + progress */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
              <StatusBadge status={project.status} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {project.project_type && (
                <span className="capitalize">{snakeToTitle(project.project_type)}</span>
              )}
              {project.start_date && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Started {formatDate(project.start_date)}
                </span>
              )}
              {project.target_date && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Target: {formatDate(project.target_date)}
                </span>
              )}
              <span className="text-slate-400">Updated {formatRelative(project.updated_at)}</span>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <Link href={`/projects/${project.id}/tasks`}>
              <Button variant="outline" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                View tasks
              </Button>
            </Link>
          </div>
        </div>

        <ProgressBar
          value={progress}
          size="md"
          showLabel
          label={`${completedTasks} / ${totalTasks} tasks completed`}
        />
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label} padding="md">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className="text-lg font-semibold text-slate-900">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Epic breakdown */}
      {epics.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" />
                Execution Plan
              </h3>
              <span className="text-xs text-slate-500">{epics.length} epics</span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {epics.map(epic => {
              const epicTasks = epic.features.flatMap(f => f.tasks)
              const epicCompleted = epicTasks.filter(t => t.status === 'completed').length
              const epicProgress = percentage(epicCompleted, epicTasks.length)
              const epicCost = epicTasks.reduce((sum, t) => sum + (t.estimated_cost_usd || 0), 0)

              return (
                <div key={epic.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusBadge status={epic.status} />
                      <span className="text-sm font-medium text-slate-800 truncate">{epic.title}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                      <span>{epicTasks.length} tasks</span>
                      {epicCost > 0 && <span>{formatUSD(epicCost, 0)}</span>}
                    </div>
                  </div>

                  {epicTasks.length > 0 && (
                    <ProgressBar value={epicProgress} size="sm" color="brand" />
                  )}

                  {/* Feature list */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {epic.features.map(f => (
                      <div
                        key={f.id}
                        className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 rounded-md px-2 py-1"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            f.status === 'completed' ? 'bg-green-500' :
                            f.status === 'in_progress' ? 'bg-amber-400' : 'bg-slate-300'
                          }`}
                        />
                        <span className="truncate">{f.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Risk flags placeholder */}
      {(data.riskFlags || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Risk flags
            </CardTitle>
            <Badge variant="outline">{data.riskFlags!.length}</Badge>
          </CardHeader>
          <ul className="space-y-2">
            {data.riskFlags!.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-medium">
                  {i + 1}
                </span>
                {flag}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
