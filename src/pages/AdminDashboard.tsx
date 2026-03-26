import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee, Department, LeaveRequest, AuditLog, Announcement, PayrollPeriod, PayrollRecord } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'

interface Stats {
  totalEmployees: number
  activeDepts: number
  pendingLeaves: number
  totalUsers: number
}

interface AdminProps {
  activeSection: string
  onNavigate: (section: string) => void
}

interface SettingsState {
  company_name: string
  work_start: string
  work_end: string
  grace_period: string
  ot_multiplier: string
  email_notifs: string
}

const DEFAULT_SETTINGS: SettingsState = {
  company_name: 'San Isidro LGU',
  work_start: '08:00',
  work_end: '17:00',
  grace_period: '10',
  ot_multiplier: '1.25',
  email_notifs: 'enabled',
}

export function AdminDashboard({ activeSection, onNavigate }: AdminProps) {
  const { profile } = useAuth()
  const [stats, setStats] = useState<Stats>({ totalEmployees: 0, activeDepts: 0, pendingLeaves: 0, totalUsers: 0 })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([])
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [adminPayrollRecords, setAdminPayrollRecords] = useState<PayrollRecord[]>([])
  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState<PayrollPeriod | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [adminAnnouncements, setAdminAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddDept, setShowAddDept] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [newUser, setNewUser] = useState({ first_name: '', last_name: '', email: '', role: 'employee', department: '', password: '' })
  const [newDept, setNewDept] = useState({ name: '', description: '' })
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', body: '', target_role: 'all' })
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('All Action Types')
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null)
  const [hrNotes, setHrNotes] = useState('')
  const { showToast } = useToast()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [empRes, deptRes, leaveRes, allLeaveRes, logRes, settingsRes, payrollRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('name'),
      supabase.from('leave_requests').select('*, employee:employees(*)').eq('status', 'pending').limit(10),
      supabase.from('leave_requests').select('*, employee:employees(*)').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*, profile:profiles(full_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('system_settings').select('*'),
      supabase.from('payroll_periods').select('*').order('created_at', { ascending: false }),
    ])
    setPayrollPeriods((payrollRes.data || []) as PayrollPeriod[])
    const emps = (empRes.data || []) as Employee[]
    const depts = (deptRes.data || []) as Department[]
    const leaves = (leaveRes.data || []) as LeaveRequest[]
    setEmployees(emps)
    setDepartments(depts)
    setPendingLeaves(leaves)
    setAllLeaves((allLeaveRes.data || []) as LeaveRequest[])
    setAuditLogs((logRes.data || []) as AuditLog[])
    setStats({ totalEmployees: emps.length, activeDepts: depts.length, pendingLeaves: leaves.length, totalUsers: emps.length })

    // Load settings
    const saved: Record<string, string> = {}
    ;((settingsRes.data || []) as { key: string; value: string }[]).forEach(s => { saved[s.key] = s.value })
    setSettings({ ...DEFAULT_SETTINGS, ...saved })
    // Fetch announcements
    const annRes = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    setAdminAnnouncements((annRes.data || []) as Announcement[])
    setLoading(false)
  }

  async function handleSaveSettings() {
    setSettingsSaving(true)
    const entries = Object.entries(settings)
    for (const [key, value] of entries) {
      await supabase.from('system_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    setSettingsSaving(false)
    showToast('Settings saved', '✅')
  }

  async function handleAddEmployee() {
    const { error } = await supabase.from('employees').insert({
      full_name: `${newUser.first_name} ${newUser.last_name}`.trim(),
      email: newUser.email,
      department: newUser.department,
      position: newUser.role.charAt(0).toUpperCase() + newUser.role.slice(1),
      employee_id: `EMP-${Date.now().toString().slice(-5)}`,
      hire_date: new Date().toISOString().split('T')[0],
      status: 'active',
      basic_salary: 0,
    })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Employee created successfully', '✅')
    setShowAddUser(false)
    setNewUser({ first_name: '', last_name: '', email: '', role: 'employee', department: '', password: '' })
    fetchAll()
  }

  async function handleAddDept() {
    const { error } = await supabase.from('departments').insert({ name: newDept.name, description: newDept.description })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Department created', '🏢')
    setShowAddDept(false)
    setNewDept({ name: '', description: '' })
    fetchAll()
  }

  async function handleDeleteEmployee(id: string) {
    if (!confirm('Delete this employee? This will also remove all related records.')) return
    await supabase.from('employees').delete().eq('id', id)
    showToast('Employee removed', '🗑️')
    fetchAll()
  }

  async function handleBroadcast() {
    if (!newAnnouncement.title.trim() || !newAnnouncement.body.trim()) { showToast('Please fill in title and message', '❌'); return }
    const { error } = await supabase.from('announcements').insert({
      title: newAnnouncement.title,
      body: newAnnouncement.body,
      target_role: newAnnouncement.target_role,
      author_id: profile?.id || null,
    })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Announcement broadcast sent', '📢')
    setShowBroadcast(false)
    setNewAnnouncement({ title: '', body: '', target_role: 'all' })
  }

  async function handleLeaveAction(id: string, action: 'approved' | 'rejected') {
    const { error } = await supabase.from('leave_requests').update({
      status: action,
      hr_notes: hrNotes,
    }).eq('id', id)
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast(action === 'approved' ? 'Leave approved ✅' : 'Leave rejected', action === 'approved' ? '✅' : '❌')
    setReviewLeave(null)
    setHrNotes('')
    fetchAll()
  }

  async function handleApprovePayroll(id: string) {
    await supabase.from('payroll_periods').update({ status: 'approved' }).eq('id', id)
    await supabase.from('payroll_records').update({ status: 'approved' }).eq('period_id', id)
    showToast('Payroll approved', '✅')
    setSelectedPayrollPeriod(null)
    setAdminPayrollRecords([])
    fetchAll()
  }

  async function handleReturnPayroll(id: string) {
    await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', id)
    showToast('Payroll returned to payroll officer', '🔄')
    setSelectedPayrollPeriod(null)
    setAdminPayrollRecords([])
    fetchAll()
  }

  async function fetchPayrollRecords(period: PayrollPeriod) {
    setSelectedPayrollPeriod(period)
    const { data } = await supabase.from('payroll_records').select('*').eq('period_id', period.id)
    setAdminPayrollRecords((data || []) as PayrollRecord[])
  }

  function handleExportCSV() {
    const headers = ['Employee ID', 'Full Name', 'Email', 'Department', 'Position', 'Status', 'Hire Date', 'Basic Salary']
    const rows = employees.map(e => [e.employee_id, e.full_name, e.email, e.department, e.position, e.status, e.hire_date, e.basic_salary])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hrmatrix_employees_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported', '📄')
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-ok', inactive: 'badge-danger', on_leave: 'badge-warn' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  // Filter audit logs
  const filteredLogs = auditLogs.filter(log => {
    if (auditSearch && !log.action.toLowerCase().includes(auditSearch.toLowerCase()) && !(log.profile as any)?.full_name?.toLowerCase().includes(auditSearch.toLowerCase())) return false
    if (auditModule !== 'All Action Types' && log.table_name.toLowerCase() !== auditModule.toLowerCase()) return false
    return true
  })

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  return (
    <div className="wrap">
      {/* Dashboard Section */}
      {activeSection === 'dashboard' && (
        <>
          <div className="ph" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 16 }}>
            <div className="ph-sup">ADMINISTRATOR</div>
            <div className="ph-row">
              <div>
                <div className="ph-title" style={{ fontSize: '1.8rem', fontWeight: 700 }}>System Dashboard</div>
                <div className="ph-sub">Full system control — manage roles, departments, and system-wide settings.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className={`btn-refresh${loading ? ' spinning' : ''}`}
                  onClick={() => fetchAll()}
                  disabled={loading}
                  title="Refresh data"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                </button>
                <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' }} onClick={handleExportCSV}>Export Report</button>
                <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', color: 'white' }} onClick={() => setShowBroadcast(true)}>
                  <span>📢</span> Broadcast
                </button>
              </div>
            </div>
          </div>

          <div className="adm-stats-row">
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Total Employees</div>
              <div className="adm-stat-val">{stats.totalEmployees}</div>
              <div className="adm-stat-sub" style={{ color: '#10b981' }}>Active records</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Active Roles</div>
              <div className="adm-stat-val">5</div>
              <div className="adm-stat-sub">Across all portals</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Departments</div>
              <div className="adm-stat-val">{stats.activeDepts}</div>
              <div className="adm-stat-sub">Configured</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Pending Leave</div>
              <div className="adm-stat-val">{stats.pendingLeaves}</div>
              <div className="adm-stat-sub">Awaiting action</div>
            </div>
          </div>

          <div className="adm-section-title">Quick Actions</div>
          <div className="adm-quick-grid">
            <div className="adm-action-tile" onClick={() => setShowAddUser(true)}>
              <div className="adm-action-icon">👤</div>
              <div><div className="adm-action-title">Add User</div><div className="adm-action-desc">Create account and assign role</div></div>
            </div>
            <div className="adm-action-tile" onClick={() => setShowAddDept(true)}>
              <div className="adm-action-icon">🏢</div>
              <div><div className="adm-action-title">New Department</div><div className="adm-action-desc">Add or configure a department</div></div>
            </div>
            <div className="adm-action-tile" onClick={() => onNavigate('payroll')}>
              <div className="adm-action-icon">💰</div>
              <div><div className="adm-action-title">View Payroll</div><div className="adm-action-desc">See payroll period status</div></div>
            </div>
            <div className="adm-action-tile" onClick={() => onNavigate('leaves')}>
              <div className="adm-action-icon">📋</div>
              <div><div className="adm-action-title">Review Leave</div><div className="adm-action-desc">{stats.pendingLeaves} requests awaiting action</div></div>
            </div>
            <div className="adm-action-tile" onClick={() => onNavigate('audit')}>
              <div className="adm-action-icon">📜</div>
              <div><div className="adm-action-title">Audit Logs</div><div className="adm-action-desc">View recent system actions</div></div>
            </div>
            <div className="adm-action-tile" onClick={() => onNavigate('settings')}>
              <div className="adm-action-icon">⚙️</div>
              <div><div className="adm-action-title">System Settings</div><div className="adm-action-desc">Configure work hours & branding</div></div>
            </div>
          </div>

          <div className="adm-main-grid">
            <div className="adm-card">
              <div className="adm-card-hd">
                <div>
                  <span className="adm-card-title">Recent Activity</span>
                  <span className="adm-card-sub">{auditLogs.length > 0 ? `${auditLogs.length} entries` : 'No entries yet'}</span>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: '#3b82f6', fontSize: '.72rem' }} onClick={() => onNavigate('audit')}>View all logs →</button>
              </div>
              <div className="adm-feed">
                {auditLogs.length === 0 && (
                  <div style={{ padding: '20px 18px', color: 'var(--ink3)', fontSize: '.82rem', textAlign: 'center' }}>
                    No audit log entries yet. Actions will appear here as users interact with the system.
                  </div>
                )}
                {auditLogs.slice(0, 6).map(log => (
                  <div className="adm-feed-item" key={log.id}>
                    <div className="adm-feed-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>📝</div>
                    <div className="adm-feed-info">
                      <div><strong>{(log.profile as any)?.full_name || 'System'}</strong> — {log.action} on <strong>{log.table_name}</strong></div>
                      <div className="adm-feed-date">{new Date(log.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="adm-section-title">System Info</div>
              <div className="adm-card" style={{ padding: '4px 16px 16px' }}>
                <div className="adm-card-hd" style={{ padding: '12px 0 8px', borderBottom: 'none' }}><div className="adm-card-title" style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>Configuration</div></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Company</span><span className="adm-config-val">{settings.company_name}</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Work Start</span><span className="adm-config-val">{settings.work_start}</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Grace Period</span><span className="adm-config-val">{settings.grace_period} minutes</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">OT Multiplier</span><span className="adm-config-val">{settings.ot_multiplier}x</span></div>
                <div className="adm-config-row" style={{ borderBottom: 'none' }}><span className="adm-config-lbl">Email Notifs</span><span className="adm-config-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, background: settings.email_notifs === 'enabled' ? '#10b981' : '#ef4444', borderRadius: '50%' }} /> {settings.email_notifs === 'enabled' ? 'Enabled' : 'Disabled'}</span></div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Audit Logs Section */}
      {activeSection === 'audit' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="audit-header">
            <div>
              <div className="audit-bc">ADMINISTRATION / <strong>Audit Logs</strong></div>
              <div className="audit-title">Audit Logs</div>
              <div className="audit-desc">View all system actions. Filter by actor, date range, or action type.</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}>Export CSV</button>
          </div>

          <div className="audit-filters-row">
            <div className="audit-search-wrap">
              <input
                className="audit-search-input"
                placeholder="Search actor or action..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
              />
            </div>
            <select
              className="audit-select"
              value={auditModule}
              onChange={e => setAuditModule(e.target.value)}
            >
              <option>All Action Types</option>
              <option value="employees">Employees</option>
              <option value="leave_requests">Leave Requests</option>
              <option value="payroll_periods">Payroll</option>
              <option value="departments">Departments</option>
              <option value="profiles">Users</option>
              <option value="attendance_records">Attendance</option>
            </select>
          </div>

          <div className="card">
            <div className="audit-table-meta">
              <div className="audit-table-title">System Log</div>
              <div className="audit-table-count">Showing {filteredLogs.length} entries</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>TIMESTAMP</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>ACTOR</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>ACTION</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>TABLE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>
                      No audit log entries found. System actions will be recorded here as they occur.
                    </td></tr>
                  )}
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--ink3)', fontSize: '.75rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 500, fontSize: '.78rem' }}>{(log.profile as any)?.full_name || 'System'}</td>
                      <td style={{ fontSize: '.78rem' }}>{log.action}</td>
                      <td>
                        <span className="badge badge-slate">{log.table_name}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Users & Roles Section */}
      {activeSection === 'users' && (
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Users & Roles</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddUser(true)}>+ Add User</button>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Full Name</th><th>Email</th><th>Position</th><th>Dept</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                    <td style={{ color: 'var(--ink3)' }}>{e.email || '—'}</td>
                    <td>{e.position}</td>
                    <td>{e.department}</td>
                    <td>{statusBadge(e.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteEmployee(e.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Departments Section */}
      {activeSection === 'departments' && (
        <div className="card">
          <div className="card-hd">
            <div className="card-title">Departments</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDept(true)}>+ Add Dept</button>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Description</th><th style={{ textAlign: 'right' }}>Employees</th></tr></thead>
              <tbody>
                {departments.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td style={{ color: 'var(--ink3)' }}>{d.description || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{employees.filter(e => e.department === d.name).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System Settings Section — Now Persistent */}
      {activeSection === 'settings' && (
        <div className="card">
          <div className="card-hd">
            <div className="card-title">System Settings</div>
            <button className="btn btn-primary btn-sm" onClick={handleSaveSettings} disabled={settingsSaving}>
              {settingsSaving ? 'Saving…' : '💾 Save Settings'}
            </button>
          </div>
          <div className="card-body">
            <div className="form-grp" style={{ marginBottom: 20 }}>
              <label className="form-lbl">Company Name</label>
              <input className="form-ctrl" value={settings.company_name} onChange={e => setSettings(p => ({ ...p, company_name: e.target.value }))} />
            </div>
            <div className="form-row fr-2" style={{ marginBottom: 20 }}>
              <div className="form-grp"><label className="form-lbl">Work Start Time</label><input type="time" className="form-ctrl" value={settings.work_start} onChange={e => setSettings(p => ({ ...p, work_start: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Work End Time</label><input type="time" className="form-ctrl" value={settings.work_end} onChange={e => setSettings(p => ({ ...p, work_end: e.target.value }))} /></div>
            </div>
            <div className="form-row fr-2" style={{ marginBottom: 20 }}>
              <div className="form-grp"><label className="form-lbl">Grace Period (min)</label><input type="number" className="form-ctrl" value={settings.grace_period} onChange={e => setSettings(p => ({ ...p, grace_period: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">OT Multiplier</label><input type="number" step="0.05" className="form-ctrl" value={settings.ot_multiplier} onChange={e => setSettings(p => ({ ...p, ot_multiplier: e.target.value }))} /></div>
            </div>
            <div className="form-grp">
              <label className="form-lbl">Email Notifications</label>
              <select className="form-ctrl" value={settings.email_notifs} onChange={e => setSettings(p => ({ ...p, email_notifs: e.target.value }))}>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Employees Section — Now functional */}
      {activeSection === 'employees' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Employees</div><div className="card-sub">{employees.length} records</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={handleExportCSV}>📄 Export CSV</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>+ Add Employee</button>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee ID</th><th>Name</th><th>Email</th><th>Dept</th><th>Position</th><th>Salary</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{e.employee_id}</td>
                    <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                    <td style={{ color: 'var(--ink3)' }}>{e.email || '—'}</td>
                    <td>{e.department}</td>
                    <td>{e.position}</td>
                    <td>₱{Number(e.basic_salary).toLocaleString()}</td>
                    <td>{statusBadge(e.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteEmployee(e.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leaves Section — Now functional */}
      {activeSection === 'leaves' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Leave Requests</div><div className="card-sub">{allLeaves.length} total</div></div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {allLeaves.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.employee?.full_name || '—'}</td>
                    <td><span className="badge badge-purple">{l.leave_type}</span></td>
                    <td style={{ color: 'var(--ink3)', fontSize: '.72rem' }}>{l.start_date} – {l.end_date}</td>
                    <td>{l.days_count}d</td>
                    <td>{leaveBadge(l.status)}</td>
                    <td>
                      {(l.status === 'pending' || l.status === 'supervisor_approved') && (
                        <button className="btn btn-ghost btn-xs" onClick={() => setReviewLeave(l)}>Review</button>
                      )}
                    </td>
                  </tr>
                ))}
                {allLeaves.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No leave requests</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payroll Section — Admin Approval */}
      {activeSection === 'payroll' && (() => {
        const admTotalGross = adminPayrollRecords.reduce((s, r) => s + Number(r.gross_pay), 0)
        const admTotalNet = adminPayrollRecords.reduce((s, r) => s + Number(r.net_pay), 0)
        const admTotalDeductions = admTotalGross - admTotalNet
        const statusMap: Record<string, string> = { draft: 'badge-slate', processing: 'badge-warn', review: 'badge-info', approved: 'badge-teal', paid: 'badge-ok' }
        const statusLabels: Record<string, string> = { draft: 'Draft', processing: 'Processing', review: 'Pending Approval', approved: 'Approved', paid: 'Paid' }
        return (
          <>
            {selectedPayrollPeriod && (
              <>
                <div style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--accent-lt)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: '.82rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--accent)' }}>📋 Viewing: <strong>{selectedPayrollPeriod.period_name}</strong></span>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedPayrollPeriod(null); setAdminPayrollRecords([]) }}>✕ Close</button>
                </div>
                <div className="stat-grid" style={{ marginBottom: 16 }}>
                  <div className="stat-tile"><div className="stat-label">Total Gross</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{admTotalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
                  <div className="stat-tile"><div className="stat-label">Total Deductions</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{admTotalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
                  <div className="stat-tile"><div className="stat-label">Total Net Pay</div><div className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--ok)' }}>₱{admTotalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
                  <div className="stat-tile"><div className="stat-label">Employees</div><div className="stat-value">{adminPayrollRecords.length}</div></div>
                </div>
              </>
            )}
            <div className="card">
              <div className="card-hd">
                <div><div className="card-title">Payroll Periods</div><div className="card-sub">{payrollPeriods.filter(p => p.status === 'review').length} pending approval</div></div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Period</th><th>Dates</th><th>Pay Date</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {payrollPeriods.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No payroll periods yet</td></tr>}
                    {payrollPeriods.map(p => (
                      <tr key={p.id} style={{ background: selectedPayrollPeriod?.id === p.id ? 'var(--accent-lt)' : undefined }}>
                        <td style={{ fontWeight: 500 }}>{p.period_name}</td>
                        <td style={{ color: 'var(--ink3)', fontSize: '.72rem' }}>{p.start_date} – {p.end_date}</td>
                        <td style={{ color: 'var(--ink3)' }}>{p.pay_date}</td>
                        <td><span className={`badge ${statusMap[p.status] || 'badge-slate'}`}>{statusLabels[p.status] || p.status}</span></td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => fetchPayrollRecords(p)}>View</button>
                          {p.status === 'review' && (
                            <>
                              <button className="btn btn-ok btn-xs" onClick={() => handleApprovePayroll(p.id)}>✅ Approve</button>
                              <button className="btn btn-ghost btn-xs" onClick={() => handleReturnPayroll(p.id)}>🔄 Return</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      })()}

      {/* Notifications Section */}
      {activeSection === 'notifications' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">🔔 Notifications & Announcements</div><div className="card-sub">{adminAnnouncements.length} total</div></div>
          <div style={{ padding: '0' }}>
            {adminAnnouncements.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: '.82rem' }}>
                No announcements at this time. Use the Broadcast button on the Dashboard to send one.
              </div>
            )}
            {adminAnnouncements.map(a => (
              <div key={a.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-lt)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', flexShrink: 0 }}>📢</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--ink3)', lineHeight: 1.5 }}>{a.body}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>{new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    {a.target_role !== 'all' && <span className="badge badge-slate" style={{ fontSize: '.55rem' }}>{a.target_role}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <div className={`modal-ov${showAddUser ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddUser(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Add New User / Employee</div><div className="modal-sub">Create a new system record</div></div>
            <button className="modal-x" onClick={() => setShowAddUser(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">First Name</label><input className="form-ctrl" value={newUser.first_name} onChange={e => setNewUser(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" /></div>
              <div className="form-grp"><label className="form-lbl">Last Name</label><input className="form-ctrl" value={newUser.last_name} onChange={e => setNewUser(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Email</label><input className="form-ctrl" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="email@company.com" /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Department</label>
                <select className="form-ctrl" value={newUser.department} onChange={e => setNewUser(p => ({ ...p, department: e.target.value }))}>
                  <option value="">Select Dept…</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-grp"><label className="form-lbl">Role</label>
                <select className="form-ctrl" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="hr_manager">HR Manager</option>
                  <option value="payroll_officer">Payroll Officer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddEmployee}>Create Record</button>
          </div>
        </div>
      </div>

      {/* Add Dept Modal */}
      <div className={`modal-ov${showAddDept ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddDept(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Add New Department</div></div>
            <button className="modal-x" onClick={() => setShowAddDept(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Department Name</label><input className="form-ctrl" value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Finance" /></div>
            <div className="form-grp"><label className="form-lbl">Description</label><textarea className="form-ctrl" value={newDept.description} onChange={e => setNewDept(p => ({ ...p, description: e.target.value }))} placeholder="What does this department do?" /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddDept}>Create Department</button>
          </div>
        </div>
      </div>

      {/* Broadcast Announcement Modal */}
      <div className={`modal-ov${showBroadcast ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowBroadcast(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">📢 Broadcast Announcement</div><div className="modal-sub">Send a message to all users</div></div>
            <button className="modal-x" onClick={() => setShowBroadcast(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Title</label><input className="form-ctrl" value={newAnnouncement.title} onChange={e => setNewAnnouncement(p => ({ ...p, title: e.target.value }))} placeholder="Announcement title" /></div>
            <div className="form-grp"><label className="form-lbl">Message</label><textarea className="form-ctrl" rows={4} value={newAnnouncement.body} onChange={e => setNewAnnouncement(p => ({ ...p, body: e.target.value }))} placeholder="Write your announcement…" /></div>
            <div className="form-grp"><label className="form-lbl">Target Audience</label>
              <select className="form-ctrl" value={newAnnouncement.target_role} onChange={e => setNewAnnouncement(p => ({ ...p, target_role: e.target.value }))}>
                <option value="all">All Users</option>
                <option value="employee">Employees Only</option>
                <option value="supervisor">Supervisors Only</option>
                <option value="hr_manager">HR Managers Only</option>
                <option value="payroll_officer">Payroll Officers Only</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleBroadcast}>Send Announcement</button>
          </div>
        </div>
      </div>

      {/* Review Leave Modal */}
      <div className={`modal-ov${reviewLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setReviewLeave(null) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Review Leave Request</div><div className="modal-sub">{reviewLeave?.employee?.full_name}</div></div>
            <button className="modal-x" onClick={() => setReviewLeave(null)}>✕</button>
          </div>
          {reviewLeave && (
            <div className="modal-body">
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '.82rem' }}>
                <div><strong>Type:</strong> {reviewLeave.leave_type}</div>
                <div><strong>Dates:</strong> {reviewLeave.start_date} – {reviewLeave.end_date} ({reviewLeave.days_count} days)</div>
                <div><strong>Reason:</strong> {reviewLeave.reason}</div>
              </div>
              <div className="form-grp">
                <label className="form-lbl">Admin Notes</label>
                <textarea className="form-ctrl" rows={3} value={hrNotes} onChange={e => setHrNotes(e.target.value)} placeholder="Optional notes…" />
              </div>
              <div className="modal-ft" style={{ padding: 0, paddingTop: 12, background: 'none' }}>
                <button className="btn btn-danger btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'rejected')}>Reject</button>
                <button className="btn btn-ok btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'approved')}>Approve</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
