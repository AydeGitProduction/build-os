'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AppError]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-24 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 mb-5">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-base font-semibold text-slate-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-slate-500 max-w-xs mb-6">
        An unexpected error occurred. Please try again or contact support.
        {error.digest && (
          <span className="block mt-1 text-xs text-slate-400">
            Error ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2
                   text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  )
}
