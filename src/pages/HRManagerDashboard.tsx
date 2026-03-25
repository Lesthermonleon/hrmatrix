import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee, LeaveRequest, AttendanceRecord } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'

interface HRProps {
  activeSection: string
  onNavigate: (section: string) => void
}

export function HRManagerDashboard({ activeSection, onNavigate }: HRProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddLeave, setShowAddLeave] = useState(false)
  const [showEditEmp, setShowEditEmp] = useState<Employee | null>(null)
  const [hrNotes, setHrNotes] = useState('')
  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null)
  const [newLeave, setNewLeave] = useState({ employee_id: '', leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
  const { showToast } = useToast()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [empRes, leaveRes, attRes] = await Promise.all([
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('leave_requests').select('*, employee:employees(*)').order('created_at', { ascending: false }),
      supabase.from('attendance_records').select('*, employee:employees(*)').order('date', { ascending: false }).limit(50),
    ])
    setEmployees((empRes.data || []) as Employee[])
    setLeaveRequests((leaveRes.data || []) as LeaveRequest[])
    setAttendance((attRes.data || []) as AttendanceRecord[])
    setLoading(false)
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

  async function handleUpdateEmployee() {
    if (!showEditEmp) return
    const { error } = await supabase.from('employees').update({
      full_name: showEditEmp.full_name,
      department: showEditEmp.department,
      position: showEditEmp.position,
      status: showEditEmp.status,
      basic_salary: showEditEmp.basic_salary,
    }).eq('id', showEditEmp.id)
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Employee updated', '✅')
    setShowEditEmp(null)
    fetchAll()
  }

  async function handleAddLeave() {
    const start = new Date(newLeave.start_date)
    const end = new Date(newLeave.end_date)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const { error } = await supabase.from('leave_requests').insert({
      ...newLeave,
      days_count: days,
      status: 'pending',
    })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Leave request created', '✅')
    setShowAddLeave(false)
    setNewLeave({ employee_id: '', leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
    fetchAll()
  }

  const pending = leaveRequests.filter(l => l.status === 'pending' || l.status === 'supervisor_approved')
  const approved = leaveRequests.filter(l => l.status === 'approved' || l.status === 'hr_approved')
  const activeEmps = employees.filter(e => e.status === 'active')

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-ok', inactive: 'badge-danger', on_leave: 'badge-warn' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  return (
    <div className="wrap">
      <div className="ph">
        <div className="ph-sup">Human Resources</div>
        <div className="ph-row">
          <div>
            <div className="ph-title">HR Manager Dashboard</div>
            <div className="ph-sub">Manage employees, leaves, and attendance</div>
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
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLeave(true)}>📅 New Leave</button>
          </div>
        </div>
      </div>


      {activeSection === 'overview' && (
        <>
          <div className="stat-grid">
            {[
              { label: 'Total Employees', value: employees.length },
              { label: 'Active', value: activeEmps.length },
              { label: 'Pending Leaves', value: pending.length },
              { label: 'Approved Leaves', value: approved.length },
            ].map(s => (
              <div className="stat-tile" key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="panel-grid">
            <div className="card">
              <div className="card-hd"><div className="card-title">Pending Leave Requests</div></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Employee</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {pending.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No pending requests</td></tr>}
                    {pending.slice(0, 8).map(l => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500 }}>{l.employee?.full_name || '—'}</td>
                        <td><span className="badge badge-purple">{l.leave_type}</span></td>
                        <td>{leaveBadge(l.status)}</td>
                        <td><button className="btn btn-ghost btn-xs" onClick={() => setReviewLeave(l)}>Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><div className="card-title">Recent Attendance</div></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Employee</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendance.slice(0, 8).map(a => (
                      <tr key={a.id}>
                        <td>{a.employee?.full_name || '—'}</td>
                        <td style={{ color: 'var(--ink3)' }}>{a.date}</td>
                        <td><span className={`badge ${a.status === 'present' ? 'badge-ok' : a.status === 'absent' ? 'badge-danger' : 'badge-warn'}`}>{a.status}</span></td>
                      </tr>
                    ))}
                    {attendance.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No records</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {activeSection === 'employees' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Employees</div><div className="card-sub">{employees.length} records</div></div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Dept</th><th>Position</th><th>Salary</th><th>Status</th><th>Edit</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td><div style={{ fontWeight: 500 }}>{e.full_name}</div><div style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{e.email}</div></td>
                    <td>{e.department}</td>
                    <td>{e.position}</td>
                    <td>₱{Number(e.basic_salary).toLocaleString()}</td>
                    <td>{statusBadge(e.status)}</td>
                    <td><button className="btn btn-ghost btn-xs" onClick={() => setShowEditEmp({ ...e })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'leaves' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Leave Requests</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLeave(true)}>+ New</button>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {leaveRequests.map(l => (
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
                {leaveRequests.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No leave requests yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'attendance' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">Attendance Log</div></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.employee?.full_name || '—'}</td>
                    <td>{a.date}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_in || '—'}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_out || '—'}</td>
                    <td><span className={`badge ${a.status === 'present' ? 'badge-ok' : a.status === 'absent' ? 'badge-danger' : 'badge-warn'}`}>{a.status}</span></td>
                  </tr>
                ))}
                {attendance.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No attendance records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                {reviewLeave.supervisor_notes && <div><strong>Supervisor Notes:</strong> {reviewLeave.supervisor_notes}</div>}
              </div>
              <div className="form-grp">
                <label className="form-lbl">HR Notes</label>
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

      {/* Edit Employee Modal */}
      <div className={`modal-ov${showEditEmp ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowEditEmp(null) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Edit Employee</div></div>
            <button className="modal-x" onClick={() => setShowEditEmp(null)}>✕</button>
          </div>
          {showEditEmp && (
            <div className="modal-body">
              <div className="form-grp"><label className="form-lbl">Full Name</label><input className="form-ctrl" value={showEditEmp.full_name} onChange={e => setShowEditEmp(p => p ? { ...p, full_name: e.target.value } : p)} /></div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Department</label><input className="form-ctrl" value={showEditEmp.department} onChange={e => setShowEditEmp(p => p ? { ...p, department: e.target.value } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Position</label><input className="form-ctrl" value={showEditEmp.position} onChange={e => setShowEditEmp(p => p ? { ...p, position: e.target.value } : p)} /></div>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Basic Salary</label><input className="form-ctrl" type="number" value={showEditEmp.basic_salary} onChange={e => setShowEditEmp(p => p ? { ...p, basic_salary: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Status</label>
                  <select className="form-ctrl" value={showEditEmp.status} onChange={e => setShowEditEmp(p => p ? { ...p, status: e.target.value as Employee['status'] } : p)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={handleUpdateEmployee}>Save Changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Add Leave Modal */}
      <div className={`modal-ov${showAddLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddLeave(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">New Leave Request</div></div>
            <button className="modal-x" onClick={() => setShowAddLeave(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Employee</label>
              <select className="form-ctrl" value={newLeave.employee_id} onChange={e => setNewLeave(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="form-grp"><label className="form-lbl">Leave Type</label>
              <select className="form-ctrl" value={newLeave.leave_type} onChange={e => setNewLeave(p => ({ ...p, leave_type: e.target.value }))}>
                {['vacation','sick','emergency','maternity','paternity','other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date</label><input className="form-ctrl" type="date" value={newLeave.start_date} onChange={e => setNewLeave(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date</label><input className="form-ctrl" type="date" value={newLeave.end_date} onChange={e => setNewLeave(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Reason</label><textarea className="form-ctrl" rows={3} value={newLeave.reason} onChange={e => setNewLeave(p => ({ ...p, reason: e.target.value }))} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAddLeave}>Submit Request</button>
          </div>
        </div>
      </div>
    </div>
  )
}
