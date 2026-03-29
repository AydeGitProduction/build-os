'use client'

import { useState, useCallback } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration?: number
}

let toastIdCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, variant: ToastVariant = 'info', duration = 4000) => {
    const id = `toast-${++toastIdCounter}`
    setToasts(prev => [...prev, { id, message, variant, duration }])

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }

    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const success = useCallback((msg: string, duration?: number) => addToast(msg, 'success', duration), [addToast])
  const error   = useCallback((msg: string, duration?: number) => addToast(msg, 'error', duration || 6000), [addToast])
  const warning = useCallback((msg: string, duration?: number) => addToast(msg, 'warning', duration), [addToast])
  const info    = useCallback((msg: string, duration?: number) => addToast(msg, 'info', duration), [addToast])

  return { toasts, addToast, removeToast, success, error, warning, info }
}
