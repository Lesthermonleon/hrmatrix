import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Employee, LeaveRequest, AttendanceRecord, PayrollRecord, Announcement } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SupProps {
  activeSection: string
  onNavigate: (section: string) => void
}

export function SupervisorDashboard({ activeSection, onNavigate }: SupProps) {
  const { profile } = useAuth()
  const [teamMembers, setTeamMembers] = useState<Employee[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([])
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null)
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord[]>([])
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([])
  const [myPayslips, setMyPayslips] = useState<PayrollRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null)
  const [notes, setNotes] = useState('')
  const [showLogAttendance, setShowLogAttendance] = useState(false)
  const [showFileLeave, setShowFileLeave] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newLeave, setNewLeave] = useState({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
  const [newAttendance, setNewAttendance] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], time_in: '08:00', time_out: '17:00', status: 'present', notes: '' })
  const { showToast } = useToast()

  useEffect(() => { fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)
    // Fetch employees under this supervisor
    const supervisorEmpRes = await supabase.from('employees').select('*').eq('status', 'active')
    if (supervisorEmpRes.error) {
      showToast(`Employees: ${supervisorEmpRes.error.message}`, 'error')
      setLoading(false)
      return
    }
    const allEmps = (supervisorEmpRes.data || []) as Employee[]

    // Find supervisor's own employee record
    let supervisorEmpId: string | null = null
    if (profile) {
      const myEmpRes = await supabase.from('employees').select('id').eq('profile_id', profile.id).single()
      if (myEmpRes.error) {
        // Most common reason: profile exists but not linked to an employee row.
        showToast('Your account is not linked to an employee record yet. Ask admin to set employees.profile_id = your profile id.', 'warn')
      }
      supervisorEmpId = myEmpRes.data?.id || null
    } else {
      setLoading(false)
      return
    }

    const team = supervisorEmpId
      ? allEmps.filter(e => e.supervisor_id === supervisorEmpId)
      : []

    setTeamMembers(team)

    const teamIds = team.map(e => e.id)

    const [leavePendRes, leaveAllRes, attRes] = await Promise.all([
      teamIds.length > 0
        ? supabase.from('leave_requests').select('*, employee:employees!leave_requests_employee_id_fkey(*)').in('employee_id', teamIds).eq('status', 'pending')
        : { data: [] },
      teamIds.length > 0
        ? supabase.from('leave_requests').select('*, employee:employees!leave_requests_employee_id_fkey(*)').in('employee_id', teamIds).order('created_at', { ascending: false })
        : { data: [] },
      teamIds.length > 0
        ? supabase.from('attendance_records').select('*, employee:employees(*)').in('employee_id', teamIds).order('date', { ascending: false }).limit(30)
        : { data: [] },
    ])
    if ((leavePendRes as any).error) showToast(`Team pending leaves: ${(leavePendRes as any).error.message}`, 'error')
    if ((leaveAllRes as any).error) showToast(`Team leaves: ${(leaveAllRes as any).error.message}`, 'error')
    if ((attRes as any).error) showToast(`Team attendance: ${(attRes as any).error.message}`, 'error')
    setPendingLeaves((leavePendRes.data || []) as LeaveRequest[])
    setAllLeaves((leaveAllRes.data || []) as LeaveRequest[])
    setAttendance((attRes.data || []) as AttendanceRecord[])

    // Fetch own data for self-service
    if (supervisorEmpId) {
      const [myAttRes, myLeaveRes, myPayRes] = await Promise.all([
        supabase.from('attendance_records').select('*').eq('employee_id', supervisorEmpId).order('date', { ascending: false }).limit(30),
        supabase.from('leave_requests').select('*').eq('employee_id', supervisorEmpId).order('created_at', { ascending: false }),
        supabase.from('payroll_records').select('*, period:payroll_periods(period_name, pay_date)').eq('employee_id', supervisorEmpId).order('created_at', { ascending: false }),
      ])
      if (myAttRes.error) showToast(`My attendance: ${myAttRes.error.message}`, 'error')
      if (myLeaveRes.error) showToast(`My leaves: ${myLeaveRes.error.message}`, 'error')
      if (myPayRes.error) showToast(`My payslips: ${myPayRes.error.message}`, 'error')
      const myEmpDataRes = await supabase.from('employees').select('*').eq('id', supervisorEmpId).single()
      if (myEmpDataRes.error) showToast(`My employee record: ${myEmpDataRes.error.message}`, 'error')
      setMyEmployee((myEmpDataRes.data as Employee) || null)
      setMyAttendance((myAttRes.data || []) as AttendanceRecord[])
      setMyLeaves((myLeaveRes.data || []) as LeaveRequest[])
      setMyPayslips((myPayRes.data || []) as PayrollRecord[])
    }
    // Fetch announcements for all roles
    const annRes = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
    if (annRes.error) showToast(`Announcements: ${annRes.error.message}`, 'error')
    setAnnouncements((annRes.data || []) as Announcement[])
    setLoading(false)
  }

  async function handleLeaveAction(id: string, action: 'supervisor_approved' | 'rejected') {
    const { error } = await supabase.from('leave_requests').update({
      status: action,
      supervisor_notes: notes,
      supervisor_id: teamMembers[0]?.supervisor_id || null,
    }).eq('id', id)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast(
      action === 'supervisor_approved' ? 'Leave endorsed to HR ✅' : 'Leave rejected',
      action === 'supervisor_approved' ? 'success' : 'error'
    )
    setReviewLeave(null)
    setNotes('')
    fetchAll()
  }

  async function handleLogAttendance() {
    if (!newAttendance.employee_id) { showToast('Please select an employee', 'warn'); return }
    const { error } = await supabase.from('attendance_records').upsert({
      employee_id: newAttendance.employee_id,
      date: newAttendance.date,
      time_in: newAttendance.time_in || null,
      time_out: newAttendance.time_out || null,
      status: newAttendance.status,
      notes: newAttendance.notes || null,
    }, { onConflict: 'employee_id,date' })
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast('Attendance logged', 'success')
    setShowLogAttendance(false)
    fetchAll()
  }

  async function handleFileOwnLeave() {
    if (!myEmployee) { showToast('Your employee record was not found', 'error'); return }
    const startD = new Date(newLeave.start_date)
    const endD = new Date(newLeave.end_date)
    const days = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: myEmployee.id,
      leave_type: newLeave.leave_type,
      start_date: newLeave.start_date,
      end_date: newLeave.end_date,
      days_count: days,
      reason: newLeave.reason,
      status: 'pending',
    })
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast('Leave request filed', 'success')
    setShowFileLeave(false)
    setNewLeave({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
    fetchAll()
  }

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }
  const today = new Date().toISOString().split('T')[0]
  const presentToday = attendance.filter(a => a.date === today && a.status === 'present').length
  const absentToday = attendance.filter(a => a.date === today && a.status === 'absent').length
  const approvedLeaves = allLeaves.filter(l => l.status === 'approved').length

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  return (
    <div className="wrap">
      <div className="ph">
        <div className="ph-sup">Team Management</div>
        <div className="ph-row">
          <div>
            <div className="ph-title">Supervisor Dashboard</div>
            <div className="ph-sub">Monitor your team's attendance, leaves, and performance</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`btn-refresh${loading ? ' spinning' : ''}`}
              onClick={() => fetchAll()}
              disabled={loading}
              title="Refresh data"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
            </button>
            {(activeSection === 'attendance' || activeSection === 'overview' || activeSection === 'team') && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLogAttendance(true)}>📋 Log Attendance</button>
            )}
            {(activeSection === 'leaves' || activeSection === 'overview') && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowFileLeave(true)}>📝 File Leave</button>
            )}
            {activeSection === 'my_leave' && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowFileLeave(true)}>📝 File My Leave</button>
            )}
          </div>
        </div>
      </div>


      {activeSection === 'overview' && (
        <>
          <div className="stat-grid">
            {[
              { label: 'Team Members', value: teamMembers.length, route: 'team' },
              { label: 'Pending Approvals', value: pendingLeaves.length, route: 'leaves' },
              { label: 'Present Today', value: presentToday, route: 'attendance' },
              { label: 'On Leave', value: approvedLeaves, route: 'leaves' },
            ].map(s => (
              <div
                className="stat-tile"
                key={s.label}
                style={{ cursor: 'pointer' }}
                onClick={() => onNavigate(s.route)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onNavigate(s.route) }}
              >
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 20, marginTop: 20 }}>
            <div className="card-hd"><div className="card-title">Team Metrics Overview</div></div>
            <div style={{ height: 250, padding: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Team Members', value: teamMembers.length, fill: '#64748b' },
                  { name: 'Pending Leaves', value: pendingLeaves.length, fill: '#f59e0b' },
                  { name: 'Present Today', value: presentToday, fill: '#10b981' },
                  { name: 'On Leave', value: approvedLeaves, fill: '#3b82f6' }
                ]} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel-grid">
            <div className="card">
              <div className="card-hd">
                <div><div className="card-title">Pending Leave Approvals</div><span className="sb-badge" style={{ marginLeft: 8 }}>{pendingLeaves.length}</span></div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Action</th></tr></thead>
                  <tbody>
                    {pendingLeaves.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No pending requests</td></tr>}
                    {pendingLeaves.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500 }}>{l.employee?.full_name}</td>
                        <td><span className="badge badge-purple">{l.leave_type}</span></td>
                        <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{l.start_date} – {l.end_date}</td>
                        <td><button className="btn btn-ghost btn-xs" onClick={() => setReviewLeave(l)}>Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="card-title">Team Quick View</div></div>
              <div style={{ padding: '8px 0' }}>
                {teamMembers.length === 0 && <div style={{ padding: '16px 18px', color: 'var(--ink3)', fontSize: '.82rem' }}>No team members assigned yet.</div>}
                {teamMembers.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-lt)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>
                      {e.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 500 }}>{e.full_name}</div>
                      <div style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{e.position}</div>
                    </div>
                    <span className={`badge ${e.status === 'active' ? 'badge-ok' : 'badge-warn'}`}>{e.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeSection === 'team' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">Team Members ({teamMembers.length})</div></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Email</th><th>Status</th></tr></thead>
              <tbody>
                {teamMembers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No team members. Employees need to be assigned to you as supervisor.</td></tr>}
                {teamMembers.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{e.full_name}</td>
                    <td>{e.position}</td>
                    <td>{e.department}</td>
                    <td style={{ color: 'var(--ink3)' }}>{e.email}</td>
                    <td><span className={`badge ${e.status === 'active' ? 'badge-ok' : 'badge-warn'}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'leaves' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">Team Leave Requests</div></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {allLeaves.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No leave requests</td></tr>}
                {allLeaves.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.employee?.full_name}</td>
                    <td><span className="badge badge-purple">{l.leave_type}</span></td>
                    <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{l.start_date} – {l.end_date}</td>
                    <td>{l.days_count}d</td>
                    <td>{leaveBadge(l.status)}</td>
                    <td>{l.status === 'pending' && <button className="btn btn-ghost btn-xs" onClick={() => setReviewLeave(l)}>Review</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'attendance' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">Attendance Log</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLogAttendance(true)}>+ Log</button>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No attendance records</td></tr>}
                {attendance.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.employee?.full_name}</td>
                    <td>{a.date}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_in || '—'}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_out || '—'}</td>
                    <td><span className={`badge ${a.status === 'present' ? 'badge-ok' : a.status === 'absent' ? 'badge-danger' : 'badge-warn'}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Leave Modal */}
      <div className={`modal-ov${reviewLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setReviewLeave(null) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Review Leave Request</div><div className="modal-sub">{reviewLeave?.employee?.full_name} — Supervisor Gate</div></div>
            <button className="modal-x" onClick={() => setReviewLeave(null)}>✕</button>
          </div>
          {reviewLeave && (
            <div className="modal-body">
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '.82rem' }}>
                <div><strong>Type:</strong> <span className="badge badge-purple" style={{ marginLeft: 4 }}>{reviewLeave.leave_type}</span></div>
                <div style={{ marginTop: 4 }}><strong>Dates:</strong> {reviewLeave.start_date} – {reviewLeave.end_date} ({reviewLeave.days_count} days)</div>
                <div style={{ marginTop: 4 }}><strong>Reason:</strong> {reviewLeave.reason}</div>
              </div>
              <div className="form-grp">
                <label className="form-lbl">Supervisor Notes</label>
                <textarea className="form-ctrl" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes before endorsing to HR…" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-danger btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'rejected')}>Reject</button>
                <button className="btn btn-ok btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'supervisor_approved')}>Endorse to HR</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Attendance Modal */}
      <div className={`modal-ov${showLogAttendance ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowLogAttendance(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Log Attendance</div></div>
            <button className="modal-x" onClick={() => setShowLogAttendance(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Employee</label>
              <select className="form-ctrl" value={newAttendance.employee_id} onChange={e => setNewAttendance(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select…</option>
                {teamMembers.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Date</label><input className="form-ctrl" type="date" value={newAttendance.date} onChange={e => setNewAttendance(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Status</label>
                <select className="form-ctrl" value={newAttendance.status} onChange={e => setNewAttendance(p => ({ ...p, status: e.target.value }))}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                </select>
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Time In</label><input className="form-ctrl" type="time" value={newAttendance.time_in} onChange={e => setNewAttendance(p => ({ ...p, time_in: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Time Out</label><input className="form-ctrl" type="time" value={newAttendance.time_out} onChange={e => setNewAttendance(p => ({ ...p, time_out: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Notes</label><input className="form-ctrl" value={newAttendance.notes} onChange={e => setNewAttendance(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleLogAttendance}>Save Record</button>
          </div>
        </div>
      </div>

      {/* My Info / Self-Service Section */}
      {activeSection === 'my_attendance' ? (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          {myEmployee ? (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-hd"><div className="card-title">My Profile</div></div>
                <div className="card-body" style={{ padding: 20 }}>
                  <div className="form-row fr-2" style={{ gap: 24 }}>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Full Name</div>
                      <div style={{ fontWeight: 500 }}>{myEmployee.full_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Employee ID</div>
                      <div style={{ fontWeight: 500 }}>{myEmployee.employee_id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Department</div>
                      <div>{myEmployee.department}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Position</div>
                      <div>{myEmployee.position}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-hd">
                  <div><div className="card-title">My Attendance</div><span className="card-sub">{myAttendance.length} records</span></div>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Status</th></tr></thead>
                    <tbody>
                      {myAttendance.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No attendance records</td></tr>}
                      {myAttendance.map(a => (
                        <tr key={a.id}>
                          <td>{a.date}</td>
                          <td style={{ color: 'var(--ink3)' }}>{a.time_in || '—'}</td>
                          <td style={{ color: 'var(--ink3)' }}>{a.time_out || '—'}</td>
                          <td><span className={`badge ${a.status === 'present' ? 'badge-ok' : a.status === 'absent' ? 'badge-danger' : 'badge-warn'}`}>{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-hd"><div className="card-title">My Payslips</div></div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Period</th><th>Pay Date</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
                    <tbody>
                      {myPayslips.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No payslips available</td></tr>}
                      {myPayslips.map(p => {
                        const ded = Number(p.sss_contribution) + Number(p.philhealth_contribution) + Number(p.pagibig_contribution) + Number(p.withholding_tax) + Number(p.other_deductions)
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{(p.period as any)?.period_name || '—'}</td>
                            <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{(p.period as any)?.pay_date || '—'}</td>
                            <td>₱{Number(p.gross_pay).toLocaleString()}</td>
                            <td style={{ color: 'var(--danger)' }}>₱{ded.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontWeight: 600, color: 'var(--ok)' }}>₱{Number(p.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                            <td><span className={`badge ${p.status === 'paid' ? 'badge-ok' : 'badge-warn'}`}>{p.status}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
              Your employee record was not found. Please contact an administrator to link your profile.
            </div>
          )}
        </div>
      ) : activeSection === 'my_leave' ? (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          {myEmployee ? (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-hd"><div className="card-title">My Profile</div></div>
                <div className="card-body" style={{ padding: 20 }}>
                  <div className="form-row fr-2" style={{ gap: 24 }}>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Full Name</div>
                      <div style={{ fontWeight: 500 }}>{myEmployee.full_name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Employee ID</div>
                      <div style={{ fontWeight: 500 }}>{myEmployee.employee_id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Department</div>
                      <div>{myEmployee.department}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Position</div>
                      <div>{myEmployee.position}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-hd">
                  <div><div className="card-title">My Leave Requests</div><span className="card-sub">{myLeaves.length} requests</span></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowFileLeave(true)}>+ File My Leave</button>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Reason</th></tr></thead>
                    <tbody>
                      {myLeaves.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No leave requests filed</td></tr>}
                      {myLeaves.map(l => (
                        <tr key={l.id}>
                          <td><span className="badge badge-purple">{l.leave_type}</span></td>
                          <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{l.start_date} – {l.end_date}</td>
                          <td>{l.days_count}d</td>
                          <td>{leaveBadge(l.status)}</td>
                          <td style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>{l.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-hd"><div className="card-title">My Payslips</div></div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Period</th><th>Pay Date</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
                    <tbody>
                      {myPayslips.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No payslips available</td></tr>}
                      {myPayslips.map(p => {
                        const ded = Number(p.sss_contribution) + Number(p.philhealth_contribution) + Number(p.pagibig_contribution) + Number(p.withholding_tax) + Number(p.other_deductions)
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{(p.period as any)?.period_name || '—'}</td>
                            <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{(p.period as any)?.pay_date || '—'}</td>
                            <td>₱{Number(p.gross_pay).toLocaleString()}</td>
                            <td style={{ color: 'var(--danger)' }}>₱{ded.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontWeight: 600, color: 'var(--ok)' }}>₱{Number(p.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                            <td><span className={`badge ${p.status === 'paid' ? 'badge-ok' : 'badge-warn'}`}>{p.status}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
              Your employee record was not found. Please contact an administrator to link your profile.
            </div>
          )}
        </div>
      ) : null}

      {/* Notifications Section */}
      {activeSection === 'notifications' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">🔔 Notifications & Announcements</div></div>
          <div style={{ padding: '0' }}>
            {announcements.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: '.82rem' }}>
                No announcements at this time.
              </div>
            )}
            {announcements.map(a => (
              <div key={a.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-lt)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', flexShrink: 0 }}>📢</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--ink3)', lineHeight: 1.5 }}>{a.body}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--ink3)', marginTop: 6 }}>{new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Own Leave Modal */}
      <div className={`modal-ov${showFileLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowFileLeave(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">File Leave Request</div><div className="modal-sub">For your own leave</div></div>
            <button className="modal-x" onClick={() => setShowFileLeave(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Leave Type</label>
              <select className="form-ctrl" value={newLeave.leave_type} onChange={e => setNewLeave(p => ({ ...p, leave_type: e.target.value }))}>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="emergency">Emergency</option>
                <option value="maternity">Maternity</option>
                <option value="paternity">Paternity</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date</label><input className="form-ctrl" type="date" value={newLeave.start_date} onChange={e => setNewLeave(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date</label><input className="form-ctrl" type="date" value={newLeave.end_date} onChange={e => setNewLeave(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Reason</label><textarea className="form-ctrl" rows={3} value={newLeave.reason} onChange={e => setNewLeave(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for leave…" /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleFileOwnLeave}>Submit Request</button>
          </div>
        </div>
      </div>
    </div>
  )
}