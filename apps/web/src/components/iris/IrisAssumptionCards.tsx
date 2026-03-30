'use client'

import { useState } from 'react'
import type { IrisAssumption } from './IrisWorkspace'

interface IrisAssumptionCardsProps {
  assumptions: IrisAssumption[]
}

export function IrisAssumptionCards({ assumptions }: IrisAssumptionCardsProps) {
  const [items, setItems] = useState<IrisAssumption[]>(assumptions)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const accept = (id: string) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a)))
  }

  const reject = (id: string) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)))
  }

  const startEdit = (assumption: IrisAssumption) => {
    setEditingId(assumption.id)
    setEditValue(assumption.value)
  }

  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, value: editValue, status: 'modified' } : a))
    )
    setEditingId(null)
  }

  if (items.length === 0) return null

  return (
    <div className="iris-ac">
      <h3 className="iris-ac-title">Assumptions</h3>
      <div className="iris-ac-list">
        {items.map((assumption) => (
          <div
            key={assumption.id}
            className={`iris-ac-card iris-ac-card--${assumption.status}`}
          >
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
