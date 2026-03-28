import React, { useState, useEffect, useCallback } from 'react'
import { supabase, logAudit, sanitizeError, exportCSV, getEmailConfirmRedirectUrl, fetchAllPaged } from '../lib/supabase'
import type { Employee, LeaveRequest, AttendanceRecord, LeaveBalance, Announcement, Department, UserRole } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../context/ThemeContext'
import { getChartTheme } from '../lib/chartTheme'
import { SkeletonLoader } from '../components/SkeletonLoader'
import { validateRequired, validateDateRange, firstError, validateEmail, validateTemporaryPassword, getTemporaryPasswordChecks, generateSecureTemporaryPassword } from '../lib/validation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface HRProps {
  activeSection: string
  onNavigate: (section: string) => void
}

const emptyHireForm = (): {
  first_name: string
  last_name: string
  email: string
  password: string
  role: UserRole
  department: string
  position: string
  hire_date: string
  basic_salary: number
} => ({
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'employee',
  department: '',
  position: '',
  hire_date: new Date().toISOString().split('T')[0],
  basic_salary: 0,
})

export function HRManagerDashboard({ activeSection, onNavigate }: HRProps) {
  const { profile } = useAuth()
  const { theme } = useTheme()
  const chart = getChartTheme(theme)
  const { showToast } = useToast()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [newHire, setNewHire] = useState(emptyHireForm)
  const [showAddLeave, setShowAddLeave] = useState(false)
  const [showAddAttendance, setShowAddAttendance] = useState(false)
  const [showAddLeaveBalance, setShowAddLeaveBalance] = useState(false)
  const [showEditEmp, setShowEditEmp] = useState<Employee | null>(null)
  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null)
  const [editBalance, setEditBalance] = useState<LeaveBalance | null>(null)
  const [editAttendance, setEditAttendance] = useState<AttendanceRecord | null>(null)

  // Form state
  const [hrNotes, setHrNotes] = useState('')
  const [newLeave, setNewLeave] = useState({ employee_id: '', leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
  const [newAttendance, setNewAttendance] = useState({ employee_id: '', date: new Date().toISOString().split('T')[0], time_in: '08:00', time_out: '17:00', status: 'present', notes: '' })
  const [newLeaveBalance, setNewLeaveBalance] = useState({ employee_id: '', year: new Date().getFullYear(), vacation: 15, sick: 15, emergency: 3, special: 5 })

  // Filters
  const [empSearch, setEmpSearch] = useState('')
  const [empStatusFilter, setEmpStatusFilter] = useState('all')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all')
  const [attSearch, setAttSearch] = useState('')
  const [attDateFilter, setAttDateFilter] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empPaged, deptRes, leaveRes, attRes, balRes, annRes] = await Promise.all([
      fetchAllPaged<Employee>(async (from, to) =>
        supabase.from('employees').select('*').order('full_name').range(from, to),
      ),
      supabase.from('departments').select('*').order('name'),
      supabase.from('leave_requests').select('*, employee:employees!employee_id(*)').order('created_at', { ascending: false }),
      supabase.from('attendance_records').select('*, employee:employees!employee_id(*)').order('date', { ascending: false }).limit(100),
      supabase.from('leave_balances').select('*, employee:employees!employee_id(full_name,employee_id)').order('employee_id'),
      supabase.from('announcements').select('*, author:profiles(full_name)').order('created_at', { ascending: false }),
    ])
    if (empPaged.error) showToast(`Employees: ${sanitizeError(empPaged.error)}`, 'error')
    setEmployees(empPaged.data as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setLeaveRequests((leaveRes.data || []) as LeaveRequest[])
    setAttendance((attRes.data || []) as AttendanceRecord[])
    setLeaveBalances((balRes.data || []) as LeaveBalance[])
    setAnnouncements((annRes.data || []) as Announcement[])
    setLoading(false)
  }, [])

  // ── Leave action ─────────────────────────────────────────
  async function handleLeaveAction(id: string, action: 'approved' | 'rejected') {
    if (!reviewLeave) return
    if (action === 'approved') {
      // Decrement leave balance
      const empId = reviewLeave.employee_id
      const year = new Date(reviewLeave.start_date).getFullYear()
      const balRes = await supabase.from('leave_balances').select('*').eq('employee_id', empId).eq('year', year).single()
      if (balRes.data) {
        const bal = balRes.data as LeaveBalance
        const field = reviewLeave.leave_type as keyof Pick<LeaveBalance, 'vacation' | 'sick' | 'emergency' | 'special'>
        if (['vacation', 'sick', 'emergency', 'special'].includes(field)) {
          const current = bal[field] as number
          const newVal = Math.max(0, current - reviewLeave.days_count)
          await supabase.from('leave_balances').update({ [field]: newVal }).eq('id', bal.id)
        }
      }
    }
    const { error } = await supabase.from('leave_requests').update({ status: action, hr_notes: hrNotes }).eq('id', id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `${action === 'approved' ? 'Approved' : 'Rejected'} leave for ${reviewLeave.employee?.full_name}`, 'leave_requests', id)
    showToast(action === 'approved' ? 'Leave request approved' : 'Leave request rejected', action === 'approved' ? 'success' : 'error')
    setReviewLeave(null)
    setHrNotes('')
    fetchAll()
  }

  // ── Add employee + auth (HR cannot assign admin role) ────
  async function handleHireEmployee() {
    const errs = validateRequired({
      first_name: newHire.first_name,
      last_name: newHire.last_name,
      email: newHire.email,
      department: newHire.department,
      hire_date: newHire.hire_date,
    })
    const emailErr = validateEmail(newHire.email)
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'Please fill required fields', 'warn'); return }
    if (emailErr) { showToast(emailErr, 'warn'); return }
    if (newHire.role === 'admin') { showToast('Only an administrator can create admin accounts', 'warn'); return }
    const pwErr = validateTemporaryPassword(newHire.password)
    if (pwErr) { showToast(pwErr, 'warn'); return }
    if (newHire.basic_salary < 0) { showToast('Salary cannot be negative', 'warn'); return }

    const fullName = `${newHire.first_name} ${newHire.last_name}`.trim()
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: newHire.email,
      password: newHire.password,
      options: {
        emailRedirectTo: getEmailConfirmRedirectUrl(),
        data: { full_name: fullName, role: newHire.role },
      },
    })
    if (authErr) { showToast(sanitizeError(authErr), 'error'); return }
    if (!authData.user?.id) {
      showToast('Auth did not return a new user id. Check Supabase Auth settings or email confirmation.', 'error')
      return
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ role: newHire.role, department: newHire.department, position: newHire.position || null })
      .eq('id', authData.user.id)
    if (profileErr) { showToast(sanitizeError(profileErr), 'error'); return }

    const { data: newEmp, error: empErr } = await supabase
      .from('employees')
      .insert({
        full_name: fullName,
        email: newHire.email,
        department: newHire.department,
        position: newHire.position || newHire.role.replace('_', ' '),
        employee_id: `EMP-${Date.now().toString().slice(-5)}`,
        hire_date: newHire.hire_date,
        status: 'active',
        basic_salary: newHire.basic_salary,
        profile_id: authData.user.id,
      })
      .select('id')
      .single()
    if (empErr) { showToast(sanitizeError(empErr), 'error'); return }

    const y = new Date(newHire.hire_date).getFullYear()
    if (newEmp?.id) {
      const { error: balErr } = await supabase.from('leave_balances').upsert(
        { employee_id: newEmp.id, year: y, vacation: 15, sick: 15, emergency: 3, special: 5 },
        { onConflict: 'employee_id,year' },
      )
      if (balErr) showToast(`Employee created; leave balance row: ${sanitizeError(balErr)}`, 'warn')
    }

    if (profile) await logAudit(profile.id, `HR created employee account: ${newHire.email}`, 'employees', undefined, null, { email: newHire.email, role: newHire.role })
    showToast('Employee and sign-in account created. User may need to confirm email before first login.', 'success')
    setShowAddEmployee(false)
    setNewHire(emptyHireForm())
    fetchAll()
  }

  // ── Update employee ───────────────────────────────────────
  async function handleUpdateEmployee() {
    if (!showEditEmp) return
    const errs = validateRequired({ full_name: showEditEmp.full_name, department: showEditEmp.department, position: showEditEmp.position })
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'Please fill required fields', 'warn'); return }
    if (showEditEmp.basic_salary < 0) { showToast('Salary cannot be negative', 'warn'); return }
    const { error } = await supabase.from('employees').update({
      full_name: showEditEmp.full_name,
      department: showEditEmp.department,
      position: showEditEmp.position,
      status: showEditEmp.status,
      basic_salary: showEditEmp.basic_salary,
      date_of_birth: showEditEmp.date_of_birth,
      gender: showEditEmp.gender,
      civil_status: showEditEmp.civil_status,
      address: showEditEmp.address,
      phone: showEditEmp.phone,
      sss_number: showEditEmp.sss_number,
      philhealth_number: showEditEmp.philhealth_number,
      pagibig_number: showEditEmp.pagibig_number,
      employment_type: showEditEmp.employment_type,
      supervisor_id: showEditEmp.supervisor_id || null,
    }).eq('id', showEditEmp.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Updated employee: ${showEditEmp.full_name}`, 'employees', showEditEmp.id)
    showToast('Employee updated successfully', 'success')
    setShowEditEmp(null)
    fetchAll()
  }

  // ── Add leave on behalf ───────────────────────────────────
  async function handleAddLeave() {
    const errs = validateRequired({ employee: newLeave.employee_id, start_date: newLeave.start_date, end_date: newLeave.end_date, reason: newLeave.reason })
    const dateErr = validateDateRange(newLeave.start_date, newLeave.end_date)
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'All fields required', 'warn'); return }
    if (dateErr) { showToast(dateErr, 'warn'); return }
    const days = Math.ceil((new Date(newLeave.end_date).getTime() - new Date(newLeave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    const { error } = await supabase.from('leave_requests').insert({ ...newLeave, days_count: days, status: 'pending' })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Created leave on behalf of employee`, 'leave_requests')
    showToast('Leave request created', 'success')
    setShowAddLeave(false)
    setNewLeave({ employee_id: '', leave_type: 'vacation', start_date: '', end_date: '', reason: '' })
    fetchAll()
  }

  // ── Update leave balance ──────────────────────────────────
  async function handleUpdateBalance() {
    if (!editBalance) return
    const { error } = await supabase.from('leave_balances').update({
      vacation: editBalance.vacation,
      sick: editBalance.sick,
      emergency: editBalance.emergency,
      special: editBalance.special,
    }).eq('id', editBalance.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Adjusted leave balance`, 'leave_balances', editBalance.id)
    showToast('Leave balance updated', 'success')
    setEditBalance(null)
    fetchAll()
  }

  async function handleUpdateAttendance() {
    if (!editAttendance) return
    const errs = validateRequired({ date: editAttendance.date, status: editAttendance.status })
    if (Object.keys(errs).length) { showToast('Date and status are required', 'warn'); return }
    const { error } = await supabase.from('attendance_records').update({
      date: editAttendance.date,
      time_in: editAttendance.time_in || null,
      time_out: editAttendance.time_out || null,
      status: editAttendance.status,
      notes: editAttendance.notes || null,
    }).eq('id', editAttendance.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Updated attendance for ${editAttendance.employee?.full_name}`, 'attendance_records', editAttendance.id)
    showToast('Attendance updated', 'success')
    setEditAttendance(null)
    fetchAll()
  }

  async function handleAddAttendance() {
    const errs = validateRequired({ employee: newAttendance.employee_id, date: newAttendance.date, status: newAttendance.status })
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'Required fields missing', 'warn'); return }
    const { error } = await supabase.from('attendance_records').insert({
      employee_id: newAttendance.employee_id,
      date: newAttendance.date,
      time_in: newAttendance.time_in || null,
      time_out: newAttendance.time_out || null,
      status: newAttendance.status,
      notes: newAttendance.notes || null,
    })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Logged attendance manually`, 'attendance_records')
    showToast('Attendance record created', 'success')
    setShowAddAttendance(false)
    setNewAttendance({ employee_id: '', date: new Date().toISOString().split('T')[0], time_in: '08:00', time_out: '17:00', status: 'present', notes: '' })
    fetchAll()
  }

  async function handleAddLeaveBalance() {
    const errs = validateRequired({ employee: newLeaveBalance.employee_id, year: newLeaveBalance.year })
    if (Object.keys(errs).length) { showToast('Employee and Year are required', 'warn'); return }
    const { error } = await supabase.from('leave_balances').insert({ ...newLeaveBalance })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Created leave balance for year ${newLeaveBalance.year}`, 'leave_balances')
    showToast('Leave balance created', 'success')
    setShowAddLeaveBalance(false)
    setNewLeaveBalance({ employee_id: '', year: new Date().getFullYear(), vacation: 15, sick: 15, emergency: 3, special: 5 })
    fetchAll()
  }

  // ── PDF Exports ──────────────────────────────────────────
  const generateHeader = (doc: jsPDF, title: string) => {
    doc.setFontSize(20)
    doc.setTextColor(40, 40, 40)
    doc.text('HRMatrix Management Suite', 14, 22)
    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    doc.text(title, 14, 30)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36)
    doc.setDrawColor(200, 200, 200)
    doc.line(14, 42, 196, 42)
  }

  function handleExportEmployees() {
    const doc = new jsPDF()
    generateHeader(doc, 'Employee Directory Report')
    const rows = filteredEmployees().map(e => [e.employee_id, e.full_name, e.department, e.position, e.employment_type || 'regular', e.status])
    autoTable(doc, {
      startY: 50,
      head: [['ID', 'Name', 'Department', 'Position', 'Type', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [51, 51, 60] }
    })
    doc.save(`Employees_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Employee PDF exported', 'success')
  }

  function handleExportLeaves() {
    const doc = new jsPDF()
    generateHeader(doc, 'Approved Leave Requests')
    const rows = filteredLeaves().filter(l => l.status === 'approved' || l.status === 'hr_approved').map(l => [l.employee?.full_name || '', l.leave_type, `${l.start_date} to ${l.end_date}`, `${l.days_count}d`, l.status])
    autoTable(doc, {
      startY: 50,
      head: [['Employee', 'Type', 'Period', 'Days', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [100, 80, 160] }
    })
    doc.save(`Approved_Leaves_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Leaves PDF exported', 'success')
  }

  function handleExportAttendance() {
    const doc = new jsPDF()
    generateHeader(doc, 'Attendance Log Report')
    const rows = filteredAttendance().map(a => [a.employee?.full_name || '', a.date, a.time_in || '-', a.time_out || '-', a.status])
    autoTable(doc, {
      startY: 50,
      head: [['Employee', 'Date', 'Time In', 'Time Out', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [40, 120, 120] }
    })
    doc.save(`Attendance_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Attendance PDF exported', 'success')
  }

  function handleExportBalances() {
    const doc = new jsPDF()
    generateHeader(doc, `Leave Entitlements — ${new Date().getFullYear()}`)
    const rows = leaveBalances.filter(b => b.year === new Date().getFullYear()).map(b => [(b as any).employee?.full_name || b.employee_id, b.vacation, b.sick, b.emergency, b.special])
    autoTable(doc, {
      startY: 50,
      head: [['Employee', 'Vacation', 'Sick', 'Emergency', 'Special']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [180, 100, 40] }
    })
    doc.save(`Leave_Balances_${new Date().getFullYear()}.pdf`)
    showToast('Leave Balances PDF exported', 'success')
  }

  // ── Filters ───────────────────────────────────────────────
  const filteredEmployees = () => employees.filter(e => {
    const matchSearch = !empSearch || e.full_name.toLowerCase().includes(empSearch.toLowerCase()) || e.department.toLowerCase().includes(empSearch.toLowerCase()) || e.email.toLowerCase().includes(empSearch.toLowerCase())
    const matchStatus = empStatusFilter === 'all' || e.status === empStatusFilter
    return matchSearch && matchStatus
  })

  const filteredLeaves = () => leaveRequests.filter(l => {
    const matchType = leaveTypeFilter === 'all' || l.leave_type === leaveTypeFilter
    const matchStatus = leaveStatusFilter === 'all' || l.status === leaveStatusFilter
    return matchType && matchStatus
  })

  const filteredAttendance = () => attendance.filter(a => {
    const matchSearch = !attSearch || a.employee?.full_name?.toLowerCase().includes(attSearch.toLowerCase())
    const matchDate = !attDateFilter || a.date === attDateFilter
    return matchSearch && matchDate
  })

  const pending = leaveRequests.filter(l => l.status === 'pending' || l.status === 'supervisor_approved')
  const approved = leaveRequests.filter(l => l.status === 'approved' || l.status === 'hr_approved')
  const activeEmps = employees.filter(e => e.status === 'active')

  const leaveBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'badge-warn', supervisor_approved: 'badge-teal', hr_approved: 'badge-teal', approved: 'badge-ok', rejected: 'badge-danger' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace(/_/g, ' ')}</span>
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-ok', inactive: 'badge-danger', on_leave: 'badge-warn' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  const empRows = filteredEmployees()
  const leaveRows = filteredLeaves()
  const attRows = filteredAttendance()

  return (
    <div className="wrap">
      <div className="ph">
        <div className="ph-sup">Human Resources</div>
        <div className="ph-row">
          <div>
            <div className="ph-title">HR Manager Dashboard</div>
            <div className="ph-sub">Manage employees, leaves, attendance, and leave balances</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={`btn-refresh${loading ? ' spinning' : ''}`} onClick={fetchAll} disabled={loading} title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Overview ──────────────────────────────────────── */}
      {activeSection === 'overview' && (
        <>
          <div className="stat-grid">
            {[
              { label: 'Total Employees', value: employees.length, route: 'employees' },
              { label: 'Active', value: activeEmps.length, route: 'employees' },
              { label: 'Pending Leaves', value: pending.length, route: 'leaves' },
              { label: 'Approved Leaves', value: approved.length, route: 'leaves' },
            ].map(s => (
              <div className="stat-tile" key={s.label} style={{ cursor: 'pointer' }} onClick={() => onNavigate(s.route)}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginBottom: 20, marginTop: 20 }}>
            <div className="card-hd"><div className="card-title">HR Metrics Overview</div></div>
            <div style={{ height: 280, padding: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Total Emps', value: employees.length, fill: chart.series.muted },
                  { name: 'Active Emps', value: activeEmps.length, fill: chart.series.green },
                  { name: 'Pending Leaves', value: pending.length, fill: chart.series.amber },
                  { name: 'Apprvd Leaves', value: approved.length, fill: chart.series.blue },
                ]} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.tickFill }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chart.tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: chart.cursorFill }} contentStyle={chart.tooltipContentStyle} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="panel-grid">
            <div className="card">
              <div className="card-hd"><div className="card-title">Pending Leave Requests</div></div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Employee</th><th>Type</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {pending.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No pending requests</td></tr>}
                    {pending.slice(0, 8).map(l => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500 }}>{l.employee?.full_name || '—'}</td>
                        <td><span className="badge badge-purple">{l.leave_type}</span></td>
                        <td>{l.days_count}d</td>
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

      {/* ── Employees ─────────────────────────────────────── */}
      {activeSection === 'employees' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Employees</div><div className="card-sub">{empRows.length} / {employees.length} records</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setNewHire(emptyHireForm()); setShowAddEmployee(true) }}>+ Add Employee</button>
              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportEmployees}>📥 Export PDF</button>
            </div>
          </div>
          <div style={{ padding: '0 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: 1, minWidth: 200 }} className="form-ctrl" placeholder="Search by name, dept, email…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            <select className="form-ctrl" style={{ width: 140 }} value={empStatusFilter} onChange={e => setEmpStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Dept</th><th>Position</th><th>Salary</th><th>Type</th><th>Status</th><th>Edit</th></tr></thead>
              <tbody>
                {empRows.map(e => (
                  <tr key={e.id}>
                    <td><div style={{ fontWeight: 500 }}>{e.full_name}</div><div style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{e.email}</div></td>
                    <td>{e.department}</td>
                    <td>{e.position}</td>
                    <td>₱{Number(e.basic_salary).toLocaleString()}</td>
                    <td><span className="badge badge-slate">{e.employment_type || 'regular'}</span></td>
                    <td>{statusBadge(e.status)}</td>
                    <td><button className="btn btn-ghost btn-xs" onClick={() => setShowEditEmp({ ...e })}>Edit</button></td>
                  </tr>
                ))}
                {empRows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 20 }}>No employees match your search</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leave Requests ────────────────────────────────── */}
      {activeSection === 'leaves' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">All Leave Requests</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportLeaves}>📥 Export PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLeave(true)}>+ New</button>
            </div>
          </div>
          <div style={{ padding: '0 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-ctrl" style={{ width: 150 }} value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              {['vacation', 'sick', 'emergency', 'maternity', 'paternity', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="form-ctrl" style={{ width: 170 }} value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="supervisor_approved">Supervisor Approved</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <p style={{ margin: '0 0 12px', padding: '0 16px', fontSize: '.75rem', color: 'var(--ink3)' }}>
            Approved vacation/sick is sequenced in payroll: up to 5 SIL days per year (after 1 year of service) apply first, then remaining company balances in <strong>Leave Balances</strong>; anything beyond is unpaid.
          </p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {leaveRows.map(l => (
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
                {leaveRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No leave requests found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Attendance ────────────────────────────────────── */}
      {activeSection === 'attendance' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">Attendance Log</div><div className="card-sub">{attRows.length} records</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportAttendance}>📥 Export PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddAttendance(true)}>+ New Attendance</button>
            </div>
          </div>
          <div style={{ padding: '0 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: 1, minWidth: 200 }} className="form-ctrl" placeholder="Search by employee…" value={attSearch} onChange={e => setAttSearch(e.target.value)} />
            <input type="date" className="form-ctrl" style={{ width: 160 }} value={attDateFilter} onChange={e => setAttDateFilter(e.target.value)} />
            {attDateFilter && <button className="btn btn-ghost btn-xs" onClick={() => setAttDateFilter('')}>Clear</button>}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Status</th><th>Notes</th><th>Edit</th></tr></thead>
              <tbody>
                {attRows.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.employee?.full_name || '—'}</td>
                    <td>{a.date}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_in || '—'}</td>
                    <td style={{ color: 'var(--ink3)' }}>{a.time_out || '—'}</td>
                    <td><span className={`badge ${a.status === 'present' ? 'badge-ok' : a.status === 'absent' ? 'badge-danger' : 'badge-warn'}`}>{a.status}</span></td>
                    <td style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>{a.notes || '—'}</td>
                    <td><button className="btn btn-ghost btn-xs" onClick={() => setEditAttendance({ ...a })}>Edit</button></td>
                  </tr>
                ))}
                {attRows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No attendance records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leave Balances ────────────────────────────────── */}
      {activeSection === 'leave_balances' && (
        <div className="card">
          <div className="card-hd">
            <div><div className="card-title">Leave Balances — {new Date().getFullYear()}</div><div className="card-sub">Adjust employee leave entitlements</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportBalances}>📥 Export PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLeaveBalance(true)}>+ Add New Leave Balance</button>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Vacation</th><th>Sick</th><th>Emergency</th><th>Special</th><th>Edit</th></tr></thead>
              <tbody>
                {leaveBalances.filter(b => b.year === new Date().getFullYear()).map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{(b as LeaveBalance & { employee?: { full_name: string } }).employee?.full_name || b.employee_id}</td>
                    <td>{b.vacation}</td>
                    <td>{b.sick}</td>
                    <td>{b.emergency}</td>
                    <td>{b.special}</td>
                    <td><button className="btn btn-ghost btn-xs" onClick={() => setEditBalance({ ...b })}>Edit</button></td>
                  </tr>
                ))}
                {leaveBalances.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No leave balance records. Run schema_patch.sql and add employees to auto-generate.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Notifications ─────────────────────────────────── */}
      {activeSection === 'notifications' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="ph"><div className="ph-title">Notifications</div></div>
          {pending.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-hd"><div className="card-title">⚠️ Pending Actions</div></div>
              <div style={{ padding: '8px 16px 16px' }}>
                {pending.slice(0, 5).map(l => (
                  <div key={l.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 10 }}>
                    <div style={{ fontWeight: 500 }}>{l.employee?.full_name} — {l.leave_type} leave ({l.days_count} days)</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--ink3)', marginTop: 2 }}>{l.start_date} to {l.end_date} · Filed {new Date(l.created_at).toLocaleDateString()}</div>
                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setReviewLeave(l)}>Review</button>
                  </div>
                ))}
              </div>
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

      {/* ══════════ MODALS ══════════ */}

      {/* Add Employee Modal */}
      <div className={`modal-ov${showAddEmployee ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddEmployee(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Add Employee</div><div className="modal-sub">Create login and employee record (HR cannot assign Administrator)</div></div>
            <button className="modal-x" onClick={() => setShowAddEmployee(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">First Name *</label><input className="form-ctrl" value={newHire.first_name} onChange={e => setNewHire(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" /></div>
              <div className="form-grp"><label className="form-lbl">Last Name *</label><input className="form-ctrl" value={newHire.last_name} onChange={e => setNewHire(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Work Email *</label><input className="form-ctrl" type="email" value={newHire.email} onChange={e => setNewHire(p => ({ ...p, email: e.target.value }))} placeholder="name@company.com" /></div>
            <div className="form-grp">
              <label className="form-lbl">Temporary Password *</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
                <input
                  className="form-ctrl"
                  type="password"
                  autoComplete="new-password"
                  value={newHire.password}
                  onChange={e => setNewHire(p => ({ ...p, password: e.target.value }))}
                  placeholder="12+ chars, mixed case, number, symbol"
                  style={{ flex: '1 1 200px', minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const pw = generateSecureTemporaryPassword()
                    setNewHire(p => ({ ...p, password: pw }))
                    showToast('Strong password generated. Share it through a secure channel.', 'success')
                  }}
                >
                  Generate secure
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!newHire.password}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(newHire.password)
                      showToast('Password copied', 'success')
                    } catch {
                      showToast('Clipboard not available', 'warn')
                    }
                  }}
                >
                  Copy
                </button>
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '.68rem', lineHeight: 1.5, color: 'var(--ink3)', listStyle: 'none' }}>
                {getTemporaryPasswordChecks(newHire.password).map(c => (
                  <li key={c.label} style={{ color: c.ok ? 'var(--ok)' : 'var(--ink3)' }}>
                    <span style={{ marginRight: 6 }}>{c.ok ? '✓' : '○'}</span>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Department *</label>
                <input
                  className="form-ctrl"
                  list="hr-hire-depts"
                  value={newHire.department}
                  onChange={e => setNewHire(p => ({ ...p, department: e.target.value }))}
                  placeholder="Type or pick from list"
                />
                <datalist id="hr-hire-depts">
                  {departments.map(d => <option key={d.id} value={d.name} />)}
                </datalist>
              </div>
              <div className="form-grp"><label className="form-lbl">System Role *</label>
                <select className="form-ctrl" value={newHire.role} onChange={e => setNewHire(p => ({ ...p, role: e.target.value as UserRole }))}>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="payroll_officer">Payroll Officer</option>
                  <option value="hr_manager">HR Manager</option>
                </select>
              </div>
            </div>
            <div className="form-grp"><label className="form-lbl">Position / Job Title</label><input className="form-ctrl" value={newHire.position} onChange={e => setNewHire(p => ({ ...p, position: e.target.value }))} placeholder="e.g. Accounting Staff" /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Hire Date *</label><input className="form-ctrl" type="date" value={newHire.hire_date} onChange={e => setNewHire(p => ({ ...p, hire_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Monthly Basic (₱)</label><input className="form-ctrl" type="number" min="0" step="0.01" value={newHire.basic_salary || ''} onChange={e => setNewHire(p => ({ ...p, basic_salary: Number(e.target.value) }))} /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleHireEmployee}>Create account &amp; employee</button>
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
                {reviewLeave.supervisor_notes && <div><strong>Supervisor Notes:</strong> {reviewLeave.supervisor_notes}</div>}
              </div>
              <div className="form-grp">
                <label className="form-lbl">HR Notes (optional)</label>
                <textarea className="form-ctrl" rows={3} value={hrNotes} onChange={e => setHrNotes(e.target.value)} placeholder="Add notes for the employee…" />
              </div>
              <div className="modal-ft" style={{ padding: 0, paddingTop: 12, background: 'none' }}>
                <button className="btn btn-danger btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'rejected')}>Reject</button>
                <button className="btn btn-ok btn-sm" onClick={() => handleLeaveAction(reviewLeave.id, 'approved')}>Approve &amp; Deduct Balance</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Employee Modal */}
      <div className={`modal-ov${showEditEmp ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowEditEmp(null) }}>
        <div className="modal-box modal-box-lg">
          <div className="modal-hd">
            <div><div className="modal-title">Edit Employee</div><div className="modal-sub">{showEditEmp?.full_name}</div></div>
            <button className="modal-x" onClick={() => setShowEditEmp(null)}>✕</button>
          </div>
          {showEditEmp && (
            <div className="modal-body">
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--ink3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>Employment Info</div>
              <div className="form-grp"><label className="form-lbl">Full Name *</label><input className="form-ctrl" value={showEditEmp.full_name} onChange={e => setShowEditEmp(p => p ? { ...p, full_name: e.target.value } : p)} /></div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Department *</label><input className="form-ctrl" value={showEditEmp.department} onChange={e => setShowEditEmp(p => p ? { ...p, department: e.target.value } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Position *</label><input className="form-ctrl" value={showEditEmp.position} onChange={e => setShowEditEmp(p => p ? { ...p, position: e.target.value } : p)} /></div>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Basic Salary</label><input className="form-ctrl" type="number" min="0" value={showEditEmp.basic_salary} onChange={e => setShowEditEmp(p => p ? { ...p, basic_salary: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Status</label>
                  <select className="form-ctrl" value={showEditEmp.status} onChange={e => setShowEditEmp(p => p ? { ...p, status: e.target.value as Employee['status'] } : p)}>
                    <option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
              <div className="form-grp"><label className="form-lbl">Employment Type</label>
                <select className="form-ctrl" value={showEditEmp.employment_type || 'regular'} onChange={e => setShowEditEmp(p => p ? { ...p, employment_type: e.target.value as Employee['employment_type'] } : p)}>
                  <option value="regular">Regular</option><option value="contractual">Contractual</option><option value="probationary">Probationary</option><option value="part_time">Part-time</option>
                </select>
              </div>
              <div className="form-grp"><label className="form-lbl">Supervisor / Reporting Manager</label>
                <select className="form-ctrl" value={showEditEmp.supervisor_id || ''} onChange={e => setShowEditEmp(p => p ? { ...p, supervisor_id: e.target.value } : p)}>
                  <option value="">No Supervisor Assigned</option>
                  {employees.filter(e => e.id !== showEditEmp.id).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name} ({e.position})</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--ink3)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Personal Info</div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Date of Birth</label><input className="form-ctrl" type="date" value={showEditEmp.date_of_birth || ''} onChange={e => setShowEditEmp(p => p ? { ...p, date_of_birth: e.target.value } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Gender</label>
                  <select className="form-ctrl" value={showEditEmp.gender || ''} onChange={e => setShowEditEmp(p => p ? { ...p, gender: e.target.value as Employee['gender'] } : p)}>
                    <option value="">Select…</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Civil Status</label>
                  <select className="form-ctrl" value={showEditEmp.civil_status || ''} onChange={e => setShowEditEmp(p => p ? { ...p, civil_status: e.target.value as Employee['civil_status'] } : p)}>
                    <option value="">Select…</option><option value="single">Single</option><option value="married">Married</option><option value="widowed">Widowed</option><option value="separated">Separated</option>
                  </select>
                </div>
                <div className="form-grp"><label className="form-lbl">Phone</label><input className="form-ctrl" value={showEditEmp.phone || ''} onChange={e => setShowEditEmp(p => p ? { ...p, phone: e.target.value } : p)} placeholder="09XXXXXXXXX" /></div>
              </div>
              <div className="form-grp"><label className="form-lbl">Address</label><input className="form-ctrl" value={showEditEmp.address || ''} onChange={e => setShowEditEmp(p => p ? { ...p, address: e.target.value } : p)} /></div>

              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--ink3)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Government IDs</div>
              <div className="form-row fr-3">
                <div className="form-grp"><label className="form-lbl">SSS No.</label><input className="form-ctrl" value={showEditEmp.sss_number || ''} onChange={e => setShowEditEmp(p => p ? { ...p, sss_number: e.target.value } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">PhilHealth No.</label><input className="form-ctrl" value={showEditEmp.philhealth_number || ''} onChange={e => setShowEditEmp(p => p ? { ...p, philhealth_number: e.target.value } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Pag-IBIG No.</label><input className="form-ctrl" value={showEditEmp.pagibig_number || ''} onChange={e => setShowEditEmp(p => p ? { ...p, pagibig_number: e.target.value } : p)} /></div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleUpdateEmployee}>Save Changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Add Leave Modal */}
      <div className={`modal-ov${showAddLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddLeave(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">New Leave Request</div><div className="modal-sub">Filed on behalf of employee</div></div>
            <button className="modal-x" onClick={() => setShowAddLeave(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Employee *</label>
              <select className="form-ctrl" value={newLeave.employee_id} onChange={e => setNewLeave(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="form-grp"><label className="form-lbl">Leave Type *</label>
              <select className="form-ctrl" value={newLeave.leave_type} onChange={e => setNewLeave(p => ({ ...p, leave_type: e.target.value }))}>
                {['vacation', 'sick', 'emergency', 'maternity', 'paternity', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date *</label><input className="form-ctrl" type="date" value={newLeave.start_date} onChange={e => setNewLeave(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date *</label><input className="form-ctrl" type="date" value={newLeave.end_date} onChange={e => setNewLeave(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Reason *</label><textarea className="form-ctrl" rows={3} value={newLeave.reason} onChange={e => setNewLeave(p => ({ ...p, reason: e.target.value }))} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAddLeave}>Submit Request</button>
          </div>
        </div>
      </div>

      {/* Add Attendance Modal */}
      <div className={`modal-ov${showAddAttendance ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddAttendance(false) }}>
        <div className="modal-box" style={{ maxWidth: 450 }}>
          <div className="modal-hd">
            <div><div className="modal-title">New Attendance Record</div><div className="modal-sub">Log attendance manually</div></div>
            <button className="modal-x" onClick={() => setShowAddAttendance(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Employee *</label>
              <select className="form-ctrl" value={newAttendance.employee_id} onChange={e => setNewAttendance(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Date *</label><input className="form-ctrl" type="date" value={newAttendance.date} onChange={e => setNewAttendance(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Status *</label>
                <select className="form-ctrl" value={newAttendance.status} onChange={e => setNewAttendance(p => ({ ...p, status: e.target.value }))}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                </select>
              </div>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Time In</label><input className="form-ctrl" type="time" value={newAttendance.time_in} onChange={e => setNewAttendance(p => ({ ...p, time_in: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">Time Out</label><input className="form-ctrl" type="time" value={newAttendance.time_out} onChange={e => setNewAttendance(p => ({ ...p, time_out: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Notes (Optional)</label><textarea className="form-ctrl" rows={2} value={newAttendance.notes} onChange={e => setNewAttendance(p => ({ ...p, notes: e.target.value }))} /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddAttendance}>Save Attendance</button>
          </div>
        </div>
      </div>

      {/* Edit Attendance Modal */}
      <div className={`modal-ov${editAttendance ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditAttendance(null) }}>
        <div className="modal-box" style={{ maxWidth: 450 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit Attendance Record</div><div className="modal-sub">{editAttendance?.employee?.full_name}</div></div>
            <button className="modal-x" onClick={() => setEditAttendance(null)}>✕</button>
          </div>
          <div className="modal-body">
            {editAttendance && (
              <>
                <div className="form-row fr-2">
                  <div className="form-grp"><label className="form-lbl">Date *</label><input className="form-ctrl" type="date" value={editAttendance.date} onChange={e => setEditAttendance(p => p ? ({ ...p, date: e.target.value }) : null)} /></div>
                  <div className="form-grp"><label className="form-lbl">Status *</label>
                    <select
                      className="form-ctrl"
                      value={editAttendance.status}
                      onChange={e =>
                        setEditAttendance(p =>
                          p ? ({ ...p, status: e.target.value as AttendanceRecord['status'] }) : null
                        )
                      }
                    >
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                </div>
                <div className="form-row fr-2">
                  <div className="form-grp"><label className="form-lbl">Time In</label><input className="form-ctrl" type="time" value={editAttendance.time_in || ''} onChange={e => setEditAttendance(p => p ? ({ ...p, time_in: e.target.value }) : null)} /></div>
                  <div className="form-grp"><label className="form-lbl">Time Out</label><input className="form-ctrl" type="time" value={editAttendance.time_out || ''} onChange={e => setEditAttendance(p => p ? ({ ...p, time_out: e.target.value }) : null)} /></div>
                </div>
                <div className="form-grp"><label className="form-lbl">Notes (Optional)</label><textarea className="form-ctrl" rows={2} value={editAttendance.notes || ''} onChange={e => setEditAttendance(p => p ? ({ ...p, notes: e.target.value }) : null)} /></div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleUpdateAttendance}>Save Changes</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Leave Balance Modal */}
      <div className={`modal-ov${showAddLeaveBalance ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddLeaveBalance(false) }}>
        <div className="modal-box" style={{ maxWidth: 450 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Add Leave Balance</div><div className="modal-sub">Initialize balances for an employee</div></div>
            <button className="modal-x" onClick={() => setShowAddLeaveBalance(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Employee *</label>
              <select className="form-ctrl" value={newLeaveBalance.employee_id} onChange={e => setNewLeaveBalance(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="form-grp"><label className="form-lbl">Year *</label><input className="form-ctrl" type="number" value={newLeaveBalance.year} onChange={e => setNewLeaveBalance(p => ({ ...p, year: Number(e.target.value) }))} /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Vacation Days</label><input className="form-ctrl" type="number" min="0" value={newLeaveBalance.vacation} onChange={e => setNewLeaveBalance(p => ({ ...p, vacation: Number(e.target.value) }))} /></div>
              <div className="form-grp"><label className="form-lbl">Sick Days</label><input className="form-ctrl" type="number" min="0" value={newLeaveBalance.sick} onChange={e => setNewLeaveBalance(p => ({ ...p, sick: Number(e.target.value) }))} /></div>
            </div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Emergency Days</label><input className="form-ctrl" type="number" min="0" value={newLeaveBalance.emergency} onChange={e => setNewLeaveBalance(p => ({ ...p, emergency: Number(e.target.value) }))} /></div>
              <div className="form-grp"><label className="form-lbl">Special Days</label><input className="form-ctrl" type="number" min="0" value={newLeaveBalance.special} onChange={e => setNewLeaveBalance(p => ({ ...p, special: Number(e.target.value) }))} /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddLeaveBalance}>Create Balance</button>
          </div>
        </div>
      </div>

      {/* Edit Leave Balance Modal */}
      <div className={`modal-ov${editBalance ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditBalance(null) }}>
        <div className="modal-box" style={{ maxWidth: 400 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit Leave Balance</div><div className="modal-sub">Year: {editBalance?.year}</div></div>
            <button className="modal-x" onClick={() => setEditBalance(null)}>✕</button>
          </div>
          {editBalance && (
            <div className="modal-body">
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Vacation Days</label><input className="form-ctrl" type="number" min="0" value={editBalance.vacation} onChange={e => setEditBalance(p => p ? { ...p, vacation: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Sick Days</label><input className="form-ctrl" type="number" min="0" value={editBalance.sick} onChange={e => setEditBalance(p => p ? { ...p, sick: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Emergency Days</label><input className="form-ctrl" type="number" min="0" value={editBalance.emergency} onChange={e => setEditBalance(p => p ? { ...p, emergency: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Special Days</label><input className="form-ctrl" type="number" min="0" value={editBalance.special} onChange={e => setEditBalance(p => p ? { ...p, special: Number(e.target.value) } : p)} /></div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleUpdateBalance}>Save Balance</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
