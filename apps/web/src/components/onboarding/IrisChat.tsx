'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Sparkles, CheckCircle2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isTyping?: boolean
}

interface Props {
  projectId: string
  projectName: string
}

export default function IrisChat({ projectId, projectName }: Props) {
  const router = useRouter()

  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [complete, setComplete]   = useState(false)
  const [history, setHistory]     = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [error, setError]         = useState<string | null>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)
  // Synchronous guard — prevents duplicate sends before React re-renders loading state
  const sendingRef                = useRef(false)
  const bootedRef                 = useRef(false)

  // Boot — send empty message to get Iris's opening question (run once only)
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    sendMessage('Hello', true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string, isInit = false) {
    const userMessage = text.trim()
    // Check both React state AND the ref — ref is synchronous so catches rapid double-fires
    if (!userMessage || loading || sendingRef.current) return
    sendingRef.current = true

    if (!isInit) {
      setInput('')
      setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    }

    setLoading(true)
    setError(null)

    // Typing indicator
    setMessages(prev => [...prev, { role: 'assistant', content: '', isTyping: true }])

    try {
      const res = await fetch(`/api/projects/${projectId}/iris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: isInit ? [] : history,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setMessages(prev => prev.filter(m => !m.isTyping))
        setError(json.error || 'Something went wrong. Please try again.')
        return
      }

      const { reply, complete: isDone, history: newHistory } = json

      // Replace typing indicator with real reply
      setMessages(prev => [
        ...prev.filter(m => !m.isTyping),
        { role: 'assistant', content: reply },
      ])

      if (newHistory) setHistory(newHistory)

      if (isDone) {
        setComplete(true)
        // Seed blueprint then redirect.
        // Retries once on 503/500 (transient Vercel errors) before showing error.
        // 409 = already seeded (idempotent) → treat as success and redirect.
        setTimeout(async () => {
          const attemptSeed = async (): Promise<{ ok: boolean; status: number; error?: string }> => {
            try {
              const res = await fetch(`/api/projects/${projectId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'blueprint' }),
              })
              if (res.ok || res.status === 409) return { ok: true, status: res.status }
              const errJson = await res.json().catch(() => ({}))
              return { ok: false, status: res.status, error: errJson.error }
            } catch {
              return { ok: false, status: 0, error: 'Network error' }
            }
          }

          let result = await attemptSeed()

          // Retry once on transient server errors (503, 502, 500)
          if (!result.ok && [500, 502, 503, 504].includes(result.status)) {
            await new Promise(r => setTimeout(r, 3000)) // wait 3s before retry
            result = await attemptSeed()
          }

          if (!result.ok) {
            setComplete(false)
            setError(
              result.error ||
              `Blueprint generation failed (${result.status}). Please try again.`
            )
            return
          }

          router.push(`/projects/${projectId}`)
          router.refresh()
        }, 2500)
      }
    } catch {
      setMessages(prev => prev.filter(m => !m.isTyping))
      setError('Network error. Please check your connection and try again.')
    } finally {
      sendingRef.current = false
      setLoading(false)
      if (!complete) {
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  if (complete) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Blueprint generating…</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Iris has gathered all the context. Build OS is now architecting your project
          and creating the full execution plan.
        </p>
        <div className="mt-4 h-1.5 w-48 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col h-[calc(100vh-9rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white rounded-t-2xl">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm">
          <Sparkles className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Iris</p>
          <p className="text-xs text-slate-400">AI Architect · {projectName}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs text-slate-400">Active</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mr-2 mt-0.5 shrink-0 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-white rounded-br-sm'
                  : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
              }`}
            >
              {msg.isTyping ? (
                <div className="flex items-center gap-1 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white rounded-b-2xl">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell Iris about your product…"
            rows={1}
            disabled={loading || complete}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 transition-all disabled:opacity-50 leading-relaxed"
            style={{ minHeight: 44, maxHeight: 120 }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim() || complete}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
