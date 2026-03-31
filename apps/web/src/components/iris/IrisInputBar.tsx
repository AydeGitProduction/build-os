// apps/web/src/components/iris/IrisInputBar.tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface IrisInputBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e?: React.FormEvent) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  isLoading: boolean
  placeholder?: string
}

export function IrisInputBar({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  isLoading,
  placeholder = 'Type a message…',
}: IrisInputBarProps) {
  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        rows={2}
        className={cn(
          'flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900',
          'px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors'
        )}
      />
      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        className={cn(
          'flex-shrink-0 h-10 px-5 rounded-xl text-sm font-medium',
          'bg-brand-600 text-white',
          'hover:bg-brand-700 transition-colors',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-brand-500'
        )}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Sending
          </span>
        ) : (
          'Send'
        )}
      </button>
    </form>
  )
}
