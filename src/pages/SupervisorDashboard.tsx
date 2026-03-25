import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Employee, LeaveRequest, AttendanceRecord } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'

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
  const [loading, setLoading] = useState(true)
  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null)
  const [notes, setNotes] = useState('')
  const [showLogAttendance, setShowLogAttendance] = useState(false)
  const [newAttendance, setNewAttendance] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], time_in: '08:00', time_out: '17:00', status: 'present', notes: '' })
  const { showToast } = useToast()

  useEffect(() => { fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)
    // Fetch employees under this supervisor
    const supervisorEmpRes = await supabase.from('employees').select('*').eq('status', 'active')
    const allEmps = (supervisorEmpRes.data || []) as Employee[]

    // Find supervisor's own employee record
    let supervisorEmpId: string | null = null
    if (profile) {
      const myEmpRes = await supabase.from('employees').select('id').eq('profile_id', profile.id).single()
      supervisorEmpId = myEmpRes.data?.id || null
    }

    const team = supervisorEmpId
      ? allEmps.filter(e => e.supervisor_id === supervisorEmpId)
      : allEmps.slice(0, 10) // fallback: show some employees

    setTeamMembers(team)

    const teamIds = team.map(e => e.id)

    const [leavePendRes, leaveAllRes, attRes] = await Promise.all([
      teamIds.length > 0
        ? supabase.from('leave_requests').select('*, employee:employees(*)').in('employee_id', teamIds).eq('status', 'pending')
        : { data: [] },
      teamIds.length > 0
        ? supabase.from('leave_requests').select('*, employee:employees(*)').in('employee_id', teamIds).order('created_at', { ascending: false })
        : { data: [] },
      teamIds.length > 0
        ? supabase.from('attendance_records').select('*, employee:employees(*)').in('employee_id', teamIds).order('date', { ascending: false }).limit(30)
        : { data: [] },
    ])
    setPendingLeaves((leavePendRes.data || []) as LeaveRequest[])
    setAllLeaves((leaveAllRes.data || []) as LeaveRequest[])
    setAttendance((attRes.data || []) as AttendanceRecord[])
    setLoading(false)
  }

  async function handleLeaveAction(id: string, action: 'supervisor_approved' | 'rejected') {
    const { error } = await supabase.from('leave_requests').update({
      status: action,
      supervisor_notes: notes,
      supervisor_id: teamMembers[0]?.supervisor_id || null,
    }).eq('id', id)
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast(action === 'supervisor_approved' ? 'Leave endorsed to HR ✅' : 'Leave rejected', action === 'supervisor_approved' ? '✅' : '❌')
    setReviewLeave(null)
    setNotes('')
    fetchAll()
  }

  async function handleLogAttendance() {
    const { error } = await supabase.from('attendance_records').upsert({
      employee_id: newAttendance.employee_id,
      date: newAttendance.date,
      time_in: newAttendance.time_in || null,
      time_out: newAttendance.time_out || null,
      status: newAttendance.status,
      notes: newAttendance.notes || null,
    }, { onConflict: 'employee_id,date' })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Attendance logged', '✅')
    setShowLogAttendance(false)
    fetchAll()
  }

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLogAttendance(true)}>📋 Log Attendance</button>
          </div>
        </div>
      </div>


      {activeSection === 'overview' && (
        <>
          <div className="stat-grid">
            {[
              { label: 'Team Members', value: teamMembers.length },
              { label: 'Pending Approvals', value: pendingLeaves.length },
              { label: 'Present Today', value: attendance.filter(a => a.date === new Date().toISOString().split('T')[0] && a.status === 'present').length },
              { label: 'On Leave', value: allLeaves.filter(l => l.status === 'approved').length },
            ].map(s => (
              <div className="stat-tile" key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
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
    </div>
  )
}
