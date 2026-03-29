'use client'

import Link from 'next/link'
import { formatRelative, formatDate } from '@/lib/utils'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ProgressBar from '@/components/ui/ProgressBar'
import { CalendarDays, Layers, CheckSquare, ArrowRight } from 'lucide-react'

interface ProjectCardProps {
  project: {
    id: string
    name: string
    description?: string | null
    status: string
    project_type?: string | null
    target_date?: string | null
    updated_at: string
    epic_count?: number
    task_count?: number
    completed_task_count?: number
    progress_pct?: number
    workspace?: { name: string; slug: string } | null
  }
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  saas:        'SaaS',
  crm:         'CRM',
  ai_app:      'AI App',
  marketplace: 'Marketplace',
  tool:        'Tool',
  api:         'API',
  other:       'Other',
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const progress    = project.progress_pct || 0
  const taskCount   = project.task_count || 0
  const epicCount   = project.epic_count || 0

  return (
    <Link href={`/projects/${project.id}`} className="block group">
      <Card
        className="transition-all duration-200 group-hover:shadow-md group-hover:border-brand-200 group-hover:-translate-y-0.5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
              {project.name}
            </h3>
            {project.workspace && (
              <p className="text-xs text-slate-400 mt-0.5">{project.workspace.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {project.project_type && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {PROJECT_TYPE_LABELS[project.project_type] || project.project_type}
              </span>
            )}
            <Badge status={project.status} dot />
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-slate-500 line-clamp-2 mb-4">{project.description}</p>
        )}

        {/* Progress */}
        {taskCount > 0 && (
          <div className="mb-4">
            <ProgressBar value={progress} size="sm" showLabel label={`${project.completed_task_count || 0} / ${taskCount} tasks`} />
          </div>
        )}

        {/* Footer meta */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            {epicCount > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {epicCount} epic{epicCount !== 1 ? 's' : ''}
              </span>
            )}
            {taskCount > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {taskCount} task{taskCount !== 1 ? 's' : ''}
              </span>
            )}
            {project.target_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDate(project.target_date)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-slate-400 group-hover:text-brand-500 transition-colors">
            <span>Updated {formatRelative(project.updated_at)}</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Card>
    </Link>
  )
}
