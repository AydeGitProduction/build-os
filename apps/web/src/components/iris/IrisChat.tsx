'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import type { IrisMessage } from './IrisWorkspace'

interface IrisChatProps {
  messages: IrisMessage[]
  isTyping: boolean
  onSend: (content: string) => void
  readiness: number
  compact?: boolean
}

const SUGGESTION_CHIPS = [
  'Build a SaaS product',
  'Create a mobile app',
  'Launch an e-commerce store',
  'Automate a workflow',
]

export function IrisChat({ messages, isTyping, onSend, compact = false }: IrisChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const showChips = messages.length === 1

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="iris-chat">
      {/* Messages */}
      <div className="iris-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`iris-msg iris-msg--${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="iris-avatar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="#6366f1" strokeWidth="1.5" />
                  <circle cx="8" cy="8" r="3" fill="#6366f1" />
                </svg>
              </div>
            )}
            <div className="iris-bubble">
              <p className="iris-bubble-text">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Suggestion chips */}
        {showChips && (
          <div className="iris-chips">
            {SUGGESTION_CHIPS.map((chip) => (
              <button key={chip} className="iris-chip" onClick={() => onSend(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="iris-msg iris-msg--assistant">
            <div className="iris-avatar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#6366f1" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="3" fill="#6366f1" />
              </svg>
            </div>
            <div className="iris-bubble iris-bubble--typing">
              <div className="iris-typing-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="iris-input-area">
        <textarea
          ref={inputRef}
          className="iris-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to build…"
          rows={2}
        />
        <button
          className="iris-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l3 6-3 6 12-6z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}
