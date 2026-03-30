'use client'

import { useState, useEffect } from 'react'
import type { IrisAssumption } from './IrisWorkspace'

interface IrisAssumptionCardsProps {
  assumptions: IrisAssumption[]
  /** Called when user accepts / rejects / modifies. Propagates to parent for persistence. */
  onAction?: (id: string, action: 'accepted' | 'rejected' | 'modified', newValue?: string) => void
}

export function IrisAssumptionCards({ assumptions, onAction }: IrisAssumptionCardsProps) {
  // Internal display state — synced from props but preserves user edits
  const [items, setItems] = useState<IrisAssumption[]>(assumptions)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // When assumptions prop changes (e.g. real blueprint arrives),
  // merge new data while preserving existing statuses/values the user already set.
  useEffect(() => {
    setItems((prev) => {
      const prevMap = Object.fromEntries(prev.map((a) => [a.id, a]))
      return assumptions.map((a) =>
        prevMap[a.id]
          ? { ...a, status: prevMap[a.id].status, value: prevMap[a.id].value }
          : a
      )
    })
  }, [assumptions])

  const accept = (id: string) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a)))
    onAction?.(id, 'accepted')
  }

  const reject = (id: string) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)))
    onAction?.(id, 'rejected')
  }

  const startEdit = (assumption: IrisAssumption) => {
    setEditingId(assumption.id)
    setEditValue(assumption.value)
  }

  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, value: editValue, status: 'modified' } : a))
    )
    onAction?.(id, 'modified', editValue)
    setEditingId(null)
  }

  if (items.length === 0) return null

  return (
    <div className="iris-ac">
      <h3 className="iris-ac-title">Assumptions</h3>
      <div className="iris-ac-list">
        {items.map((assumption) => (
          <div key={assumption.id} className={`iris-ac-card iris-ac-card--${assumption.status}`}>
            <div className="iris-ac-card-header">
              <span className="iris-ac-label">{assumption.label}</span>
              <span className={`iris-ac-badge iris-ac-badge--${assumption.status}`}>
                {assumption.status}
              </span>
            </div>

            {editingId === assumption.id ? (
              <div className="iris-ac-edit">
                <input
                  className="iris-ac-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(assumption.id)}
                  autoFocus
                />
                <button
                  className="iris-ac-btn iris-ac-btn--save"
                  onClick={() => saveEdit(assumption.id)}
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="iris-ac-value">{assumption.value}</p>
            )}

            {assumption.status === 'pending' && editingId !== assumption.id && (
              <div className="iris-ac-actions">
                <button
                  className="iris-ac-btn iris-ac-btn--accept"
                  onClick={() => accept(assumption.id)}
                  aria-label={`Accept ${assumption.label}`}
                >
                  ✓ Accept
                </button>
                <button
                  className="iris-ac-btn iris-ac-btn--modify"
                  onClick={() => startEdit(assumption)}
                  aria-label={`Modify ${assumption.label}`}
                >
                  ✎ Modify
                </button>
                <button
                  className="iris-ac-btn iris-ac-btn--reject"
                  onClick={() => reject(assumption.id)}
                  aria-label={`Reject ${assumption.label}`}
                >
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
