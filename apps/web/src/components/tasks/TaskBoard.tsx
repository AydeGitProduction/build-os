'use client'

import { useState } from 'react'
import Badge, { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatUSD, snakeToTitle, TASK_STATUS_COLORS } from '@/lib/utils'
import { Clock, DollarSign, User, ChevronDown, ChevronRight, Zap, Play, CheckCircle } from 'lucide-react'

const BOARD_COLUMNS = [
  { key: 'pending',         label: 'Pending'    },
  { key: 'ready',           label: 'Ready'      },
  { key: 'in_progress',     label: 'In progress' },
  { key: 'awaiting_review', label: 'Review'     },
  { key: 'in_qa',           label: 'QA'         },
  { key: 'completed',       label: 'Done'       },
  { key: 'blocked',         label: 'Blocked'    },
]

interface Task {
  id: string
  title: string
  slug: string
  description?: string | null
  status: string
  priority: string
  agent_role: string
  task_type?: string | null
  estimated_hours?: number | null
  estimated_cost_usd?: number | null
  actual_cost_usd?: number | null
  feature?: {
    id: string
    title: string
    slug: string
    epic?: { id: string; title: string; slug: string } | null
  } | null
}

interface TaskBoardProps {
  tasks: Task[]
  projectId: string
  onDispatch?: (taskId: string) => void
  onMockRun?: (taskId: string) => void
  onMarkReady?: (taskId: string) => void
  dispatching?: Record<string, boolean>
}

function TaskCard({
  task,
  onDispatch,
  onMockRun,
  onMarkReady,
  isDispatching,
}: {
  task: Task
  onDispatch?: (id: string) => void
  onMockRun?: (id: string) => void
  onMarkReady?: (id: string) => void
  isDispatching?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group">
      {/* Epic > Feature breadcrumb */}
      {task.feature && (
        <p className="text-[10px] text-slate-400 mb-1.5 truncate">
          {task.feature.epic?.title} › {task.feature.title}
        </p>
      )}

      <p className="text-sm font-medium text-slate-800 leading-snug mb-2">{task.title}</p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <PriorityBadge priority={task.priority} />
        {task.agent_role && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            <User className="h-2.5 w-2.5" />
            {snakeToTitle(task.agent_role)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
        {task.estimated_hours && (
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {task.estimated_hours}h
          </span>
        )}
        {task.estimated_cost_usd && (
          <span className="flex items-center gap-0.5">
            <DollarSign className="h-2.5 w-2.5" />
            {formatUSD(task.estimated_cost_usd, 0)}
          </span>
        )}
        {task.actual_cost_usd && (
          <span className="flex items-center gap-0.5 text-green-600">
            <DollarSign className="h-2.5 w-2.5" />
            {formatUSD(task.actual_cost_usd, 4)} actual
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.status === 'pending' && onMarkReady && (
          <button
            onClick={() => onMarkReady(task.id)}
            className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium flex items-center gap-1"
          >
            <CheckCircle className="h-2.5 w-2.5" /> Mark ready
          </button>
        )}
        {task.status === 'ready' && onDispatch && (
          <button
            onClick={() => onDispatch(task.id)}
            disabled={isDispatching}
            className="text-[10px] px-2 py-1 rounded bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <Zap className="h-2.5 w-2.5" /> {isDispatching ? 'Dispatching…' : 'Dispatch'}
          </button>
        )}
        {onMockRun && ['pending', 'ready', 'in_progress'].includes(task.status) && (
          <button
            onClick={() => onMockRun(task.id)}
            disabled={isDispatching}
            className="text-[10px] px-2 py-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <Play className="h-2.5 w-2.5" /> Mock run
          </button>
        )}
      </div>
    </div>
  )
}

function BoardColumn({
  column, tasks, onDispatch, onMockRun, onMarkReady, dispatching,
}: {
  column: typeof BOARD_COLUMNS[0]
  tasks: Task[]
  onDispatch?: (id: string) => void
  onMockRun?: (id: string) => void
  onMarkReady?: (id: string) => void
  dispatching?: Record<string, boolean>
}) {
  const colors = TASK_STATUS_COLORS[column.key]
  const count = tasks.length

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px]">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {colors && <span className={`h-2 w-2 rounded-full ${colors.dot}`} />}
          <span className="text-xs font-semibold text-slate-700">{column.label}</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Task cards */}
      <div className="flex flex-col gap-2 flex-1">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
            No tasks
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onDispatch={onDispatch}
              onMockRun={onMockRun}
              onMarkReady={onMarkReady}
              isDispatching={dispatching?.[task.id]}
            />
          ))
        )}
      </div>
    </div>
  )
}

type ViewMode = 'board' | 'list'

function ListView({ tasks }: { tasks: Task[] }) {
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({})

  // Group by epic
  const grouped: Record<string, { epicName: string; tasks: Task[] }> = {}
  for (const task of tasks) {
    const epicKey = task.feature?.epic?.id || 'ungrouped'
    const epicName = task.feature?.epic?.title || 'No epic'
    if (!grouped[epicKey]) grouped[epicKey] = { epicName, tasks: [] }
    grouped[epicKey].tasks.push(task)
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([epicId, group]) => {
        const isOpen = expandedEpics[epicId] !== false // default open
        return (
          <Card key={epicId} padding="none">
            <button
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors rounded-xl"
              onClick={() => setExpandedEpics(prev => ({ ...prev, [epicId]: !isOpen }))}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                <span className="text-sm font-semibold text-slate-800">{group.epicName}</span>
                <span className="text-xs text-slate-400">({group.tasks.length} tasks)</span>
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {group.tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <StatusBadge status={task.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                      {task.feature && (
                        <p className="text-xs text-slate-400">{task.feature.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityBadge priority={task.priority} />
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full hidden sm:inline">
                        {snakeToTitle(task.agent_role)}
                      </span>
                      {task.estimated_cost_usd && (
                        <span className="text-xs text-slate-500 hidden md:inline">
                          {formatUSD(task.estimated_cost_usd, 0)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

export default function TaskBoard({
  tasks, projectId, onDispatch, onMockRun, onMarkReady, dispatching,
}: TaskBoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterRole, setFilterRole] = useState<string>('all')

  // Get unique roles
  const allRoles = Array.from(new Set(tasks.map(t => t.agent_role))).sort()

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterRole !== 'all' && t.agent_role !== filterRole) return false
    return true
  })

  // Group by status for board
  const byStatus: Record<string, Task[]> = {}
  for (const col of BOARD_COLUMNS) {
    byStatus[col.key] = filteredTasks.filter(t => t.status === col.key)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['board', 'list'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-slate-100 text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All statuses</option>
          {BOARD_COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>

        {/* Role filter */}
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All agents</option>
          {allRoles.map(role => (
            <option key={role} value={role}>{snakeToTitle(role)}</option>
          ))}
        </select>

        <span className="ml-auto text-xs text-slate-400">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Board view */}
      {viewMode === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map(col => (
            <BoardColumn
              key={col.key}
              column={col}
              tasks={byStatus[col.key] || []}
              onDispatch={onDispatch}
              onMockRun={onMockRun}
              onMarkReady={onMarkReady}
              dispatching={dispatching}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && <ListView tasks={filteredTasks} />}
    </div>
  )
}
