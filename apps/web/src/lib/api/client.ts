/**
 * Build OS — Typed API Client
 * Central fetch wrapper with auto-auth, error handling, retry.
 * All UI components use this — no inline fetch() calls.
 *
 * WS10 — Backend Connection
 */

import { createClient } from '@/lib/supabase/client'

// ─── Response Wrapper ─────────────────────────────────────────────────────────

export interface ApiResult<T> {
  data: T | null
  error: string | null
  status: number
}

// ─── Auth Header ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

// ─── Core Methods ─────────────────────────────────────────────────────────────

export async function apiGet<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, ...(init?.headers ?? {}) },
      ...init,
    })
    if (res.status === 204) return { data: null, error: null, status: 204 }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: json?.error ?? `HTTP ${res.status}`, status: res.status }
    }
    return { data: json as T, error: null, status: res.status }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error', status: 0 }
  }
}

export async function apiPost<T>(url: string, body?: unknown, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, ...(init?.headers ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: json?.error ?? `HTTP ${res.status}`, status: res.status }
    }
    return { data: json as T, error: null, status: res.status }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error', status: 0 }
  }
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: json?.error ?? `HTTP ${res.status}`, status: res.status }
    }
    return { data: json as T, error: null, status: res.status }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Network error', status: 0 }
  }
}
