import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400',
  ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400',
  danger:    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
  outline:   'border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-base gap-2.5 rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  )
}

export default Button
