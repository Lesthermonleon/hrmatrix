import React, { useState, useEffect, useCallback } from 'react'
import { supabase, sanitizeError, logAudit } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Employee, LeaveRequest, AttendanceRecord, PayrollRecord, LeaveBalance, Announcement } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'
import { validateRequired, validateDateRange, firstError } from '../lib/validation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface EmpProps {
  activeSection: string
  onNavigate: (section: string) => void
}

export function EmployeeDashboard({ activeSection, onNavigate }: EmpProps) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [payslips, setPayslips] = useState<(PayrollRecord & { period?: { period_name: string; pay_date: string } })[]>([])
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [showApplyLeave, setShowApplyLeave] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editProfileForm, setEditProfileForm] = useState({ full_name: '', date_of_birth: '', gender: '', civil_status: '', address: '', phone: '', sss_number: '', philhealth_number: '', pagibig_number: '' })
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')
  const [newLeave, setNewLeave] = useState({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })

  const initials = employee?.full_name
    ? employee.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '??'

  useEffect(() => {
    if (profile) {
      fetchAll()
      const channel = supabase.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_records' }, () => fetchAll())
        .subscribe()
      const timer = setInterval(() => setCurrentTime(new Date()), 1000)
      return () => { clearInterval(timer); supabase.removeChannel(channel) }
    }
  }, [profile])

  const fetchAll = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data: empData } = await supabase.from('employees').select('*, supervisor:employees!supervisor_id(full_name)').eq('profile_id', profile.id).single()
    const emp = empData as (Employee & { supervisor?: { full_name: string } | null }) | null
    setEmployee(emp)

    if (emp) {
      const year = new Date().getFullYear()
      const [leavesRes, attRes, payRes, balRes, annRes] = await Promise.all([
        supabase.from('leave_requests').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false }),
        supabase.from('attendance_records').select('*').eq('employee_id', emp.id).order('date', { ascending: false }).limit(60),
        supabase.from('payroll_records').select('*, period:payroll_periods(period_name, pay_date)').eq('employee_id', emp.id).order('created_at', { ascending: false }),
        supabase.from('leave_balances').select('*').eq('employee_id', emp.id).eq('year', year).single(),
        supabase.from('announcements').select('*').in('target_role', ['all', 'employee']).order('created_at', { ascending: false }),
      ])
      setLeaves((leavesRes.data || []) as LeaveRequest[])
      setAttendance((attRes.data || []) as AttendanceRecord[])
      setPayslips((payRes.data || []) as (PayrollRecord & { period?: { period_name: string; pay_date: string } })[])
      setLeaveBalances((balRes.data as LeaveBalance) || null)
      setAnnouncements((annRes.data || []) as Announcement[])
    }
    setLoading(false)
  }, [profile])

  async function handleApplyLeave() {
    if (!employee) return
    const errs = validateRequired({ leave_type: newLeave.leave_type, start_date: newLeave.start_date, end_date: newLeave.end_date, reason: newLeave.reason })
    const dateErr = validateDateRange(newLeave.start_date, newLeave.end_date)
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'All fields required', 'warn'); return }
    if (dateErr) { showToast(dateErr, 'warn'); return }

    // Check if sufficient balance
    if (leaveBalances) {
      const days = Math.ceil((new Date(newLeave.end_date).getTime() - new Date(newLeave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
      const leaveType = newLeave.leave_type as keyof Pick<LeaveBalance, 'vacation' | 'sick' | 'emergency' | 'special'>
      if (['vacation', 'sick', 'emergency', 'special'].includes(leaveType)) {
        const balance = leaveBalances[leaveType] as number
        if (balance < days) {
          showToast(`Insufficient ${newLeave.leave_type} leave balance. You have ${balance} day(s) left but requested ${days}.`, 'warn')
          return
        }
      }
    }

    const days = Math.ceil((new Date(newLeave.end_date).getTime() - new Date(newLeave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: employee.id,
      leave_type: newLeave.leave_type,
      start_date: newLeave.start_date,
      end_date: newLeave.end_date,
      days_count: days,
      reason: newLeave.reason,
      status: 'pending',
    })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    showToast('Leave request submitted successfully', 'success')
    setShowApplyLeave(false)
    setNewLeave({ leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
    fetchAll()
  }

  // ── Update Profile info ─────────────────────────────────────────
  async function handleUpdateProfile() {
    if (!employee) return
    const { error } = await supabase.from('employees').update({
      full_name: editProfileForm.full_name || employee.full_name,
      date_of_birth: editProfileForm.date_of_birth,
      gender: editProfileForm.gender,
      civil_status: editProfileForm.civil_status,
      address: editProfileForm.address,
      phone: editProfileForm.phone,
      sss_number: editProfileForm.sss_number,
      philhealth_number: editProfileForm.philhealth_number,
      pagibig_number: editProfileForm.pagibig_number
    }).eq('id', employee.id)
    
    if (error) { showToast(sanitizeError(error), 'error'); return }

    if (employee.profile_id && editProfileForm.full_name && editProfileForm.full_name !== employee.full_name) {
      await supabase.from('profiles').update({ full_name: editProfileForm.full_name }).eq('id', employee.profile_id)
    }

    if (profile) await logAudit(profile.id, 'Updated own profile information', 'employees', employee.id)
    showToast('Profile information updated successfully', 'success')
    setShowEditProfile(false)
    fetchAll()
  }

  // ── PDF payslip ───────────────────────────────────────────
  async function handleDownloadPDF(p: PayrollRecord & { period?: { period_name: string; pay_date: string } }) {
    if (!employee) return
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const deductions = Number(p.sss_contribution) + Number(p.philhealth_contribution) + Number(p.pagibig_contribution) + Number(p.withholding_tax) + Number(p.other_deductions)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text('HRMatrix — Payslip', 20, 20)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text(`Period: ${p.period?.period_name || 'N/A'}`, 20, 32)
      doc.text(`Pay Date: ${p.period?.pay_date || 'N/A'}`, 20, 40)
      doc.text(`Employee: ${employee.full_name}`, 20, 48)
      doc.text(`Employee ID: ${employee.employee_id}`, 20, 56)
      doc.text(`Department: ${employee.department}`, 20, 64)
      doc.text(`Position: ${employee.position}`, 20, 72)

      doc.setLineWidth(0.5)
      doc.line(20, 78, 190, 78)

      doc.setFont('helvetica', 'bold')
      doc.text('EARNINGS', 20, 86)
      doc.setFont('helvetica', 'normal')
      doc.text('Basic Pay', 20, 94); doc.text(`PHP ${Number(p.basic_salary).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 94)
      doc.text('Overtime Pay', 20, 102); doc.text(`PHP ${Number(p.overtime_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 102)
      doc.text('Allowances', 20, 110); doc.text(`PHP ${Number(p.allowances).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 110)
      doc.setFont('helvetica', 'bold')
      doc.text('Gross Pay', 20, 118); doc.text(`PHP ${Number(p.gross_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 118)

      doc.line(20, 124, 190, 124)
      doc.setFont('helvetica', 'bold')
      doc.text('DEDUCTIONS', 20, 132)
      doc.setFont('helvetica', 'normal')
      doc.text('SSS', 20, 140); doc.text(`-PHP ${Number(p.sss_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 140)
      doc.text('PhilHealth', 20, 148); doc.text(`-PHP ${Number(p.philhealth_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 148)
      doc.text('Pag-IBIG', 20, 156); doc.text(`-PHP ${Number(p.pagibig_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 156)
      doc.text('Withholding Tax', 20, 164); doc.text(`-PHP ${Number(p.withholding_tax).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 164)
      doc.text('Other Deductions', 20, 172); doc.text(`-PHP ${Number(p.other_deductions).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 172)
      doc.text('Total Deductions', 20, 180); doc.text(`-PHP ${deductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 180)

      doc.line(20, 186, 190, 186)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('NET PAY', 20, 196)
      doc.text(`PHP ${Number(p.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 140, 196)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('This is a system-generated payslip. HRMatrix © 2026', 20, 220)

      doc.save(`Payslip_${employee.employee_id}_${p.period?.period_name || 'period'}.pdf`)
      showToast('Payslip downloaded', 'success')
    } catch {
      showToast('PDF generation failed. Please try again.', 'error')
    }
  }

  // ── Mark payslip viewed ───────────────────────────────────
  async function handleMarkViewed(payslipId: string) {
    const { error } = await supabase.from('payroll_records').update({ status: 'approved' }).eq('id', payslipId).eq('status', 'draft')
    if (error) { showToast(sanitizeError(error), 'error'); return }
    showToast('Payslip marked as viewed', 'success')
    fetchAll()
  }

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace(/_/g, ' ')}</span>
  }

  const monthName = currentTime.toLocaleString('default', { month: 'long' })
  const year = currentTime.getFullYear()
  const dateString = currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeString = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const latestPayslip = payslips.find(p => p.status === 'paid' || p.status === 'approved')

  const firstDay = new Date(year, currentTime.getMonth(), 1).getDay()
  const daysInMonth = new Date(year, currentTime.getMonth() + 1, 0).getDate()
  const calendarCells = Array.from({ length: 42 }, (_, i) => { const day = i - firstDay + 1; return (day > 0 && day <= daysInMonth) ? day : null })

  const presentDays = attendance.filter(a => a.status === 'present').length
  const absentDays = attendance.filter(a => a.status === 'absent').length
  const lateDays = attendance.filter(a => a.status === 'late').length
  const approvedLeaves = leaves.filter(l => l.status === 'approved').length
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length

  const supervisorName = (employee as (Employee & { supervisor?: { full_name: string } | null }))?.supervisor?.full_name || '—'

  const balanceItems = [
    { label: 'Vacation Leave', current: leaveBalances?.vacation ?? 0, total: 15, color: 'var(--teal)' },
    { label: 'Sick Leave', current: leaveBalances?.sick ?? 0, total: 15, color: '#0ea5e9' },
    { label: 'Emergency Leave', current: leaveBalances?.emergency ?? 0, total: 3, color: 'var(--warn)' },
    { label: 'Special Leave', current: leaveBalances?.special ?? 0, total: 5, color: 'var(--purple)' },
  ]

  const filteredLeaves = leaves.filter(l => leaveTypeFilter === 'all' || l.leave_type === leaveTypeFilter)

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  if (!employee) {
    return (
      <div className="wrap">
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: 8 }}>No Employee Record Found</div>
          <div style={{ color: 'var(--ink3)', fontSize: '.82rem' }}>Your profile hasn't been linked to an employee record. Please contact HR.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      {/* ── Dashboard Home ─────────────────────────────────── */}
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
                <button className={`btn-refresh${loading ? ' spinning' : ''}`} onClick={fetchAll} disabled={loading} title="Refresh">
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
                {latestPayslip.period?.period_name} payslip ready. Net pay: <strong>₱{Number(latestPayslip.net_pay).toLocaleString()}</strong>
                <button className="btn btn-link db-banner-link" onClick={() => onNavigate('payslips')}>View payslip →</button>
              </div>
            </div>
          )}

          {announcements.length > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.1rem' }}>📢</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#1e40af' }}>{announcements[0].title}</div>
                <div style={{ fontSize: '.8rem', color: '#3730a3', marginTop: 2 }}>{announcements[0].body}</div>
              </div>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => onNavigate('notifications')}>See all</button>
            </div>
          )}

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            {[
              { label: 'DAYS WORKED', value: presentDays, sub: `${monthName} ${year}`, route: 'attendance' },
              { label: 'LEAVE BALANCE', value: leaveBalances?.vacation ?? '—', sub: 'Vacation days', route: 'leaves' },
              { label: 'PENDING LEAVE', value: pendingLeaves, sub: 'Awaiting approval', route: 'leaves' },
              { label: 'NET PAY', value: latestPayslip ? `₱${Number(latestPayslip.net_pay).toLocaleString()}` : '—', sub: latestPayslip ? `Released ${latestPayslip.period?.pay_date}` : 'Not released', route: 'payslips' },
            ].map(s => (
              <div className="stat-tile" key={s.label} style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={() => onNavigate(s.route)}>
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
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-day-label">{d}</div>)}
                  {calendarCells.map((day, i) => {
                    if (day === null) return <div key={i} className="cal-cell" style={{ opacity: 0.3 }} />
                    const isToday = day === currentTime.getDate()
                    const dateVal = `${year}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const att = attendance.find(a => a.date === dateVal)
                    return (
                      <div key={i} className={`cal-cell${isToday ? ' today' : ''}`}>
                        {day}
                        {att && (<><div className={`cal-status status-${att.status}`} /><div className={`cal-status-indicator status-${att.status}`} /></>)}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-hd"><div className="card-title">Leave Balance Overview</div></div>
                <div style={{ height: 250, padding: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={balanceItems} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="current" name="Available Days" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
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
                          <td>{l.days_count}d</td>
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
                    {balanceItems.map(b => (
                      <div className="lp-item" key={b.label}>
                        <div className="lp-hd">
                          <span className="lp-label">{b.label}</span>
                          <span className="lp-val">{b.current} / {b.total} days</span>
                        </div>
                        <div className="lp-bar-bg">
                          <div className="lp-bar-fill" style={{ width: `${Math.min(1, b.current / b.total) * 100}%`, backgroundColor: b.color }} />
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
                    <div className="qi-row"><span className="qi-lbl">Supervisor</span><span className="qi-val">{supervisorName}</span></div>
                    <div className="qi-row"><span className="qi-lbl">Schedule</span><span className="qi-val">Mon–Fri, 8AM–5PM</span></div>
                  </div>
                </div>
                <div className="card-ft" style={{ borderTop: '1px solid var(--line)', background: 'none' }}>
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: '.75rem' }} onClick={() => setShowApplyLeave(true)}>📝 File a Leave Request</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Leave Requests ─────────────────────────────────── */}
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
                  <select className="leave-filter" value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
                    <option value="all">All Types</option>
                    {['vacation','sick','emergency','maternity','paternity','other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>TYPE</th><th>DATE RANGE</th><th>DAYS</th><th>FILED</th><th>REMARKS</th><th style={{ textAlign: 'right' }}>STATUS</th></tr></thead>
                    <tbody>
                      {filteredLeaves.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 500 }}>{l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave</td>
                          <td style={{ fontSize: '.75rem', color: 'var(--ink)' }}>{l.start_date} – {l.end_date}</td>
                          <td>{l.days_count}d</td>
                          <td style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>{new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                          <td style={{ fontSize: '.72rem', color: 'var(--ink3)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                          <td style={{ textAlign: 'right' }}><span className={`leave-chip leave-chip-${l.status.replace('supervisor_', '').replace('hr_', '')}`}>{l.status.replace(/_/g, ' ')}</span></td>
                        </tr>
                      ))}
                      {filteredLeaves.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No history found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="leave-side">
              <div className="leave-card">
                <div className="leave-card-hd"><div className="leave-card-title">Leave Balances — {year}</div></div>
                <div className="lp-grp">
                  {balanceItems.map(b => (
                    <div className="lp-item" key={b.label}>
                      <div className="lp-hd" style={{ marginBottom: 4 }}>
                        <span className="lp-label" style={{ fontSize: '.7rem' }}>{b.label}</span>
                        <span className="lp-val" style={{ fontSize: '.7rem' }}>{b.current} / {b.total}</span>
                      </div>
                      <div className="lp-bar-bg" style={{ height: 6 }}>
                        <div className="lp-bar-fill" style={{ width: `${Math.min(1, b.current / b.total) * 100}%`, backgroundColor: b.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn-lavender" style={{ width: '100%', padding: '12px', fontSize: '.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => setShowApplyLeave(true)}>📄 File New Leave Request</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Attendance ─────────────────────────────────────── */}
      {activeSection === 'attendance' && (
        <div className="att-container">
          <div className="att-header">
            <div>
              <div className="prof-breadcrumb">My Portal / <strong>Attendance</strong></div>
              <div className="prof-title">My Attendance</div>
              <div className="prof-subtitle">Daily time-in / time-out logs and monthly summary</div>
            </div>
          </div>
          <div className="att-summary">
            <div className="att-stat-tile"><div className="att-stat-lbl">Days Present</div><div className="att-stat-val">{presentDays}</div><div className="att-stat-sub">Out of {daysInMonth} days</div></div>
            <div className="att-stat-tile" style={{ borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}><div className="att-stat-lbl">Absences</div><div className="att-stat-val">{absentDays}</div><div className="att-stat-sub">{absentDays === 0 ? 'Perfect record' : `${absentDays} day(s)`}</div></div>
            <div className="att-stat-tile"><div className="att-stat-lbl">Late / Undertime</div><div className="att-stat-val">{lateDays}</div><div className="att-stat-sub">{lateDays === 0 ? 'Always on time' : `${lateDays} late day(s)`}</div></div>
          </div>
          <div className="att-cal-card">
            <div className="att-cal-hd">
              <div className="att-cal-title">{monthName} {year}</div>
              <div className="att-cal-legend">
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#10b981' }} /> On Time</div>
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#f59e0b' }} /> Late</div>
                <div className="att-cal-leg-item"><div className="att-cal-dot" style={{ background: '#8b5cf6' }} /> Leave</div>
              </div>
            </div>
            <div className="att-cal-grid">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="att-cal-day-lbl">{d}</div>)}
              {calendarCells.map((day, i) => {
                const dateVal = day ? `${year}-${String(currentTime.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null
                const att = dateVal ? attendance.find(a => a.date === dateVal) : null
                const isLeave = dateVal ? leaves.find(l => l.status === 'approved' && dateVal >= l.start_date && dateVal <= l.end_date) : null
                const isToday = day === currentTime.getDate()
                let cellClass = 'att-cal-cell'
                if (isToday && !att?.time_out) cellClass += ' in-progress'
                else if (isLeave) cellClass += ' leave'
                else if (att?.status === 'present') { const hour = parseInt(att.time_in?.split(':')[0] || '0'); const min = parseInt(att.time_in?.split(':')[1] || '0'); cellClass += (hour > 8 || (hour === 8 && min > 0)) ? ' late' : ' present' }
                return <div key={i} className={cellClass}>{day}</div>
              })}
            </div>
          </div>
          <div className="att-table-card">
            <div className="att-table-title">Daily Time Records — {monthName} {year}</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>DATE</th><th>TIME IN</th><th>TIME OUT</th><th>HOURS</th><th style={{ textAlign: 'right' }}>REMARKS</th></tr></thead>
                <tbody>
                  {attendance.map(a => {
                    const isToday = a.date === currentTime.toISOString().split('T')[0]
                    const inTime = a.time_in ? new Date(`2000-01-01T${a.time_in}`) : null
                    const outTime = a.time_out ? new Date(`2000-01-01T${a.time_out}`) : null
                    let diffHrs = 0, diffMins = 0
                    if (inTime && outTime) { const diff = outTime.getTime() - inTime.getTime(); diffHrs = Math.floor(diff / 3600000); diffMins = Math.floor((diff % 3600000) / 60000) }
                    const isLate = inTime && (inTime.getHours() > 8 || (inTime.getHours() === 8 && inTime.getMinutes() > 0))
                    const lateMins = isLate ? (inTime!.getHours() - 8) * 60 + inTime!.getMinutes() : 0
                    const isLeave = leaves.find(l => l.status === 'approved' && a.date >= l.start_date && a.date <= l.end_date)
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500 }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td>{a.time_in || '—'}</td>
                        <td>{a.time_out || '—'}</td>
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

      {/* ── Payslips ───────────────────────────────────────── */}
      {activeSection === 'payslips' && (
        <div className="pay-container">
          <div className="att-header">
            <div>
              <div className="prof-breadcrumb">My Portal / <strong>My Payslips</strong></div>
              <div className="prof-title">My Payslips</div>
              <div className="prof-subtitle">Earnings and deductions history</div>
            </div>
          </div>
          {payslips.map((p, idx) => {
            const deductions = Number(p.sss_contribution) + Number(p.philhealth_contribution) + Number(p.pagibig_contribution) + Number(p.withholding_tax) + Number(p.other_deductions)
            const isNew = idx === 0 && p.status === 'paid'
            return (
              <div className="pay-card" key={p.id}>
                <div className="pay-card-hd">
                  <div>
                    <div className="pay-period-title">{p.period?.period_name || 'Period'} Payslip</div>
                    <div className="pay-period-sub">{employee.full_name} · {employee.employee_id} · Pay date: {p.period?.pay_date}</div>
                  </div>
                  <div className="pay-badges">
                    {isNew && <span className="pay-tag-new">NEW</span>}
                    <span className="pay-badge-released">{p.status.toUpperCase()}</span>
                    <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: '#0369a1', fontSize: '.65rem' }} onClick={() => handleDownloadPDF(p)}>📄 PDF</button>
                    {isNew && <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink3)', fontSize: '.65rem' }} onClick={() => handleMarkViewed(p.id)}>✓ Mark Viewed</button>}
                  </div>
                </div>
                <div className="pay-body">
                  <div className="pay-section">
                    <span className="pay-section-lbl">Earnings</span>
                    <div className="pay-row"><span>Basic Pay</span><span className="pay-val">₱{Number(p.basic_salary).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Overtime Pay</span><span className="pay-val">₱{Number(p.overtime_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Allowances</span><span className="pay-val">₱{Number(p.allowances).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row total"><span>Gross Pay</span><span className="pay-val">₱{Number(p.gross_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                  <div className="pay-section">
                    <span className="pay-section-lbl">Deductions</span>
                    <div className="pay-row"><span>SSS</span><span className="pay-val">-₱{Number(p.sss_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>PhilHealth</span><span className="pay-val">-₱{Number(p.philhealth_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Pag-IBIG</span><span className="pay-val">-₱{Number(p.pagibig_contribution).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row"><span>Withholding Tax</span><span className="pay-val">-₱{Number(p.withholding_tax).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                    <div className="pay-row total"><span>Net Pay</span><span className="pay-val pay-val-net">₱{Number(p.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
              </div>
            )
          })}
          {payslips.length === 0 && <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>No payslip records found.</div>}
        </div>
      )}

      {/* ── Profile ────────────────────────────────────────── */}
      {activeSection === 'profile' && (
        <div className="prof-container">
          <div className="prof-header">
            <div className="prof-breadcrumb">My Portal / <strong>My Profile</strong></div>
            <div className="prof-title">My Profile</div>
            <div className="prof-subtitle">Personal and employment information — contact HR to update core fields</div>
          </div>
          <div className="prof-alert">
            <span className="prof-alert-icon">🔒</span>
            <div><strong>Some fields are managed by HR</strong><br />Contact HR to update salary, employment dates, or government IDs.</div>
          </div>
          <div className="prof-banner">
            <div className="prof-banner-top">
              <div className="prof-avatar" style={{ background: 'var(--purple)' }}>{initials}</div>
              <div>
                <div className="prof-name">{employee.full_name}</div>
                <div className="prof-pos-dept">{employee.position} · {employee.department} Department</div>
                <div className="prof-chips">
                  <span className="prof-chip prof-chip-active">{employee.status.toUpperCase()}</span>
                  <span className="prof-chip prof-chip-regular">{(employee.employment_type || 'regular').toUpperCase()}</span>
                  <span className="prof-chip prof-chip-id">{employee.employee_id}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="prof-grid">
            <div className="prof-card">
              <div className="prof-card-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Personal Information
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => { 
                    setEditProfileForm({ 
                      full_name: employee.full_name,
                      date_of_birth: employee.date_of_birth || '',
                      gender: employee.gender || '',
                      civil_status: employee.civil_status || '',
                      address: employee.address || '',
                      phone: employee.phone || '',
                      sss_number: employee.sss_number || '',
                      philhealth_number: employee.philhealth_number || '',
                      pagibig_number: employee.pagibig_number || ''
                    }); 
                    setShowEditProfile(true) 
                  }}
                >
                  ✏️ Edit Profile
                </button>
              </div>
              <div className="prof-row"><span className="prof-label">Full Name</span><span className="prof-val">{employee.full_name}</span></div>
              <div className="prof-row"><span className="prof-label">Date of Birth</span><span className="prof-val">{employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span></div>
              <div className="prof-row"><span className="prof-label">Gender</span><span className="prof-val">{employee.gender || '—'}</span></div>
              <div className="prof-row"><span className="prof-label">Civil Status</span><span className="prof-val">{employee.civil_status || '—'}</span></div>
              <div className="prof-row"><span className="prof-label">Address</span><span className="prof-val">{employee.address || '—'}</span></div>
              <div className="prof-row"><span className="prof-label">Contact No.</span><span className="prof-val">{employee.phone || '—'}</span></div>
            </div>
            <div className="prof-card">
              <div className="prof-card-hd">Employment Details <span className="prof-card-sub">(HR managed)</span></div>
              <div className="prof-row"><span className="prof-label">Employee ID</span><span className="prof-val">{employee.employee_id}</span></div>
              <div className="prof-row"><span className="prof-label">Position</span><span className="prof-val">{employee.position}</span></div>
              <div className="prof-row"><span className="prof-label">Department</span><span className="prof-val">{employee.department}</span></div>
              <div className="prof-row"><span className="prof-label">Employment Type</span><span className="prof-val">{employee.employment_type || 'Regular'}</span></div>
              <div className="prof-row"><span className="prof-label">Date Hired</span><span className="prof-val">{new Date(employee.hire_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
              <div className="prof-row"><span className="prof-label">Direct Supervisor</span><span className="prof-val">{supervisorName}</span></div>
            </div>
          </div>
          <div className="prof-tile-grid">
            <div className="prof-tile"><div className="prof-tile-hd">SSS</div><div className="prof-tile-row"><span className="prof-tile-lbl">SSS No.</span><span className="prof-tile-val">{employee.sss_number || '—'}</span></div></div>
            <div className="prof-tile"><div className="prof-tile-hd">PhilHealth</div><div className="prof-tile-row"><span className="prof-tile-lbl">No.</span><span className="prof-tile-val">{employee.philhealth_number || '—'}</span></div></div>
            <div className="prof-tile"><div className="prof-tile-hd">Pag-IBIG</div><div className="prof-tile-row"><span className="prof-tile-lbl">MID No.</span><span className="prof-tile-val">{employee.pagibig_number || '—'}</span></div></div>
          </div>
          <div className="prof-footer">
            <div>HRMatrix · Employee Self-Service · v2.0.0</div>
            <div>© {year} HRMatrix</div>
          </div>
        </div>
      )}

      {/* ── Notifications ─────────────────────────────────── */}
      {activeSection === 'notifications' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="ph"><div className="ph-title">Notifications</div><div className="ph-sub">Announcements and status updates</div></div>

          {/* Leave status updates */}
          {leaves.filter(l => l.status !== 'pending').slice(0, 5).map(l => (
            <div key={l.id} style={{ marginBottom: 12, borderRadius: 10, padding: '12px 16px', border: '1px solid var(--line)', background: 'var(--bg2)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>{l.status === 'approved' ? '✅' : l.status === 'rejected' ? '❌' : '🔔'}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{l.leave_type} Leave — {l.status.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--ink3)', marginTop: 2 }}>{l.start_date} to {l.end_date} · {l.days_count} day(s)</div>
                {(l.hr_notes || l.supervisor_notes) && <div style={{ fontSize: '.78rem', color: 'var(--ink2)', marginTop: 4 }}>Note: {l.hr_notes || l.supervisor_notes}</div>}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '.72rem', color: 'var(--ink3)' }}>{new Date(l.created_at).toLocaleDateString()}</div>
            </div>
          ))}

          {/* Latest payslip notification */}
          {latestPayslip && (
            <div style={{ marginBottom: 12, borderRadius: 10, padding: '12px 16px', border: '1px solid #86efac', background: '#f0fdf4', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: '1.3rem' }}>💰</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#065f46' }}>Payslip Available — {latestPayslip.period?.period_name}</div>
                <div style={{ fontSize: '.78rem', color: '#047857', marginTop: 2 }}>Net Pay: ₱{Number(latestPayslip.net_pay).toLocaleString()}</div>
              </div>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('payslips')}>View</button>
            </div>
          )}

          <div className="card">
            <div className="card-hd"><div className="card-title">📢 Announcements</div></div>
            <div style={{ padding: '8px 16px 16px' }}>
              {announcements.map(a => (
                <div key={a.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--ink2)', marginTop: 4 }}>{a.body}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--ink3)', marginTop: 6 }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))}
              {announcements.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>No announcements.</div>}
            </div>
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
            <div className="form-grp"><label className="form-lbl">Leave Type *</label>
              <select className="form-ctrl" value={newLeave.leave_type} onChange={e => setNewLeave(p => ({ ...p, leave_type: e.target.value }))}>
                {['vacation','sick','emergency','maternity','paternity','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            {leaveBalances && ['vacation','sick','emergency','special'].includes(newLeave.leave_type) && (
              <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '.78rem', color: 'var(--ink2)' }}>
                Remaining balance: <strong>{leaveBalances[newLeave.leave_type as keyof Pick<LeaveBalance,'vacation'|'sick'|'emergency'|'special'>]} days</strong>
              </div>
            )}
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date *</label><input className="form-ctrl" type="date" value={newLeave.start_date} onChange={e => setNewLeave(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date *</label><input className="form-ctrl" type="date" value={newLeave.end_date} onChange={e => setNewLeave(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            {newLeave.start_date && newLeave.end_date && new Date(newLeave.end_date) >= new Date(newLeave.start_date) && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', marginBottom: 12, fontSize: '.78rem', color: '#065f46' }}>
                This request spans <strong>{Math.ceil((new Date(newLeave.end_date).getTime() - new Date(newLeave.start_date).getTime()) / 86400000) + 1} day(s)</strong>
              </div>
            )}
            <div className="form-grp"><label className="form-lbl">Reason *</label><textarea className="form-ctrl" rows={3} value={newLeave.reason} onChange={e => setNewLeave(p => ({ ...p, reason: e.target.value }))} placeholder="Brief explanation of your leave request…" /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleApplyLeave}>Submit Request</button>
          </div>
        </div>
      </div>

      {/* Edit Profile Info Modal */}
      <div className={`modal-ov${showEditProfile ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowEditProfile(false) }}>
        <div className="modal-box modal-box-lg" style={{ maxWidth: 540 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit Profile Information</div><div className="modal-sub">Update your personal and contact details</div></div>
            <button className="modal-x" onClick={() => setShowEditProfile(false)}>✕</button>
          </div>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="form-grp"><label className="form-lbl">Full Name</label><input className="form-ctrl" value={editProfileForm.full_name} onChange={e => setEditProfileForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Date of Birth</label><input type="date" className="form-ctrl" value={editProfileForm.date_of_birth} onChange={e => setEditProfileForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Gender</label>
                <select className="form-ctrl" value={editProfileForm.gender} onChange={e => setEditProfileForm(p => ({ ...p, gender: e.target.value }))}>
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Civil Status</label>
                <select className="form-ctrl" value={editProfileForm.civil_status} onChange={e => setEditProfileForm(p => ({ ...p, civil_status: e.target.value }))}>
                  <option value="">Select...</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
              <div className="form-grp"><label className="form-lbl">Contact Number</label><input className="form-ctrl" value={editProfileForm.phone} onChange={e => setEditProfileForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XXXXXXXXX" /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Address</label><textarea className="form-ctrl" rows={2} value={editProfileForm.address} onChange={e => setEditProfileForm(p => ({ ...p, address: e.target.value }))} placeholder="Full address" /></div>
            
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--ink3)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Government IDs</div>
            <div className="form-row fr-3">
              <div className="form-grp"><label className="form-lbl">SSS No.</label><input className="form-ctrl" value={editProfileForm.sss_number} onChange={e => setEditProfileForm(p => ({ ...p, sss_number: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">PhilHealth No.</label><input className="form-ctrl" value={editProfileForm.philhealth_number} onChange={e => setEditProfileForm(p => ({ ...p, philhealth_number: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Pag-IBIG No.</label><input className="form-ctrl" value={editProfileForm.pagibig_number} onChange={e => setEditProfileForm(p => ({ ...p, pagibig_number: e.target.value }))} /></div>
            </div>

            <div style={{ fontSize: '.75rem', color: 'var(--ink3)', marginBottom: 12, marginTop: 12 }}>📋 Department, position, and salary alterations are handled exclusively by HR.</div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleUpdateProfile}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}
