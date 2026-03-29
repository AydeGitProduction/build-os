import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
  fullPage?: boolean
}

const sizeStyles = {
  sm:  'h-4 w-4',
  md:  'h-6 w-6',
  lg:  'h-10 w-10',
}

export default function Spinner({ size = 'md', className, label, fullPage }: SpinnerProps) {
  const spinner = (
    <div className={cn('flex flex-col items-center justify-center gap-3', fullPage && 'h-64')}>
      <Loader2 className={cn('animate-spin text-brand-500', sizeStyles[size], className)} />
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  )

  if (fullPage) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        {spinner}
      </div>
    )
  }

  return spinner
}

export function LoadingPage({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}
