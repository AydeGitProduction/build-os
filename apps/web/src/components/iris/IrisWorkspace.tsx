// apps/web/src/components/iris/IrisWorkspace.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IrisPreviewPanel } from "./IrisPreviewPanel";
import { IrisChatMessage } from "./IrisChatMessage";
import { IrisInputBar } from "./IrisInputBar";
import type { IrisPreviewData, ChatMessage } from "@/types/iris";

interface IrisWorkspaceProps {
  projectId: string;
  initialMessages?: ChatMessage[];
}

export function IrisWorkspace({ projectId, initialMessages = [] }: IrisWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [previewData, setPreviewData] = useState<IrisPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Scroll to bottom on new messages ────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ─── Fetch draft preview from backend ────────────────────────────────────
  /**
   * Fetches the current draft preview state from the backend.
   * On success with data: updates previewData.
   * On success with null: sets previewData to null (empty state).
   * On fetch failure: keeps existing previewData unchanged (no blanking).
   */
  const fetchDraftPreview = useCallback(async () => {
    if (!projectId) return;

    setIsFetchingPreview(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/draft-preview`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Use a fresh AbortController per fetch — don't cancel on new messages
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!response.ok) {
        // Non-2xx: log but keep existing preview data
        console.warn(
          `[IrisWorkspace] draft-preview fetch failed: ${response.status} ${response.statusText}`
        );
        return;
      }

      const json = await response.json();

      // Backend returns { data: IrisPreviewData | null }
      if (json.data !== undefined) {
        setPreviewData(json.data); // null → empty state, object → real data
      } else {
        // Unexpected shape — keep existing data
        console.warn("[IrisWorkspace] draft-preview: unexpected response shape", json);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // Timeout or abort — silently keep existing preview
        return;
      }
      // Network / parse error — keep existing preview data
      console.warn("[IrisWorkspace] draft-preview fetch error:", error);
    } finally {
      setIsFetchingPreview(false);
    }
  }, [projectId]);

  // ─── On mount: hydrate preview from backend ───────────────────────────────
  useEffect(() => {
    fetchDraftPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Re-hydrate if projectId changes (e.g., navigation)

  // ─── Send a message to IRIS ───────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
      setIsLoading(true);

      // Cancel any in-flight exchange request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`/api/projects/${projectId}/iris/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content.trim() }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Exchange failed: ${response.status}`);
        }

        const json = await response.json();

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: json.reply ?? json.message ?? "",
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // ── After each reply: fetch real preview data from backend ──────────
        // Do NOT await — let it run in background so chat remains responsive
        fetchDraftPreview();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return; // User cancelled or component unmounted
        }

        console.error("[IrisWorkspace] exchange error:", error);

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "I encountered an issue processing your message. Please try again.",
          timestamp: new Date().toISOString(),
          isError: true,
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, isLoading, fetchDraftPreview]
  );

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ─── Handle input submission ──────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      sendMessage(inputValue);
    },
    [inputValue, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="iris-workspace flex h-full w-full overflow-hidden">
      {/* Left: Chat panel */}
      <div className="iris-workspace__chat flex flex-col flex-1 min-w-0 h-full">
        {/* Messages */}
        <div className="iris-workspace__messages flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="iris-workspace__empty-chat flex flex-col items-center justify-center h-full text-center">
              <div className="iris-workspace__empty-icon text-4xl mb-3">🌐</div>
              <p className="text-muted-foreground text-sm max-w-xs">
                Tell IRIS about your product idea. The more context you share, the
                better your blueprint will be.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <IrisChatMessage key={message.id} message={message} />
          ))}

          {isLoading && (
            <div className="iris-workspace__thinking flex items-center gap-2 text-muted-foreground text-sm">
              <span className="iris-workspace__thinking-dots animate-pulse">
                IRIS is thinking…
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="iris-workspace__input border-t border-border px-6 py-4">
          <IrisInputBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            isLoading={isLoading}
            placeholder="Describe your product idea…"
          />
        </div>
      </div>

      {/* Right: Preview panel */}
      <div className="iris-workspace__preview hidden lg:flex flex-col w-[380px] border-l border-border h-full overflow-hidden">
        <IrisPreviewPanel
          data={previewData}
          isLoading={isFetchingPreview}
        />
      </div>
    </div>
  );
}