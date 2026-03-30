'use client'

import { useState, useCallback } from 'react'
import { IrisStatusBar } from './IrisStatusBar'
import { IrisChat } from './IrisChat'
import { IrisPreviewPanel } from './IrisPreviewPanel'
import { IrisMobileTabs } from './IrisMobileTabs'

export interface IrisMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface IrisAssumption {
  id: string
  label: string
  value: string
  status: 'pending' | 'accepted' | 'rejected' | 'modified'
}

export interface IrisPreviewData {
  title: string
  description: string
  phases: Array<{ label: string; duration: string }>
  assumptions: IrisAssumption[]
}

interface IrisWorkspaceProps {
  userId: string
}

export function IrisWorkspace({ userId: _userId }: IrisWorkspaceProps) {
  const [messages, setMessages] = useState<IrisMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content:
        "Hi! I'm IRIS, your AI project architect. Tell me what you want to build and I'll design the perfect execution plan for you.",
      timestamp: new Date(),
    },
  ])
  const [readiness, setReadiness] = useState(0)
  const [previewData, setPreviewData] = useState<IrisPreviewData | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'preview' | 'plan'>('chat')

  const handleSendMessage = useCallback(
    async (content: string) => {
      const userMsg: IrisMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsTyping(true)

      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800))

      const newReadiness = Math.min(100, readiness + 15 + Math.floor(Math.random() * 20))
      setReadiness(newReadiness)

      const assistantMsg: IrisMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateIrisResponse(content, newReadiness),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsTyping(false)

      setPreviewData({
        title: extractProjectTitle(content) || 'Your Project',
        description: `AI-generated blueprint based on your requirements. IRIS understands ${newReadiness}% of your vision.`,
        phases: [
          { label: 'Discovery & Planning', duration: '1 week' },
          { label: 'Core Development',     duration: '3 weeks' },
          { label: 'Integration & Testing', duration: '2 weeks' },
          { label: 'Launch Preparation',   duration: '1 week' },
        ],
        assumptions: [
          { id: 'a1', label: 'Tech Stack',   value: 'Next.js + TypeScript + Supabase', status: 'pending' },
          { id: 'a2', label: 'Team Size',    value: '2–4 developers',                  status: 'pending' },
          { id: 'a3', label: 'Timeline',     value: '7 weeks total',                   status: 'pending' },
          { id: 'a4', label: 'Budget Range', value: '$15,000–$25,000',                 status: 'pending' },
        ],
      })
    },
    [readiness]
  )

  return (
    <div className="iris-workspace">
      {/* Status Bar — TOP */}
      <IrisStatusBar readiness={readiness} messageCount={messages.length - 1} />

      {/* Desktop: Split Layout */}
      <div className="iris-split">
        {/* LEFT: Chat — 40% */}
        <div className="iris-chat-pane">
          <IrisChat
            messages={messages}
            isTyping={isTyping}
            onSend={handleSendMessage}
            readiness={readiness}
          />
        </div>

        {/* RIGHT: Preview — 60% */}
        <div className="iris-preview-pane">
          <IrisPreviewPanel
            data={previewData}
            readiness={readiness}
            isBuilding={isTyping}
          />
        </div>
      </div>

      {/* Mobile: Tab Layout */}
      <IrisMobileTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        messages={messages}
        isTyping={isTyping}
        onSend={handleSendMessage}
        readiness={readiness}
        previewData={previewData}
        isBuilding={isTyping}
      />
    </div>
  )
}

function generateIrisResponse(userInput: string, readiness: number): string {
  if (readiness < 30) {
    return `Got it. I'm starting to map out your project. Can you tell me more about your target users and the core problem you're solving?`
  }
  if (readiness < 60) {
    return `I've captured that. I'm now at ${readiness}% confidence in your vision. I've made some assumptions about your tech stack — you can review and modify them in the preview panel.`
  }
  if (readiness < 80) {
    return `Excellent detail. IRIS understands ${readiness}% of your project now. The blueprint is taking shape — check the preview for your current execution plan.`
  }
  return `Your blueprint is nearly complete at ${readiness}% readiness. I have everything I need to generate your full execution plan. Ready to confirm?`
}

function extractProjectTitle(input: string): string {
  const words = input.split(' ').slice(0, 4).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
