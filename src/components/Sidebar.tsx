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

const roleColors: Record<UserRole, string> = {
  admin: '#d03027',
  hr_manager: '#0891b2',
  payroll_officer: '#0d9f6e',
  supervisor: '#c27803',
  employee: '#6d28d9',
}

interface NavItem {
  icon: string
  label: string
  section: string
  badge?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

interface SidebarProps {
  activeSection: string
  onNavigate: (section: string) => void
  navGroups: NavGroup[]
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ activeSection, onNavigate, navGroups, isOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const roleColor = profile?.role ? roleColors[profile.role] : '#666'

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`} id="sidebar">
      <div className="sb-logo">
        <div className="sb-logo-row">
          <div className="sb-seal">HR</div>
          <div>
            <div className="sb-name">HRMatrix</div>
            <div className="sb-sub">Management Suite</div>
          </div>
        </div>
        <div className={`sb-role-chip ${profile?.role || 'employee'}`}>
          ● {profile?.role ? roleLabels[profile.role] : 'User'}
        </div>
      </div>

      <nav className="sb-nav">
        {navGroups.map((group) => (
          <div className="sb-sec" key={group.label}>
            <div className="sb-sec-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.section}
                className={`sb-link${activeSection === item.section ? ' active' : ''}`}
                onClick={() => onNavigate(item.section)}
              >
                <span className="sb-icon">{item.icon}</span>
                {item.label}
                {item.badge ? <span className="sb-badge">{item.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-sig-pill">
          <div className="sig-dot"></div>
          Logged in
        </div>
        <div className="sb-user">
          <div className="sb-avatar" style={{ background: roleColor, color: 'white' }}>
            {initials}
          </div>
          <div className="sb-user-info">
            <div className="sb-user-name">{profile?.full_name || 'User'}</div>
            <div className="sb-user-id-dept">{profile?.employee_id || 'EMP-000'} · {profile?.department || 'Staff'}</div>
          </div>
        </div>
        <button className="sb-signout" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  )
}
