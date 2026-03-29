import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number          // 0–100
  size?: 'sm' | 'md' | 'lg'
  color?: 'brand' | 'green' | 'amber' | 'red' | 'slate'
  showLabel?: boolean
  label?: string
  animated?: boolean
  className?: string
}

const sizeStyles = {
  sm:  'h-1',
  md:  'h-2',
  lg:  'h-3',
}

const colorStyles = {
  brand: 'bg-brand-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
  slate: 'bg-slate-400',
}

function getColor(value: number): 'green' | 'amber' | 'red' | 'brand' {
  if (value >= 80) return 'green'
  if (value >= 40) return 'brand'
  if (value >= 20) return 'amber'
  return 'red'
}

export default function ProgressBar({
  value,
  size = 'md',
  color,
  showLabel = false,
  label,
  animated = true,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  const resolvedColor = color || getColor(pct)

  return (
    <div className={cn('w-full', className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500">{label || 'Progress'}</span>
          <span className="text-xs font-medium text-slate-700">{pct}%</span>
        </div>
      )}
      <div className={cn('w-full overflow-hidden rounded-full bg-slate-100', sizeStyles[size])}>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn(
            'h-full rounded-full transition-all duration-500',
            colorStyles[resolvedColor],
            animated && 'progress-bar'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
