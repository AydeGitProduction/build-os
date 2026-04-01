// src/hooks/useIrisChatContext.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Phase, IrisSystemContext } from '@/types/phase';
import {
  buildIrisSystemContext,
  buildIrisSystemPrompt,
} from '@/utils/irisContextBuilder';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  phaseId?: string; // Track which phase the message was sent in
}

export interface UseIrisChatContextReturn {
  messages: ChatMessage[];
  systemContext: IrisSystemContext;
  systemPrompt: string;
  isContextLoaded: boolean;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  isStreaming: boolean;
}

const generateId = () =>
  `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function useIrisChatContext(
  selectedPhase: Phase | null
): UseIrisChatContextReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isContextLoaded, setIsContextLoaded] = useState(false);
  const prevPhaseIdRef = useRef<string | null>(null);

  // Rebuild context whenever selectedPhase changes
  const systemContext = buildIrisSystemContext(selectedPhase);
  const systemPrompt = buildIrisSystemPrompt(selectedPhase);

  // Inject a context-change notice into chat when phase changes
  useEffect(() => {
    const currentPhaseId = selectedPhase?.id ?? null;

    if (prevPhaseIdRef.current === currentPhaseId) return;

    // Don't inject on first mount if no phase selected
    if (prevPhaseIdRef.current === null && currentPhaseId === null) {
      setIsContextLoaded(true);
      return;
    }

    prevPhaseIdRef.current = currentPhaseId;

    const contextMessage: ChatMessage = {
      id: generateId(),
      role: 'system',
      content: selectedPhase
        ? `Context updated: Now focusing on phase "${selectedPhase.title}". I have full awareness of this phase's tasks and progress.`
        : 'Context cleared: No phase selected. Ask me anything about your project.',
      timestamp: new Date(),
      phaseId: currentPhaseId ?? undefined,
    };

    setMessages((prev) => [...prev, contextMessage]);
    setIsContextLoaded(true);
  }, [selectedPhase]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        phaseId: selectedPhase?.id,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);

      try {
        // Build messages array for the API call
        const apiMessages = [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: content.trim() },
        ];

        // --- Replace with your actual AI API call ---
        // Example: OpenAI streaming
        // const response = await openai.chat.completions.create({
        //   model: 'gpt-4o',
        //   messages: apiMessages,
        //   stream: true,
        // });

        // Simulated response for demonstration
        await new Promise((r) => setTimeout(r, 600));
        const simulatedResponse = selectedPhase
          ? `I'm now fully aware of the "${selectedPhase.title}" phase. It has ${selectedPhase.tasks?.length ?? 0} tasks. How can I help you with this phase?`
          : "I'm ready to help! Please select a phase or ask me a general question.";

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: simulatedResponse,
          timestamp: new Date(),
          phaseId: selectedPhase?.id,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('[IRIS] Failed to send message:', error);
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
          phaseId: selectedPhase?.id,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, systemPrompt, selectedPhase]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    systemContext,
    systemPrompt,
    isContextLoaded,
    sendMessage,
    clearMessages,
    isStreaming,
  };
}