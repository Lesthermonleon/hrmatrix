import React from 'react'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../lib/supabase'

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  hr_manager: 'HR Manager',
  payroll_officer: 'Payroll Officer',
  supervisor: 'Supervisor',
  employee: 'Employee',
}

interface TopbarProps {
  pageName: string
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onMenuToggle?: () => void
}

export function Topbar({ pageName, theme, onToggleTheme, onMenuToggle }: TopbarProps) {
  const { profile } = useAuth()
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <header className="topbar">
      <div className="tb-left">
        {onMenuToggle && (
          <button className="tb-menu-btn" onClick={onMenuToggle} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        )}
        <span className="tb-crumb">HRMatrix /</span>
        <span className="tb-page">{pageName}</span>
      </div>
      <div className="tb-right">
        <div className="tb-chip tb-chip-ok">
          <div className="tb-dot"></div>
          All Systems Online
        </div>
        <button className="tb-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="tb-user" style={{ cursor: 'default' }}>
          <div className="tb-av">{initials}</div>
          <span className="tb-uname">{profile?.role ? roleLabels[profile.role] : 'User'}</span>
        </button>
      </div>
    </header>
  )
}
