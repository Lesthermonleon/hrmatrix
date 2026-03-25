import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Employee, LeaveRequest, AttendanceRecord, PayrollRecord } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'

interface EmpProps {
  activeSection: string
  onNavigate: (section: string) => void
}

export function EmployeeDashboard({ activeSection, onNavigate }: EmpProps) {
  const { profile } = useAuth()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [payslips, setPayslips] = useState<(PayrollRecord & { period?: { period_name: string; pay_date: string } })[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showApplyLeave, setShowApplyLeave] = useState(false)
  const [newLeave, setNewLeave] = useState({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
  const { showToast } = useToast()
 
  const initials = employee?.full_name
    ? employee.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '??'

  useEffect(() => {
    if (profile) {
      fetchAll()
      
      // Subscribe to real-time changes
      const channel = supabase
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_records' }, () => fetchAll())
        .subscribe()

      const timer = setInterval(() => setCurrentTime(new Date()), 1000)
      return () => {
        clearInterval(timer)
        supabase.removeChannel(channel)
      }
    }
  }, [profile])

  async function fetchAll() {
    setLoading(true)
    // Find employee record by profile_id
    const { data: empData } = await supabase.from('employees').select('*').eq('profile_id', profile!.id).single()
    const emp = empData as Employee | null
    setEmployee(emp)

    if (emp) {
      const [leavesRes, attRes, payRes] = await Promise.all([
        supabase.from('leave_requests').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false }),
        supabase.from('attendance_records').select('*').eq('employee_id', emp.id).order('date', { ascending: false }).limit(30),
        supabase.from('payroll_records').select('*, period:payroll_periods(period_name, pay_date)').eq('employee_id', emp.id).order('created_at', { ascending: false }),
      ])
      setLeaves((leavesRes.data || []) as LeaveRequest[])
      setAttendance((attRes.data || []) as AttendanceRecord[])
      setPayslips((payRes.data || []) as (PayrollRecord & { period?: { period_name: string; pay_date: string } })[])
    }
    setLoading(false)
  }

  async function handleApplyLeave() {
    if (!employee) return
    const start = new Date(newLeave.start_date)
    const end = new Date(newLeave.end_date)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employee.id,
      leave_type: newLeave.leave_type,
      start_date: newLeave.start_date,
      end_date: newLeave.end_date,
      days_count: days,
      reason: newLeave.reason,
      status: 'pending',
    })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Leave request submitted', '✅')
    setShowApplyLeave(false)
    setNewLeave({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
    fetchAll()
  }

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  const monthName = currentTime.toLocaleString('default', { month: 'long' })
  const year = currentTime.getFullYear()
  const dateString = currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeString = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })

  // Find latest paid/approved payslip
  const latestPayslip = payslips.find(p => p.status === 'paid' || p.status === 'approved')

  // Calendar logic (Current Month)
  const firstDay = new Date(year, currentTime.getMonth(), 1).getDay()
  const daysInMonth = new Date(year, currentTime.getMonth() + 1, 0).getDate()
  const calendarCells = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1
    return (day > 0 && day <= daysInMonth) ? day : null
  })

  // Mock leave balance data for progress bars (In a real app, these would come from Supabase)
  const leaveBalances = [
    { label: 'Vacation Leave', current: 8, total: 15, color: 'var(--teal)' },
    { label: 'Sick Leave', current: 13, total: 15, color: '#0ea5e9' },
    { label: 'Emergency Leave', current: 3, total: 3, color: 'var(--warn)' },
    { label: 'Special Leave', current: 5, total: 5, color: 'var(--purple)' },
  ]

  const presentDays = attendance.filter(a => a.status === 'present').length
  const absentDays = attendance.filter(a => a.status === 'absent').length
  const approvedLeaves = leaves.filter(l => l.status === 'approved').length
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  if (!employee) {
    return (
      <div className="wrap">
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: 8 }}>No Employee Record Found</div>
          <div style={{ color: 'var(--ink3)', fontSize: '.82rem' }}>Your profile hasn't been linked to an employee record yet. Please contact your HR manager.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      {activeSection === 'dashboard' && (
        <>
          <div className="ph" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 16 }}>
            <div className="ph-sup">TODAY IS {dateString.toUpperCase()}</div>
            <div className="ph-row">
              <div>
                <div className="ph-title" style={{ fontSize: '1.8rem', fontWeight: 700 }}>Good morning, {employee.full_name.split(' ')[0]} 👋</div>
                <div className="ph-sub" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>🕒 {timeString}</span>
                  <span style={{ opacity: .5 }}>·</span>
                  <span>{employee.department}</span>
                </div>
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
                <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={() => setShowApplyLeave(true)}>+ File Leave</button>
              </div>
            </div>
          </div>

          {latestPayslip && (
            <div className="db-banner">
              <span className="db-banner-icon">✅</span>
              <div>
                {monthName} {year} payslip is ready. Your net pay of <strong>₱{Number(latestPayslip.net_pay).toLocaleString()}</strong> has been released. 
                <button className="btn btn-link db-banner-link" onClick={() => onNavigate('payslips')}>View payslip →</button>
              </div>
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            {[
              { label: 'DAYS WORKED', value: presentDays, sub: `${monthName} ${year}` },
              { label: 'LEAVE BALANCE', value: '8', sub: 'Vacation days left' },
              { label: 'PENDING LEAVE', value: pendingLeaves, sub: 'Awaiting approval' },
              { label: 'NET PAY (MAY)', value: latestPayslip ? `₱${Number(latestPayslip.net_pay).toLocaleString()}` : '—', sub: latestPayslip ? `Released ${latestPayslip.period?.pay_date}` : 'Not released' },
            ].map(s => (
              <div className="stat-tile" key={s.label} style={{ padding: '16px 20px' }}>
                <div className="stat-label" style={{ fontSize: '.62rem', letterSpacing: '.08em' }}>{s.label}</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', margin: '4px 0' }}>{s.value}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="db-grid">
            <div className="db-main">
              <div className="card cal-card" style={{ marginBottom: 24 }}>
                <div className="cal-hd">
                  <div className="cal-title">{monthName} {year} — Attendance</div>
                  <div className="cal-legend">
                    <div className="cal-leg-item"><div className="cal-dot status-present" /> Present</div>
                    <div className="cal-leg-item"><div className="cal-dot status-late" /> Late</div>
                    <div className="cal-leg-item"><div className="cal-dot status-absent" /> Absent</div>
                    <div className="cal-leg-item"><div className="cal-dot status-leave" /> Leave</div>
                  </div>
                </div>
                <div className="cal-grid">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="cal-day-label">{d}</div>)}
                  {calendarCells.map((day, i) => {
                    if (day === null) return <div key={i} className="cal-cell" style={{ opacity: 0.3 }} />
                    const isToday = day === currentTime.getDate()
                    const dateVal = `${year}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const att = attendance.find(a => a.date === dateVal)
                    return (
                      <div key={i} className={`cal-cell${isToday ? ' today' : ''}`}>
                        {day}
                        {att && (
                          <>
                            <div className={`cal-status status-${att.status}`} />
                            <div className={`cal-status-indicator status-${att.status}`} />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-hd">
                  <div className="card-title">Recent Leave Requests</div>
                  <button className="btn btn-ghost btn-xs" onClick={() => onNavigate('leaves')}>View All</button>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>TYPE</th><th>DATE RANGE</th><th>DAYS</th><th>FILED</th><th>STATUS</th></tr></thead>
                    <tbody>
                      {leaves.slice(0, 5).map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 500 }}>{l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave</td>
                          <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{l.start_date} – {l.end_date}</td>
                          <td>{l.days_count} day{l.days_count > 1 ? 's' : ''}</td>
                          <td style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                          <td>{leaveBadge(l.status)}</td>
                        </tr>
                      ))}
                      {leaves.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 16 }}>No leave requests</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="db-side">
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-hd"><div className="card-title">Leave Balances — {year}</div></div>
                <div className="card-body">
                  <div className="lp-grp">
                    {leaveBalances.map(b => (
                      <div className="lp-item" key={b.label}>
                        <div className="lp-hd">
                          <span className="lp-label">{b.label}</span>
                          <span className="lp-val">{b.current} / {b.total} days left</span>
                        </div>
                        <div className="lp-bar-bg">
                          <div className="lp-bar-fill" style={{ width: `${(b.current / b.total) * 100}%`, backgroundColor: b.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-hd"><div className="card-title">Quick Info</div></div>
                <div className="card-body">
                  <div className="qi-list">
                    <div className="qi-row"><span className="qi-lbl">Employee ID</span><span className="qi-val">{employee.employee_id}</span></div>
                    <div className="qi-row"><span className="qi-lbl">Department</span><span className="qi-val">{employee.department}</span></div>
                    <div className="qi-row"><span className="qi-lbl">Supervisor</span><span className="qi-val">Lorna Cruz</span></div>
                    <div className="qi-row"><span className="qi-lbl">Schedule</span><span className="qi-val">Mon–Fri, 8AM–5PM</span></div>
                    <div className="qi-row"><span className="qi-lbl">Pay Period</span><span className="qi-val">Monthly</span></div>
                  </div>
                </div>
                <div className="card-ft" style={{ borderTop: '1px solid var(--line)', background: 'none' }}>
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: '.75rem', gap: 6 }} onClick={() => setShowApplyLeave(true)}>
                    📝 File a Leave Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeSection === 'leaves' && (
        <div className="leave-container">
          <div className="leave-header">
            <div>
              <div className="prof-breadcrumb">My Portal / <strong>Leave Requests</strong></div>
              <div className="prof-title">Leave Requests</div>
              <div className="prof-subtitle">Submit and track your leave applications.</div>
            </div>
            <button className="btn btn-outline btn-sm btn-purple" onClick={() => setShowApplyLeave(true)}>+ File Leave</button>
          </div>

          <div className="leave-grid">
            <div className="leave-main">
              <div className="leave-card">
                <div className="leave-card-hd">
                  <div className="leave-card-title">Leave History</div>
                  <select className="leave-filter">
                    <option>All Types</option>
                  </select>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>TYPE</th>
                        <th>DATE RANGE</th>
                        <th>DAYS</th>
                        <th>FILED</th>
                        <th>REMARKS</th>
                        <th style={{ textAlign: 'right' }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 500 }}>{l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave</td>
                          <td style={{ fontSize: '.75rem', color: 'var(--ink)' }}>{l.start_date} – {l.end_date}</td>
                          <td>{l.days_count} day{l.days_count > 1 ? 's' : ''}</td>
                          <td style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                          <td style={{ fontSize: '.72rem', color: 'var(--ink3)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`leave-chip leave-chip-${l.status.replace('supervisor_', '').replace('hr_', '')}`}>
                              {l.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {leaves.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No history found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="leave-side">
              <div className="leave-card">
                <div className="leave-card-hd"><div className="leave-card-title">Leave Balances — {year}</div></div>
                <div className="lp-grp">
                  {leaveBalances.map(b => (
                    <div className="lp-item" key={b.label}>
                      <div className="lp-hd" style={{ marginBottom: 4 }}>
                        <span className="lp-label" style={{ fontSize: '.7rem' }}>{b.label}</span>
                        <span className="lp-val" style={{ fontSize: '.7rem' }}>{b.current} / {b.total}</span>
                      </div>
                      <div className="lp-bar-bg" style={{ height: 6 }}>
                        <div className="lp-bar-fill" style={{ width: `${(b.current / b.total) * 100}%`, backgroundColor: b.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn-lavender" style={{ width: '100%', padding: '12px', fontSize: '.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => setShowApplyLeave(true)}>
                📄 File New Leave Request
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'attendance' && (
        <div className="att-container">
          <div className="att-header">
            <div>
              <div className="prof-breadcrumb">My Portal / <strong>Attendance</strong></div>
              <div className="prof-title">My Attendance</div>
              <div className="prof-subtitle">Daily time-in / time-out logs and monthly summary</div>
            </div>
            <select className="att-month-select">
              <option>{monthName} {year}</option>
            </select>
          </div>

          <div className="att-summary">
            <div className="att-stat-tile">
              <div className="att-stat-lbl">Days Present</div>
              <div className="att-stat-val">{presentDays}</div>
              <div className="att-stat-sub">Out of {daysInMonth} working days</div>
            </div>
            <div className="att-stat-tile" style={{ borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>
              <div className="att-stat-lbl">Absences</div>
              <div className="att-stat-val">{absentDays}</div>
              <div className="att-stat-sub">{absentDays === 0 ? 'No absences' : `${absentDays} day(s) absent`}</div>
            </div>
            <div className="att-stat-tile">
              <div className="att-stat-lbl">Late / Undertime</div>
              <div className="att-stat-val">1</div>
              <div className="att-stat-sub">May 8 — 14 mins late</div>
            </div>
          </div>

          <div className="att-cal-card">
            <div className="att-cal-hd">
              <div className="att-cal-title">{monthName} {year}</div>
              <div className="att-cal-legend">
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#10b981' }} /> On Time</div>
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#f59e0b' }} /> Late</div>
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#8b5cf6' }} /> Leave</div>
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: 'var(--line)' }} /> Rest Day</div>
              </div>
            </div>
            <div className="att-cal-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="att-cal-day-lbl">{d}</div>)}
              {calendarCells.map((day, i) => {
                const dateVal = day ? `${year}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null
                const att = dateVal ? attendance.find(a => a.date === dateVal) : null
                const isLeave = dateVal ? leaves.find(l => l.status === 'approved' && dateVal >= l.start_date && dateVal <= l.end_date) : null
                const isToday = day === currentTime.getDate()
                
                let cellClass = 'att-cal-cell'
                if (isToday && !att?.time_out) cellClass += ' in-progress'
                else if (isLeave) cellClass += ' leave'
                else if (att?.status === 'present') {
                  const hour = parseInt(att.time_in?.split(':')[0] || '0')
                  const min = parseInt(att.time_in?.split(':')[1] || '0')
                  if (hour > 8 || (hour === 8 && min > 0)) cellClass += ' late'
                  else cellClass += ' present'
                }

                return (
                  <div key={i} className={cellClass}>
                    {day}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="att-table-card">
            <div className="att-table-title">Daily Time Records — {monthName} {year}</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TIME IN</th>
                    <th>TIME OUT</th>
                    <th>HOURS</th>
                    <th style={{ textAlign: 'right' }}>REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map(a => {
                    const isToday = a.date === currentTime.toISOString().split('T')[0]
                    const inTime = a.time_in ? new Date(`2000-01-01T${a.time_in}`) : null
                    const outTime = a.time_out ? new Date(`2000-01-01T${a.time_out}`) : null
                    let diffHrs = 0; let diffMins = 0
                    if (inTime && outTime) {
                      const diff = outTime.getTime() - inTime.getTime()
                      diffHrs = Math.floor(diff / (1000 * 60 * 60))
                      diffMins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                    }
                    
                    const isLate = inTime && (inTime.getHours() > 8 || (inTime.getHours() === 8 && inTime.getMinutes() > 0))
                    const lateMins = isLate ? (inTime.getHours() - 8) * 60 + inTime.getMinutes() : 0
                    const isLeave = leaves.find(l => l.status === 'approved' && a.date >= l.start_date && a.date <= l.end_date)

                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500 }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td style={{ color: 'var(--ink)' }}>{a.time_in || '—'}</td>
                        <td style={{ color: 'var(--ink)' }}>{a.time_out || '—'}</td>
                        <td style={{ color: 'var(--ink3)' }}>{diffHrs > 0 || diffMins > 0 ? `${diffHrs}h ${String(diffMins).padStart(2,'0')}m` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {isLeave ? <span className="att-chip att-chip-leave">ON LEAVE</span> :
                           isToday && !a.time_out ? <span className="att-chip att-chip-progress">IN PROGRESS</span> :
                           a.status === 'absent' ? <span className="att-chip att-chip-absent">ABSENT</span> :
                           isLate ? <span className="att-chip att-chip-late">LATE {lateMins}M</span> :
                           <span className="att-chip att-chip-ontime">ON TIME</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {attendance.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No records for this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'payslips' && (
        <div className="pay-container">
          <div className="att-header">
            <div>
              <div className="prof-breadcrumb">My Portal / <strong>My Payslips</strong></div>
              <div className="prof-title">My Payslips</div>
              <div className="prof-subtitle">Earnings and deductions history</div>
            </div>
            <select className="att-month-select">
              <option>All Periods</option>
            </select>
          </div>

          {payslips.map((p, idx) => {
            const deductions = Number(p.sss_contribution) + Number(p.philhealth_contribution) + Number(p.pagibig_contribution) + Number(p.withholding_tax) + Number(p.other_deductions)
            const isNew = idx === 0 // Mock the first one as new
            
            return (
              <div className="pay-card" key={p.id}>
                <div className="pay-card-hd">
                  <div>
                    <div className="pay-period-title">{p.period?.period_name || 'Period'} Payslip</div>
                    <div className="pay-period-sub">
                      {employee.full_name} · {employee.employee_id} · {p.period?.period_name} · Pay date: {p.period?.pay_date}
                    </div>
                  </div>
                  <div className="pay-badges">
                    {isNew && <span className="pay-tag-new">NEW</span>}
                    <span className="pay-badge-released">RELEASED</span>
                    <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: '#0369a1', fontSize: '.65rem' }}>📄 PDF</button>
                    {isNew && <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink3)', fontSize: '.65rem' }}>Mark Viewed</button>}
                  </div>
                </div>
                <div className="pay-body">
                  <div className="pay-section">
                    <span className="pay-section-lbl">Earnings</span>
                    <div className="pay-row"><span>Basic Pay</span><span className="pay-val">₱{Number(p.gross_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Overtime Pay</span><span className="pay-val">₱0.00</span></div>
                    <div className="pay-row"><span>Allowances</span><span className="pay-val">₱0.00</span></div>
                    <div className="pay-row total"><span>Gross Pay</span><span className="pay-val">₱{Number(p.gross_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                  <div className="pay-section">
                    <span className="pay-section-lbl">Deductions</span>
                    <div className="pay-row"><span>SSS</span><span className="pay-val">-₱{Number(p.sss_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>PhilHealth</span><span className="pay-val">-₱{Number(p.philhealth_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Pag-IBIG</span><span className="pay-val">-₱{Number(p.pagibig_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Withholding Tax</span><span className="pay-val">-₱{Number(p.withholding_tax).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Absence Deduction</span><span className="pay-val">-₱0.00</span></div>
                    <div className="pay-row total"><span>Net Pay</span><span className="pay-val pay-val-net">₱{Number(p.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
              </div>
            )
          })}

          {payslips.length === 0 && (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>
              No payslip records found.
            </div>
          )}
        </div>
      )}

      {activeSection === 'profile' && (
        <div className="prof-container">
          <div className="prof-header">
            <div className="prof-breadcrumb">My Portal / <strong>My Profile</strong></div>
            <div className="prof-title">My Profile</div>
            <div className="prof-subtitle">Personal and employment information — read-only for core fields</div>
          </div>

          <div className="prof-alert">
            <span className="prof-alert-icon">🔒</span>
            <div>
              <strong>Some fields are managed by HR</strong><br />
              Contact your HR Officer to update salary, employment dates, or department assignments.
            </div>
          </div>

          <div className="prof-banner">
            <div className="prof-banner-top">
              <div className="prof-avatar" style={{ background: 'var(--purple)' }}>{initials}</div>
              <div>
                <div className="prof-name">{employee.full_name}</div>
                <div className="prof-pos-dept">{employee.position} · {employee.department} Department</div>
                <div className="prof-chips">
                  <span className="prof-chip prof-chip-active">ACTIVE</span>
                  <span className="prof-chip prof-chip-regular">REGULAR</span>
                  <span className="prof-chip prof-chip-id">{employee.employee_id}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="prof-grid">
            <div className="prof-card">
              <div className="prof-card-hd">Personal Information</div>
              <div className="prof-row"><span className="prof-label">Full Name</span><span className="prof-val">{employee.full_name}</span></div>
              <div className="prof-row"><span className="prof-label">Date of Birth</span><span className="prof-val">March 12, 1990</span></div>
              <div className="prof-row"><span className="prof-label">Gender</span><span className="prof-val">Male</span></div>
              <div className="prof-row"><span className="prof-label">Civil Status</span><span className="prof-val">Married</span></div>
              <div className="prof-row"><span className="prof-label">Address</span><span className="prof-val">123 Rizal St., San Isidro, QC</span></div>
              <div className="prof-row"><span className="prof-label">Contact No.</span><span className="prof-val">09171234567</span></div>
            </div>

            <div className="prof-card">
              <div className="prof-card-hd">Employment Details <span className="prof-card-sub">(HR managed)</span></div>
              <div className="prof-row"><span className="prof-label">Employee ID</span><span className="prof-val">{employee.employee_id}</span></div>
              <div className="prof-row"><span className="prof-label">Position</span><span className="prof-val">{employee.position}</span></div>
              <div className="prof-row"><span className="prof-label">Department</span><span className="prof-val">{employee.department}</span></div>
              <div className="prof-row"><span className="prof-label">Employment Type</span><span className="prof-val">Regular</span></div>
              <div className="prof-row"><span className="prof-label">Date Hired</span><span className="prof-val">{new Date(employee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
              <div className="prof-row"><span className="prof-label">Direct Supervisor</span><span className="prof-val">Lorna Cruz</span></div>
            </div>
          </div>

          <div className="prof-tile-grid">
            <div className="prof-tile">
              <div className="prof-tile-hd">SSS</div>
              <div className="prof-tile-row"><span className="prof-tile-lbl">SSS No.</span><span className="prof-tile-val">03-1234567-8</span></div>
            </div>
            <div className="prof-tile">
              <div className="prof-tile-hd">PhilHealth</div>
              <div className="prof-tile-row"><span className="prof-tile-lbl">PhilHealth No.</span><span className="prof-tile-val">12-345678901-2</span></div>
            </div>
            <div className="prof-tile">
              <div className="prof-tile-hd">Pag-IBIG</div>
              <div className="prof-tile-row"><span className="prof-tile-lbl">MID No.</span><span className="prof-tile-val">1234-5678-9012</span></div>
            </div>
          </div>

          <div className="prof-footer">
            <div>San Isidro Barangay Portal · Employee Self-Service · v2.1.0</div>
            <div>© 2025 Barangay San Isidro, Quezon City</div>
          </div>
        </div>
      )}

      {/* Apply Leave Modal */}
      <div className={`modal-ov${showApplyLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowApplyLeave(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Apply for Leave</div><div className="modal-sub">Submit to your supervisor for approval</div></div>
            <button className="modal-x" onClick={() => setShowApplyLeave(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Leave Type</label>
              <select className="form-ctrl" value={newLeave.leave_type} onChange={e => setNewLeave(p => ({ ...p, leave_type: e.target.value }))}>
                {['vacation','sick','emergency','maternity','paternity','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date</label><input className="form-ctrl" type="date" value={newLeave.start_date} onChange={e => setNewLeave(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date</label><input className="form-ctrl" type="date" value={newLeave.end_date} onChange={e => setNewLeave(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Reason</label><textarea className="form-ctrl" rows={3} value={newLeave.reason} onChange={e => setNewLeave(p => ({ ...p, reason: e.target.value }))} placeholder="Brief explanation of your leave request…" /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleApplyLeave}>Submit Request</button>
          </div>
        </div>
      </div>
    </div>
  )
}
