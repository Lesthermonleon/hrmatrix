import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee, Department, LeaveRequest } from '../lib/supabase'
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

const mockLogs = [
  { id: 1, timestamp: '2026-03-20 09:14:03', actor: 'System', action: 'Payroll computed', module: 'PAYROLL', target: 'Feb 2026' },
  { id: 2, timestamp: '2026-03-20 08:50:11', actor: 'Ramon Aguila', action: 'Role assigned: HR Manager', module: 'USERS', target: 'Maria Santos' },
  { id: 3, timestamp: '2026-03-20 08:32:44', actor: 'Ramon Aguila', action: 'Leave balance adjusted +3d', module: 'LEAVE', target: 'Jose Reyes' },
  { id: 4, timestamp: '2026-03-19 17:02:17', actor: 'Ramon Aguila', action: 'Grace period set to 10 min', module: 'SETTINGS', target: 'System' },
  { id: 5, timestamp: '2026-03-19 15:45:30', actor: 'Ramon Aguila', action: 'Leave request rejected', module: 'LEAVE', target: 'Anna Cruz' },
  { id: 6, timestamp: '2026-03-19 11:20:05', actor: 'Ramon Aguila', action: 'Department created', module: 'DEPARTMENTS', target: 'Digital Services' },
  { id: 7, timestamp: '2026-03-19 09:00:00', actor: 'System', action: 'Scheduled backup completed', module: 'SYSTEM', target: 'DB' },
]

export function AdminDashboard({ activeSection, onNavigate }: AdminProps) {
  const [stats, setStats] = useState<Stats>({ totalEmployees: 0, activeDepts: 0, pendingLeaves: 0, totalUsers: 0 })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddDept, setShowAddDept] = useState(false)
  const [newUser, setNewUser] = useState({ first_name: '', last_name: '', email: '', role: 'employee', department: '', password: '' })
  const [newDept, setNewDept] = useState({ name: '', description: '' })
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('All Action Types')
  const { showToast } = useToast()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [empRes, deptRes, leaveRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('name'),
      supabase.from('leave_requests').select('*, employee:employees(*)').eq('status', 'pending').limit(10),
    ])
    const emps = (empRes.data || []) as Employee[]
    const depts = (deptRes.data || []) as Department[]
    const leaves = (leaveRes.data || []) as LeaveRequest[]
    setEmployees(emps)
    setDepartments(depts)
    setPendingLeaves(leaves)
    setStats({ totalEmployees: emps.length, activeDepts: depts.length, pendingLeaves: leaves.length, totalUsers: emps.length })
    setLoading(false)
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
    if (!confirm('Delete this employee?')) return
    await supabase.from('employees').delete().eq('id', id)
    showToast('Employee removed', '🗑️')
    fetchAll()
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-ok', inactive: 'badge-danger', on_leave: 'badge-warn' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

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
                <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)' }}>Export Report</button>
                <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', color: 'white' }}>
                  <span>📢</span> Broadcast
                </button>
              </div>
            </div>
          </div>

          <div className="adm-stats-row">
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Total Employees</div>
              <div className="adm-stat-val">{stats.totalEmployees}</div>
              <div className="adm-stat-sub" style={{ color: '#10b981' }}>+5 this month</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Active Roles</div>
              <div className="adm-stat-val">6</div>
              <div className="adm-stat-sub">Across 4 portals</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Departments</div>
              <div className="adm-stat-val">{stats.activeDepts}</div>
              <div className="adm-stat-sub">2 pending setup</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Pending Leave</div>
              <div className="adm-stat-val">{stats.pendingLeaves}</div>
              <div className="adm-stat-sub">Awaiting override</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">Open Payroll</div>
              <div className="adm-stat-val">1</div>
              <div className="adm-stat-sub">March 2025 period</div>
            </div>
            <div className="adm-stat-tile">
              <div className="adm-stat-lbl">System Alerts</div>
              <div className="adm-stat-val">0</div>
              <div className="adm-stat-sub" style={{ color: '#10b981' }}>All clear</div>
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
              <div><div className="adm-action-title">Release Payroll</div><div className="adm-action-desc">Manually release March 2025</div></div>
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
                  <span className="adm-card-title">System Activity Feed</span>
                  <span className="adm-card-sub">Last 24 hours</span>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ color: '#3b82f6', fontSize: '.72rem' }} onClick={() => onNavigate('audit')}>View all logs →</button>
              </div>
              <div className="adm-feed">
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>✔</div>
                  <div className="adm-feed-info">
                    <div>Payroll computed — <strong>February 2025 period finalized by system</strong></div>
                    <div className="adm-feed-date">Today, 10:45 AM</div>
                  </div>
                </div>
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>👤</div>
                  <div className="adm-feed-info">
                    <div>Maria Santos assigned role <strong>HR Manager</strong> by Ramon Aguila</div>
                    <div className="adm-feed-date">Today, 9:20 AM</div>
                  </div>
                </div>
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#fff7ed', color: '#f97316' }}>⚖️</div>
                  <div className="adm-feed-info">
                    <div>Leave balance adjusted — <strong>Jose Reyes, Engineering, +3 days</strong> by R. Aguila</div>
                    <div className="adm-feed-date">Today, 8:12 AM</div>
                  </div>
                </div>
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}>⚙️</div>
                  <div className="adm-feed-info">
                    <div>System settings updated — <strong>Grace period changed to 10 min</strong></div>
                    <div className="adm-feed-date">Yesterday, 2:50 PM</div>
                  </div>
                </div>
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>✕</div>
                  <div className="adm-feed-info">
                    <div>Leave request rejected — <strong>Anna Cruz, Accounting. Override by Admin</strong></div>
                    <div className="adm-feed-date">Yesterday, 1:15 PM</div>
                  </div>
                </div>
                <div className="adm-feed-item">
                  <div className="adm-feed-icon" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>🏢</div>
                  <div className="adm-feed-info">
                    <div>Department created — <strong>"Digital Services"</strong> added to org chart</div>
                    <div className="adm-feed-date">Yesterday, 11:32 AM</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="adm-section-title">System Info</div>
              <div className="adm-card" style={{ padding: '4px 16px 16px' }}>
                <div className="adm-card-hd" style={{ padding: '12px 0 8px', borderBottom: 'none' }}><div className="adm-card-title" style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>Configuration</div></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Company</span><span className="adm-config-val">San Isidro LGU</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Work Start</span><span className="adm-config-val">8:00 AM</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Grace Period</span><span className="adm-config-val">10 minutes</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">OT Multiplier</span><span className="adm-config-val">1.25x</span></div>
                <div className="adm-config-row" style={{ borderBottom: 'none' }}><span className="adm-config-lbl">Email Notifs</span><span className="adm-config-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} /> Enabled</span></div>
              </div>

              <div className="adm-card" style={{ padding: '16px', marginTop: 20 }}>
                <div className="adm-card-hd" style={{ padding: '0 0 12px', borderBottom: 'none' }}><div className="adm-card-title" style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>Active Sessions</div></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Online now</span><span className="adm-config-val">14 users</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Last backup</span><span className="adm-config-val">Today, 8:00 AM</span></div>
                <div className="adm-config-row" style={{ borderBottom: 'none' }}><span className="adm-config-lbl">DB status</span><span className="adm-config-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} /> Healthy</span></div>
              </div>

              <div className="adm-alert">
                <span className="adm-alert-icon">⚠️</span>
                <div className="adm-alert-text">
                  <strong>Payroll Pending</strong><br />
                  March 2025 payroll has not been released. Review and release before March 31.
                </div>
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
              <option>Payroll</option>
              <option>Users</option>
              <option>Leave</option>
              <option>Settings</option>
              <option>Departments</option>
              <option>System</option>
            </select>
            <input type="date" className="audit-date-input" placeholder="mm/dd/yyyy" />
            <input type="date" className="audit-date-input" placeholder="mm/dd/yyyy" />
          </div>

          <div className="card">
            <div className="audit-table-meta">
              <div className="audit-table-title">System Log</div>
              <div className="audit-table-count">Showing 50 most recent entries</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>TIMESTAMP</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>ACTOR</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>ACTION</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>MODULE</th>
                    <th style={{ fontSize: '.65rem', color: 'var(--ink3)' }}>TARGET</th>
                  </tr>
                </thead>
                <tbody>
                  {mockLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--ink3)', fontSize: '.75rem' }}>{log.timestamp}</td>
                      <td style={{ fontWeight: 500, fontSize: '.78rem' }}>{log.actor}</td>
                      <td style={{ fontSize: '.78rem' }}>{log.action}</td>
                      <td>
                        <span className={`audit-chip audit-chip-${log.module.toLowerCase()}`}>
                          {log.module}
                        </span>
                      </td>
                      <td style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>{log.target}</td>
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
          <div className="card-hd"><div className="card-title">Users & Roles</div></div>
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
          <div className="card-hd"><div className="card-title">Departments</div></div>
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

      {/* System Settings Section */}
      {activeSection === 'settings' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">System Settings</div></div>
          <div className="card-body">
            <div className="form-row fr-2" style={{ marginBottom: 20 }}>
              <div className="form-grp"><label className="form-lbl">Work Start Time</label><input type="time" className="form-ctrl" defaultValue="08:00" /></div>
              <div className="form-grp"><label className="form-lbl">Work End Time</label><input type="time" className="form-ctrl" defaultValue="17:00" /></div>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Grace Period (min)</label><input type="number" className="form-ctrl" defaultValue="10" /></div>
              <div className="form-grp"><label className="form-lbl">OT Multiplier</label><input type="number" step="0.05" className="form-ctrl" defaultValue="1.25" /></div>
            </div>
          </div>
        </div>
      )}

      {/* Operations Placeholder Sections */}
      {['employees', 'leaves', 'payroll'].includes(activeSection) && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
          This section is managed under Admin Operations. Please use the sidebar to navigate to the detailed management pages.
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
    </div>
  )
}
