'use client'

import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Toast } from '@/hooks/useToast'

const TOAST_STYLES: Record<string, { bg: string; border: string; icon: React.ElementType; iconColor: string }> = {
  success: { bg: 'bg-green-50',  border: 'border-green-200', icon: CheckCircle,   iconColor: 'text-green-500' },
  error:   { bg: 'bg-red-50',    border: 'border-red-200',   icon: XCircle,        iconColor: 'text-red-500' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200', icon: AlertTriangle,  iconColor: 'text-amber-500' },
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',  icon: Info,           iconColor: 'text-blue-500' },
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const style = TOAST_STYLES[toast.variant] || TOAST_STYLES.info
  const Icon  = style.icon

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
        'w-80 max-w-full backdrop-blur-sm',
        'animate-fade-in',
        style.bg,
        style.border
      )}
      role="alert"
    >
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', style.iconColor)} />
      <p className="flex-1 text-sm font-medium text-slate-800 leading-snug">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  )
}
