// src/lib/api.ts
//
// Minimal client-side API helpers.
// Uses native fetch — no external dependencies.

/**
 * GET request that parses JSON and throws on non-2xx responses.
 *
 * @example
 *   const data = await apiGet<{ data: Blueprint }>('/api/projects/123/blueprint')
 */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!res.ok) {
    let message = `API error ${res.status}`
    try {
      const body = await res.json()
      message = body?.error ?? body?.message ?? message
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

/**
 * POST request that sends JSON and parses the JSON response.
 */
export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  })

  if (!res.ok) {
    let message = `API error ${res.status}`
    try {
      const errBody = await res.json()
      message = errBody?.error ?? errBody?.message ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

/**
 * PATCH request that sends JSON and parses the JSON response.
 */
export async function apiPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  })

  if (!res.ok) {
    let message = `API error ${res.status}`
    try {
      const errBody = await res.json()
      message = errBody?.error ?? errBody?.message ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}
