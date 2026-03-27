import React, { createContext, useContext, useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'warn' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
  removing?: boolean
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

const toastConfig: Record<ToastType, { icon: string; border: string; bg: string; color: string }> = {
  success: { icon: '✅', border: '#10b981', bg: '#f0fdf4', color: '#065f46' },
  error:   { icon: '❌', border: '#ef4444', bg: '#fef2f2', color: '#991b1b' },
  warn:    { icon: '⚠️', border: '#f59e0b', bg: '#fffbeb', color: '#92400e' },
  info:    { icon: 'ℹ️', border: '#3b82f6', bg: '#eff6ff', color: '#1e40af' },
}

let _counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_counter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350)
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
        maxWidth: 360,
      }}>
        {toasts.map(t => {
          const cfg = toastConfig[t.type]
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.border}`,
                borderRadius: 10,
                padding: '12px 16px',
                boxShadow: '0 4px 16px rgba(0,0,0,.10)',
                fontSize: '.83rem', color: cfg.color,
                opacity: t.removing ? 0 : 1,
                transform: t.removing ? 'translateX(20px)' : 'translateX(0)',
                transition: 'all .35s ease',
                pointerEvents: 'auto',
                maxWidth: 360,
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
              <span style={{ lineHeight: 1.5 }}>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
