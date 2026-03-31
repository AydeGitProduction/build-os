// apps/web/src/components/iris/IrisChatMessage.tsx
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/iris'

interface IrisChatMessageProps {
  message: ChatMessage
}

export function IrisChatMessage({ message }: IrisChatMessageProps) {
  const isUser = message.role === 'user'
  const isError = message.isError

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1">
          I
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-600 text-white rounded-br-sm'
            : isError
            ? 'bg-red-950 border border-red-800 text-red-200 rounded-bl-sm'
            : 'bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-bl-sm'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={cn(
            'text-xs mt-1',
            isUser ? 'text-brand-200' : 'text-zinc-500'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-white text-xs font-bold ml-2 mt-1">
          U
        </div>
      )}
    </div>
  )
}
