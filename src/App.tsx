import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { LoginPage } from './pages/LoginPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { HRManagerDashboard } from './pages/HRManagerDashboard'
import { PayrollOfficerDashboard } from './pages/PayrollOfficerDashboard'
import { SupervisorDashboard } from './pages/SupervisorDashboard'
import { EmployeeDashboard } from './pages/EmployeeDashboard'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import type { UserRole } from './lib/supabase'

// Nav configs per role
const navConfig: Record<UserRole, { label: string; items: { icon: string; label: string; section: string; badge?: number }[] }[]> = {
  admin: [
    {
      label: 'OVERVIEW',
      items: [
        { icon: '📊', label: 'Dashboard', section: 'dashboard' },
        { icon: '📜', label: 'Audit Logs', section: 'audit' },
        { icon: '🔔', label: 'Notifications', section: 'notifications', badge: 3 },
      ],
    },
    {
      label: 'ADMINISTRATION',
      items: [
        { icon: '👥', label: 'Users & Roles', section: 'users' },
        { icon: '🏢', label: 'Departments', section: 'departments' },
        { icon: '⚙️', label: 'System Settings', section: 'settings' },
      ],
    },
    {
      label: 'OPERATIONS',
      items: [
        { icon: '👤', label: 'Employees', section: 'employees' },
        { icon: '📅', label: 'Leave Management', section: 'leaves' },
        { icon: '💰', label: 'Payroll', section: 'payroll' },
      ],
    },
  ],
  hr_manager: [
    {
      label: 'HR Operations',
      items: [
        { icon: '⬛', label: 'Overview', section: 'overview' },
        { icon: '👥', label: 'Employees', section: 'employees' },
        { icon: '📅', label: 'Leave Requests', section: 'leaves' },
        { icon: '📋', label: 'Attendance', section: 'attendance' },
      ],
    },
  ],
  payroll_officer: [
    {
      label: 'Payroll',
      items: [
        { icon: '📄', label: 'Pay Periods', section: 'periods' },
        { icon: '💵', label: 'Payroll Records', section: 'records' },
        { icon: '📊', label: 'Summary', section: 'summary' },
      ],
    },
  ],
  supervisor: [
    {
      label: 'Team',
      items: [
        { icon: '⬛', label: 'Overview', section: 'overview' },
        { icon: '👥', label: 'My Team', section: 'team' },
        { icon: '📅', label: 'Leave Requests', section: 'leaves' },
        { icon: '📋', label: 'Attendance', section: 'attendance' },
      ],
    },
  ],
  employee: [
    {
      label: 'MY PORTAL',
      items: [
        { icon: '🏠', label: 'Home', section: 'dashboard' },
        { icon: '👤', label: 'My Profile', section: 'profile' },
      ],
    },
    {
      label: 'WORK',
      items: [
        { icon: '🕒', label: 'Attendance', section: 'attendance' },
        { icon: '📋', label: 'Leave Requests', section: 'leaves' },
      ],
    },
    {
      label: 'PAYROLL',
      items: [
        { icon: '📄', label: 'My Payslips', section: 'payslips' },
      ],
    },
    {
      label: 'ALERTS',
      items: [
        { icon: '🔔', label: 'Notifications', section: 'notifications', badge: 3 },
      ],
    },
  ],
}

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard', overview: 'Overview', users: 'Users & Roles',
  departments: 'Departments', employees: 'Employees', leave: 'Leave Management',
  leaves: 'Leave Requests', payroll: 'Payroll', attendance: 'Attendance',
  audit: 'Audit Logs', settings: 'Settings', periods: 'Pay Periods',
  records: 'Payroll Records', summary: 'Summary', team: 'My Team',
  payslips: 'Payslips', profile: 'My Profile',
}

function AppShell() {
  const { user, profile, loading } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeSection, setActiveSection] = useState('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '')
  }, [theme])

  // Set default section per role
  useEffect(() => {
    if (profile?.role) {
      const defaults: Record<UserRole, string> = {
        admin: 'dashboard',
        hr_manager: 'overview',
        payroll_officer: 'periods',
        supervisor: 'overview',
        employee: 'dashboard',
      }
      setActiveSection(defaults[profile.role])
    }
  }, [profile?.role])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--ink3)', fontSize: '.88rem' }}>Loading HRMatrix…</div>
      </div>
    )
  }

  if (!user || !profile) return <LoginPage />

  const role = profile.role as UserRole
  const nav = navConfig[role] || navConfig.employee

  const renderDashboard = () => {
    const props = { activeSection, onNavigate: setActiveSection }
    switch (role) {
      case 'admin':
        return <AdminDashboard {...props} />
      case 'hr_manager':
        return <HRManagerDashboard {...props} />
      case 'payroll_officer':
        return <PayrollOfficerDashboard {...props} />
      case 'supervisor':
        return <SupervisorDashboard {...props} />
      case 'employee':
      default:
        return <EmployeeDashboard {...props} />
    }
  }

  return (
    <div className="shell">
      {/* Backdrop for mobile sidebar */}
      {isSidebarOpen && <div className="sb-backdrop" onClick={() => setIsSidebarOpen(false)} />}
      <Sidebar
        activeSection={activeSection}
        onNavigate={(s) => { setActiveSection(s); setIsSidebarOpen(false); }}
        navGroups={nav}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="main">
        <Topbar
          pageName={pageTitles[activeSection] || activeSection}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          onMenuToggle={() => setIsSidebarOpen(true)}
        />
        {renderDashboard()}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  )
}
