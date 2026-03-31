import { cn, TASK_STATUS_COLORS, PRIORITY_COLORS, snakeToTitle } from '@/lib/utils'

type BadgeVariant = 'default' | 'status' | 'priority' | 'outline'

interface BadgeProps {
  label?: string
  children?: React.ReactNode
  status?: string
  priority?: string
  variant?: BadgeVariant
  dot?: boolean
  className?: string
}

export function Badge({
  label,
  children,
  status,
  priority,
  variant = 'default',
  dot = false,
  className,
}: BadgeProps) {
  const text = label || children || (status ? snakeToTitle(status) : '') || (priority ? snakeToTitle(priority) : '')

  let colorClasses = 'bg-slate-100 text-slate-600'
  let dotColor = 'bg-slate-400'

  if (status && TASK_STATUS_COLORS[status]) {
    const colors = TASK_STATUS_COLORS[status]
    colorClasses = `${colors.bg} ${colors.text}`
    dotColor = colors.dot
  } else if (priority && PRIORITY_COLORS[priority]) {
    const colors = PRIORITY_COLORS[priority]
    colorClasses = `${colors.bg} ${colors.text}`
  } else if (variant === 'outline') {
    colorClasses = 'border border-slate-300 text-slate-600 bg-transparent'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClasses,
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor)} />}
      {text}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge status={status} dot className={className} />
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const labels: Record<string, string> = {
    critical: '🔴 Critical',
    high:     '🟠 High',
    medium:   '🟡 Medium',
    low:      '⚪ Low',
  }
  return (
    <Badge priority={priority} className={className}>
      {labels[priority] || priority}
    </Badge>
  )
}

export default Badge
