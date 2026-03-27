import React from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ isOpen, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null
  return (
    <div
      className="modal-ov active"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-hd" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <div className="modal-title" style={{ color: danger ? 'var(--danger)' : undefined }}>
              {danger ? '⚠️ ' : '❓ '}{title}
            </div>
          </div>
          <button className="modal-x" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '.85rem', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 20 }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button
              className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => { onConfirm(); }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
