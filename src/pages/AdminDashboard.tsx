import React, { useState, useEffect, useCallback } from 'react'
import { supabase, logAudit, sanitizeError, exportCSV } from '../lib/supabase'
import type { Employee, Department, LeaveRequest, AuditLog, Announcement, SystemSetting, PayrollPeriod, PayrollRecord, Profile } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { SkeletonLoader } from '../components/SkeletonLoader'
import { ConfirmModal } from '../components/ConfirmModal'
import { validateRequired, validateEmail, validateDateRange, firstError } from '../lib/validation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Stats {
  totalEmployees: number
  activeDepts: number
  pendingLeavesCount: number
  pendingPayrolls: number
  totalUsers: number
}

interface AdminProps {
  activeSection: string
  onNavigate: (section: string) => void
}

const EMPTY_USER = { first_name: '', last_name: '', email: '', role: 'employee', department: '', position: '', password: '' }
const EMPTY_DEPT = { name: '', description: '' }

export function AdminDashboard({ activeSection, onNavigate }: AdminProps) {
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [stats, setStats] = useState<Stats>({ totalEmployees: 0, activeDepts: 0, pendingLeavesCount: 0, pendingPayrolls: 0, totalUsers: 0 })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [pendingPayrolls, setPendingPayrolls] = useState<PayrollPeriod[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Modals
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddDept, setShowAddDept] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [editRole, setEditRole] = useState<{ emp: Employee; role: string } | null>(null)
  const [editUser, setEditUser] = useState<Employee | null>(null)
  const [editDept, setEditDept] = useState<Department | null>(null)
  const [editLeave, setEditLeave] = useState<LeaveRequest | null>(null)
  const [reviewPeriod, setReviewPeriod] = useState<{ period: PayrollPeriod, records: (PayrollRecord & { employee?: Employee })[] } | null>(null)


  // Forms
  const [newUser, setNewUser] = useState(EMPTY_USER)
  const [editUserForm, setEditUserForm] = useState({ full_name: '', email: '', password: '', department: '', position: '', basic_salary: 0, status: 'active', hire_date: '', employee_id: '' })
  const [editLeaveForm, setEditLeaveForm] = useState({ leave_type: 'vacation', start_date: '', end_date: '', status: 'pending', reason: '', hr_notes: '' })
  const [newDept, setNewDept] = useState(EMPTY_DEPT)
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', target_role: 'all' })
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({})

  // Audit filters
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('All')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empRes, deptRes, leaveRes, auditRes, annRes, settRes, payrollRes] = await Promise.all([
      supabase.from('employees').select('*, profile:profiles(id,role)').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('name'),
      supabase.from('leave_requests').select('*, employee:employees!employee_id(*)').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*, profile:profiles(full_name,email,role)').order('created_at', { ascending: false }).limit(100),
      supabase.from('announcements').select('*, author:profiles(full_name)').order('created_at', { ascending: false }),
      supabase.from('system_settings').select('*'),
      supabase.from('payroll_periods').select('*').in('status', ['review', 'processing']).order('created_at', { ascending: false }),
    ])
    const emps = (empRes.data || []) as Employee[]
    const depts = (deptRes.data || []) as Department[]
    const leaves = (leaveRes.data || []) as LeaveRequest[]
    const logs = (auditRes.data || []) as AuditLog[]
    const anns = (annRes.data || []) as Announcement[]
    const setts = (settRes.data || []) as SystemSetting[]
    const payrolls = (payrollRes.data || []) as PayrollPeriod[]

    setEmployees(emps)
    setDepartments(depts)
    setLeaveRequests(leaves)
    setAuditLogs(logs)
    setAnnouncements(anns)
    setPendingPayrolls(payrolls)

    const settMap: Record<string, string> = {}
    setts.forEach(s => { settMap[s.key] = s.value })
    setSettings(settMap)
    setSettingsForm(settMap)
    
    const pendingCount = leaves.filter(l => l.status === 'pending').length
    setStats({ totalEmployees: emps.length, activeDepts: depts.length, pendingLeavesCount: pendingCount, pendingPayrolls: payrolls.length, totalUsers: emps.length })
    setLoading(false)
  }, [])

  // ── Add Employee + Auth User ─────────────────────────────
  async function handleAddEmployee() {
    const errs = validateRequired({ first_name: newUser.first_name, last_name: newUser.last_name, email: newUser.email, department: newUser.department })
    const emailErr = validateEmail(newUser.email)
    if (Object.keys(errs).length) { showToast(firstError(errs) || 'Please fill all required fields', 'warn'); return }
    if (emailErr) { showToast(emailErr, 'warn'); return }
    if (!newUser.password || newUser.password.length < 8) { showToast('Password must be at least 8 characters', 'warn'); return }

    // 1. Create auth user via signUp
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: newUser.email,
      password: newUser.password,
      options: { data: { full_name: `${newUser.first_name} ${newUser.last_name}`.trim(), role: newUser.role } }
    })
    if (authErr) { showToast(sanitizeError(authErr), 'error'); return }

    // 2. Update profile role (trigger creates profile with role=employee by default)
    if (authData.user) {
      await supabase.from('profiles').update({ role: newUser.role, department: newUser.department, position: newUser.position }).eq('id', authData.user.id)
    }

    // 3. Create employee record
    const { error: empErr } = await supabase.from('employees').insert({
      full_name: `${newUser.first_name} ${newUser.last_name}`.trim(),
      email: newUser.email,
      department: newUser.department,
      position: newUser.position || newUser.role.replace('_', ' '),
      employee_id: `EMP-${Date.now().toString().slice(-5)}`,
      hire_date: new Date().toISOString().split('T')[0],
      status: 'active',
      basic_salary: 0,
      profile_id: authData.user?.id || null,
    })
    if (empErr) { showToast(sanitizeError(empErr), 'error'); return }

    if (profile) await logAudit(profile.id, `Created user account: ${newUser.email}`, 'employees', undefined, null, { email: newUser.email, role: newUser.role })
    showToast('User account and employee record created', 'success')
    setShowAddUser(false)
    setNewUser(EMPTY_USER)
    fetchAll()
  }

  // ── Add Department ───────────────────────────────────────
  async function handleAddDept() {
    if (!newDept.name.trim()) { showToast('Department name is required', 'warn'); return }
    const { error } = await supabase.from('departments').insert({ name: newDept.name.trim(), description: newDept.description })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Created department: ${newDept.name}`, 'departments')
    showToast('Department created', 'success')
    setShowAddDept(false)
    setNewDept(EMPTY_DEPT)
    fetchAll()
  }

  // ── Edit Department ──────────────────────────────────────
  async function handleEditDept() {
    if (!editDept) return
    if (!editDept.name.trim()) { showToast('Department name is required', 'warn'); return }
    const { error } = await supabase.from('departments').update({ name: editDept.name.trim(), description: editDept.description }).eq('id', editDept.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Updated department: ${editDept.name}`, 'departments', editDept.id)
    showToast('Department updated', 'success')
    setEditDept(null)
    fetchAll()
  }

  // ── Delete Department ────────────────────────────────────
  async function handleDeleteDept(dept: Department) {
    const { error } = await supabase.from('departments').delete().eq('id', dept.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Deleted department: ${dept.name}`, 'departments', dept.id)
    showToast('Department deleted', 'success')
    fetchAll()
  }

  // ── Soft-delete Employee ─────────────────────────────────
  async function handleDeleteEmployee(emp: Employee) {
    const { error } = await supabase.from('employees').update({ status: 'inactive' }).eq('id', emp.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Deactivated employee: ${emp.full_name}`, 'employees', emp.id, { status: emp.status }, { status: 'inactive' })
    showToast(`${emp.full_name} has been deactivated`, 'success')
    setDeleteTarget(null)
    fetchAll()
  }

  // ── Edit Role ────────────────────────────────────────────
  async function handleEditRole() {
    if (!editRole) return
    if (!editRole.emp.profile_id) { showToast('This employee has no auth account — cannot change role', 'warn'); return }
    const { error } = await supabase.from('profiles').update({ role: editRole.role }).eq('id', editRole.emp.profile_id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Changed role to ${editRole.role} for ${editRole.emp.full_name}`, 'profiles', editRole.emp.profile_id, null, { role: editRole.role })
    showToast(`Role updated for ${editRole.emp.full_name}`, 'success')
    setEditRole(null)
    fetchAll()
  }

  // ── Edit User Credentials ────────────────────────────────
  function handleEditUserClick(emp: Employee) {
    setEditUser(emp)
    setEditUserForm({
      full_name: emp.full_name,
      email: emp.email || '',
      password: '',
      department: emp.department,
      position: emp.position,
      basic_salary: Number(emp.basic_salary) || 0,
      status: emp.status,
      hire_date: emp.hire_date,
      employee_id: emp.employee_id
    })
  }

  async function handleSaveUserCredentials() {
    if (!editUser) return
    const errs = validateRequired({ full_name: editUserForm.full_name, email: editUserForm.email, department: editUserForm.department, position: editUserForm.position })
    if (Object.keys(errs).length) { showToast('Please fill all required fields', 'warn'); return }
    if (editUserForm.email && validateEmail(editUserForm.email)) { showToast('Invalid email', 'warn'); return }

    // Update employees table
    const { error: empErr } = await supabase.from('employees').update({
      full_name: editUserForm.full_name,
      email: editUserForm.email,
      department: editUserForm.department,
      position: editUserForm.position,
      basic_salary: editUserForm.basic_salary,
      status: editUserForm.status,
      hire_date: editUserForm.hire_date,
      employee_id: editUserForm.employee_id
    }).eq('id', editUser.id)
    if (empErr) { showToast(sanitizeError(empErr), 'error'); return }

    // Update profiles table if linked
    if (editUser.profile_id) {
      await supabase.from('profiles').update({
        full_name: editUserForm.full_name,
        email: editUserForm.email
      }).eq('id', editUser.profile_id)
      if (editUserForm.password) {
        // Direct password change still requires RPC/Direct Backend access
        showToast('Password remains unchanged (requires RPC). Name, email & job details updated.', 'warn')
      } else {
        showToast('User and Employee details updated', 'success')
      }
    } else {
      showToast('Employee record updated (no linked account)', 'success')
    }

    if (profile) await logAudit(profile.id, `Updated full record for ${editUserForm.full_name}`, 'employees', editUser.id)
    setEditUser(null)
    fetchAll()
  }

  async function handleSendResetLink(email: string) {
    if (!email) { showToast('Email address is missing', 'warn'); return }
    if (!confirm(`Are you sure you want to send a password reset link to ${email}?`)) return
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    
    if (error) {
      showToast(sanitizeError(error), 'error')
    } else {
      showToast(`A secure reset link has been sent to ${email}`, 'success')
      if (profile) await logAudit(profile.id, `Initiated password reset for ${email}`, 'auth')
    }
  }

  // ── Leave Management ─────────────────────────────────────
  async function handleEditLeaveClick(leave: LeaveRequest) {
    setEditLeave(leave)
    setEditLeaveForm({
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      status: leave.status,
      reason: leave.reason || '',
      hr_notes: leave.hr_notes || ''
    })
  }

  async function handleSaveLeave() {
    if (!editLeave) return
    const dateErr = validateDateRange(editLeaveForm.start_date, editLeaveForm.end_date)
    if (dateErr) { showToast(dateErr, 'warn'); return }

    const days = Math.ceil((new Date(editLeaveForm.end_date).getTime() - new Date(editLeaveForm.start_date).getTime()) / 86400000) + 1

    const { error } = await supabase.from('leave_requests').update({
      leave_type: editLeaveForm.leave_type,
      start_date: editLeaveForm.start_date,
      end_date: editLeaveForm.end_date,
      days_count: days,
      status: editLeaveForm.status,
      reason: editLeaveForm.reason,
      hr_notes: editLeaveForm.hr_notes
    }).eq('id', editLeave.id)

    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Admin updated leave record for ${editLeave.employee?.full_name}`, 'leave_requests', editLeave.id)
    showToast('Leave record updated', 'success')
    setEditLeave(null)
    fetchAll()
  }

  async function handleDeleteLeave(id: string) {
    if (!confirm('Are you sure you want to PERMANENTLY delete this leave request?')) return
    const { error } = await supabase.from('leave_requests').delete().eq('id', id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    showToast('Leave request deleted', 'success')
    fetchAll()
  }

  // ── Save Settings ─────────────────────────────────────────
  async function handleSaveSettings() {
    setSaving(true)
    const upserts = Object.entries(settingsForm).map(([key, value]) => ({
      key, value, updated_at: new Date().toISOString()
    }))
    const { error } = await supabase.from('system_settings').upsert(upserts, { onConflict: 'key' })
    if (error) { showToast(sanitizeError(error), 'error'); setSaving(false); return }
    if (profile) await logAudit(profile.id, 'Updated system settings', 'system_settings')
    showToast('Settings saved successfully', 'success')
    setSaving(false)
    fetchAll()
  }

  // ── Broadcast ─────────────────────────────────────────────
  async function handleBroadcast() {
    const errs = validateRequired({ title: broadcastForm.title, body: broadcastForm.body })
    if (Object.keys(errs).length) { showToast('Title and message are required', 'warn'); return }
    const { error } = await supabase.from('announcements').insert({
      title: broadcastForm.title,
      body: broadcastForm.body,
      author_id: profile?.id,
      target_role: broadcastForm.target_role,
    })
    if (error) { showToast(sanitizeError(error), 'error'); return }
    if (profile) await logAudit(profile.id, `Broadcast announcement: ${broadcastForm.title}`, 'announcements')
    showToast('Announcement broadcast to all users', 'success')
    setShowBroadcast(false)
    setBroadcastForm({ title: '', body: '', target_role: 'all' })
    fetchAll()
  }

  // ── PDF Exports ──────────────────────────────────────────
  const generateHeader = (doc: jsPDF, title: string) => {
    doc.setFontSize(20)
    doc.setTextColor(30, 41, 59) // slate-800
    doc.text('HRMatrix Management Suite', 14, 22)
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139) // slate-400
    doc.text(`ADMINISTRATOR REPORT | ${title.toUpperCase()}`, 14, 28)
    doc.text(`Run Date: ${new Date().toLocaleString()}`, 14, 34)
    doc.setDrawColor(226, 232, 240) // slate-200
    doc.line(14, 40, 196, 40)
  }

  function handleExportDashboard() {
    const doc = new jsPDF()
    generateHeader(doc, 'System Overview Summary')
    const statsRows = [
      ['Total Employees', stats.totalEmployees, 'Active Departments', stats.activeDepts],
      ['Pending Leaves', stats.pendingLeavesCount, 'Pending Payrolls', stats.pendingPayrolls],
      ['Total Users', stats.totalUsers, 'System Announcements', announcements.length]
    ]
    autoTable(doc, {
      startY: 48,
      head: [['Key Metric', 'Value', 'Key Metric', 'Value']],
      body: statsRows,
      theme: 'grid',
      headStyles: { fillColor: [17, 24, 39] }
    })
    doc.save(`Admin_Dashboard_Summary_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Dashboard summary exported', 'success')
  }

  function handleExportEmployees() {
    const doc = new jsPDF()
    generateHeader(doc, 'Employee Directory Report')
    const rows = employees.map(e => [e.employee_id, e.full_name, e.department, e.position, Number(e.basic_salary).toLocaleString(), e.status])
    autoTable(doc, {
      startY: 48,
      head: [['ID', 'Name', 'Department', 'Position', 'Salary', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] }
    })
    doc.save(`Employee_Directory_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Employee directory exported', 'success')
  }

  function handleExportAuditLogs() {
    const doc = new jsPDF()
    generateHeader(doc, 'System Audit Logs')
    const logs = filteredLogs()
    const rows = logs.map(l => [new Date(l.created_at).toLocaleString(), (l.profile as any)?.full_name || 'System', l.action, l.table_name])
    autoTable(doc, {
      startY: 48,
      head: [['Timestamp', 'Actor', 'Action', 'Module']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    })
    doc.save(`Audit_Logs_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Audit log exported', 'success')
  }

  function handleExportUsersRoles() {
    const doc = new jsPDF()
    generateHeader(doc, 'Users and Role Assignment')
    const rows = employees.map(e => [e.full_name, e.email || '-', e.department || '-', (e as any).profile?.role || 'employee', e.status])
    autoTable(doc, {
      startY: 48,
      head: [['Name', 'Email', 'Department', 'Role', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    })
    doc.save(`Users_Roles_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('User roles exported', 'success')
  }

  function handleExportLeaves() {
    const doc = new jsPDF()
    generateHeader(doc, 'Organizational Leave Management')
    const rows = leaveRequests.map(l => [l.employee?.full_name || '-', l.leave_type, `${l.start_date} to ${l.end_date}`, `${l.days_count}d`, l.status])
    autoTable(doc, {
      startY: 48,
      head: [['Employee', 'Type', 'Period', 'Days', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [147, 51, 234] }
    })
    doc.save(`Leave_Management_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Leave records exported', 'success')
  }

  function handleExportPayrollSummary() {
    const doc = new jsPDF()
    generateHeader(doc, 'Payroll Review Summary')
    const rows = pendingPayrolls.map(p => [p.period_name, p.start_date, p.end_date, p.pay_date, p.status])
    autoTable(doc, {
      startY: 48,
      head: [['Period Name', 'Start Date', 'End Date', 'Pay Date', 'Status']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    })
    doc.save(`Payroll_Summary_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('Payroll summary exported', 'success')
  }

  // ── Payroll Approval ──────────────────────────────────────
  async function handleViewPayroll(period: PayrollPeriod) {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('payroll_records')
      .select('*, employee:employees(*)')
      .eq('period_id', period.id)
    setLoading(false)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    setReviewPeriod({ period, records: records as any })
  }

  async function handleApprovePayroll(period: PayrollPeriod) {
    if (!profile) return
    const { error } = await supabase.from('payroll_periods').update({ status: 'approved' }).eq('id', period.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    await supabase.from('payroll_records').update({ status: 'approved' }).eq('period_id', period.id)
    await logAudit(profile.id, `Approved payroll period: ${period.period_name}`, 'payroll_periods', period.id)
    showToast(`Payroll for ${period.period_name} approved`, 'success')
    setReviewPeriod(null)
    fetchAll()
  }

  async function handleReturnPayroll(period: PayrollPeriod) {
    if (!profile) return
    const { error } = await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', period.id)
    if (error) { showToast(sanitizeError(error), 'error'); return }
    await logAudit(profile.id, `Returned payroll period for corrections: ${period.period_name}`, 'payroll_periods', period.id)
    showToast(`Payroll ${period.period_name} returned to officer`, 'success')
    setReviewPeriod(null)
    fetchAll()
  }

  // ── Filter Audit Logs ─────────────────────────────────────
  const filteredLogs = () => {
    return auditLogs.filter(log => {
      const actor = (log.profile as { full_name?: string })?.full_name || log.user_id || ''
      const matchSearch = !auditSearch || actor.toLowerCase().includes(auditSearch.toLowerCase()) || log.action.toLowerCase().includes(auditSearch.toLowerCase())
      const matchModule = auditModule === 'All' || log.table_name.toLowerCase().includes(auditModule.toLowerCase())
      const matchFrom = !auditDateFrom || log.created_at >= auditDateFrom
      const matchTo = !auditDateTo || log.created_at <= auditDateTo + 'T23:59:59'
      return matchSearch && matchModule && matchFrom && matchTo
    })
  }

  // ── Helpers ───────────────────────────────────────────────
  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: 'badge-ok', inactive: 'badge-danger', on_leave: 'badge-warn' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s.replace('_', ' ')}</span>
  }

  const roleBadge = (r: string) => {
    const map: Record<string, string> = { admin: 'badge-danger', hr_manager: 'badge-purple', payroll_officer: 'badge-teal', supervisor: 'badge-warn', employee: 'badge-slate' }
    return <span className={`badge ${map[r] || 'badge-slate'}`}>{r.replace('_', ' ')}</span>
  }

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  const logs = filteredLogs()

  return (
    <div className="wrap">
      {/* ── Dashboard Overview ─────────────────────────────── */}
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
                <button className={`btn-refresh${loading ? ' spinning' : ''}`} onClick={fetchAll} disabled={loading} title="Refresh data">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                </button>
                <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportDashboard}>📥 Export PDF</button>
                <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', color: 'white' }} onClick={() => setShowBroadcast(true)}>
                  <span>📢</span> Broadcast
                </button>
              </div>
            </div>
          </div>

          <div className="adm-stats-row">
            <div className="adm-stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('users')}><div className="adm-stat-lbl">Total Employees</div><div className="adm-stat-val">{stats.totalEmployees}</div><div className="adm-stat-sub" style={{ color: '#10b981' }}>Active records</div></div>
            <div className="adm-stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('departments')}><div className="adm-stat-lbl">Departments</div><div className="adm-stat-val">{stats.activeDepts}</div><div className="adm-stat-sub">Across the org</div></div>
            <div className="adm-stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('leaves')}><div className="adm-stat-lbl">Pending Leaves</div><div className="adm-stat-val">{stats.pendingLeavesCount}</div><div className="adm-stat-sub">Awaiting action</div></div>
            <div className="adm-stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('notifications')}><div className="adm-stat-lbl">Announcements</div><div className="adm-stat-val">{announcements.length}</div><div className="adm-stat-sub">Total broadcasts</div></div>
            <div className="adm-stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('audit')}><div className="adm-stat-lbl">Audit Events</div><div className="adm-stat-val">{auditLogs.length}</div><div className="adm-stat-sub">Logged actions</div></div>
            <div className="adm-stat-tile"><div className="adm-stat-lbl">System Alerts</div><div className="adm-stat-val">0</div><div className="adm-stat-sub" style={{ color: '#10b981' }}>All clear</div></div>
          </div>

          <div className="adm-card" style={{ marginBottom: 20, marginTop: 20, padding: 20 }}>
            <div className="adm-card-hd"><span className="adm-card-title">System Metrics Overview</span></div>
            <div style={{ height: 300, width: '100%', marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Employees', value: stats.totalEmployees, fill: '#3b82f6' },
                  { name: 'Departments', value: stats.activeDepts, fill: '#10b981' },
                  { name: 'Pending Leaves', value: stats.pendingLeavesCount, fill: '#f59e0b' },
                  { name: 'Pending Payrolls', value: stats.pendingPayrolls, fill: '#8b5cf6' }
                ]} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="adm-section-title">Quick Actions</div>
          <div className="adm-quick-grid">
            <div className="adm-action-tile" onClick={() => setShowAddUser(true)}><div className="adm-action-icon">👤</div><div><div className="adm-action-title">Add User</div><div className="adm-action-desc">Create account and assign role</div></div></div>
            <div className="adm-action-tile" onClick={() => setShowAddDept(true)}><div className="adm-action-icon">🏢</div><div><div className="adm-action-title">New Department</div><div className="adm-action-desc">Add or configure a department</div></div></div>
            <div className="adm-action-tile" onClick={() => setShowBroadcast(true)}><div className="adm-action-icon">📢</div><div><div className="adm-action-title">Broadcast</div><div className="adm-action-desc">Send system-wide announcement</div></div></div>
            <div className="adm-action-tile" onClick={() => onNavigate('leaves')}><div className="adm-action-icon">📋</div><div><div className="adm-action-title">Review Leave</div><div className="adm-action-desc">{stats.pendingLeavesCount} requests awaiting action</div></div></div>
            <div className="adm-action-tile" onClick={() => onNavigate('payroll')}><div className="adm-action-icon">💰</div><div><div className="adm-action-title">Review Payroll</div><div className="adm-action-desc">{stats.pendingPayrolls} periods for review</div></div></div>
            <div className="adm-action-tile" onClick={() => onNavigate('audit')}><div className="adm-action-icon">📜</div><div><div className="adm-action-title">Audit Logs</div><div className="adm-action-desc">View recent system actions</div></div></div>
            <div className="adm-action-tile" onClick={() => onNavigate('settings')}><div className="adm-action-icon">⚙️</div><div><div className="adm-action-title">System Settings</div><div className="adm-action-desc">Configure work hours &amp; policies</div></div></div>
          </div>

          <div className="adm-main-grid">
            <div className="adm-card">
              <div className="adm-card-hd">
                <div><span className="adm-card-title">Recent Activity</span><span className="adm-card-sub">From audit log</span></div>
                <button className="btn btn-ghost btn-sm" style={{ color: '#3b82f6', fontSize: '.72rem' }} onClick={() => onNavigate('audit')}>View all →</button>
              </div>
              <div className="adm-feed">
                {auditLogs.slice(0, 6).map(log => (
                  <div className="adm-feed-item" key={log.id}>
                    <div className="adm-feed-icon" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>📋</div>
                    <div className="adm-feed-info">
                      <div><strong>{(log.profile as { full_name?: string })?.full_name || 'System'}</strong> — {log.action}</div>
                      <div className="adm-feed-date">{new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: '.82rem' }}>No audit log entries yet. Actions will be recorded here.</div>
                )}
              </div>
            </div>

            <div>
              <div className="adm-section-title">System Config</div>
              <div className="adm-card" style={{ padding: '4px 16px 16px' }}>
                <div className="adm-card-hd" style={{ padding: '12px 0 8px', borderBottom: 'none' }}><div className="adm-card-title" style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>Current Settings</div></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Company</span><span className="adm-config-val">{settings.company_name || 'San Isidro LGU'}</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Work Hours</span><span className="adm-config-val">{settings.work_start || '8:00'} – {settings.work_end || '17:00'}</span></div>
                <div className="adm-config-row"><span className="adm-config-lbl">Grace Period</span><span className="adm-config-val">{settings.grace_period_minutes || '10'} minutes</span></div>
                <div className="adm-config-row" style={{ borderBottom: 'none' }}><span className="adm-config-lbl">OT Multiplier</span><span className="adm-config-val">{settings.ot_multiplier || '1.25'}x</span></div>
              </div>

              {stats.pendingLeavesCount > 0 && (
                <div className="adm-card" style={{ marginBottom: 16 }}>
                  <div className="adm-card-hd"><span className="adm-card-title">📋 Recent Pending Leaves</span></div>
                  <div style={{ padding: '8px 16px 16px' }}>
                    {leaveRequests.filter(l => l.status === 'pending').slice(0, 5).map(l => (
                      <div key={l.id} className="adm-feed-item">
                        <div className="adm-feed-icon" style={{ background: '#fff7ed', color: '#f97316' }}>📋</div>
                        <div className="adm-feed-info">
                          <div><strong>{l.employee?.full_name}</strong> filed a <strong>{l.leave_type}</strong> leave ({l.days_count} days)</div>
                          <div className="adm-feed-date">{new Date(l.created_at).toLocaleDateString()}</div>
                        </div>
                        <button className="btn btn-outline btn-xs" onClick={() => onNavigate('leaves')} style={{ marginLeft: 'auto', border: '1px solid var(--line)' }}>Review</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pendingPayrolls.length > 0 && (
                <div className="adm-alert" style={{ marginTop: 16, background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                  <span className="adm-alert-icon">💰</span>
                  <div className="adm-alert-text" style={{ color: '#065f46' }}>
                    <strong>{pendingPayrolls.length} Pending Payroll{pendingPayrolls.length > 1 ? 's' : ''}</strong><br />
                    Periods awaiting admin approval.
                  </div>
                  <button className="btn btn-xs btn-primary" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('payroll')}>Review</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Notifications ──────────────────────────────────── */}
      {activeSection === 'notifications' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="ph"><div className="ph-title">Notifications</div><div className="ph-sub">System announcements and pending actions</div></div>
          {stats.pendingLeavesCount > 0 && (
            <div className="adm-card" style={{ marginBottom: 16 }}>
              <div className="adm-card-hd"><span className="adm-card-title">⚠️ Pending Actions</span></div>
              <div style={{ padding: '8px 16px 16px' }}>
                {leaveRequests.filter(l => l.status === 'pending').map(l => (
                  <div key={l.id} className="adm-feed-item">
                    <div className="adm-feed-icon" style={{ background: '#fff7ed', color: '#f97316' }}>📋</div>
                    <div className="adm-feed-info">
                      <div><strong>{l.employee?.full_name}</strong> filed a <strong>{l.leave_type}</strong> leave ({l.days_count} days)</div>
                      <div className="adm-feed-date">{new Date(l.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingPayrolls.length > 0 && (
            <div className="adm-card" style={{ marginBottom: 16 }}>
              <div className="adm-card-hd"><span className="adm-card-title">💰 Pending Payroll Approvals</span></div>
              <div style={{ padding: '8px 16px 16px' }}>
                {pendingPayrolls.map(p => (
                  <div key={p.id} className="adm-feed-item">
                    <div className="adm-feed-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>💵</div>
                    <div className="adm-feed-info">
                      <div>Payroll period <strong>{p.period_name}</strong> is awaiting your approval.</div>
                      <div className="adm-feed-date">{p.start_date} – {p.end_date}</div>
                    </div>
                    <button className="btn btn-outline btn-xs" onClick={() => onNavigate('payroll')} style={{ marginLeft: 'auto', border: '1px solid var(--line)' }}>Review</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="adm-card">
            <div className="adm-card-hd"><span className="adm-card-title">📢 Announcements</span></div>
            <div style={{ padding: '8px 16px 16px' }}>
              {announcements.map(a => (
                <div key={a.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--ink2)', marginBottom: 4 }}>{a.body}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--ink3)' }}>
                    By {(a.author as { full_name?: string })?.full_name || 'Admin'} · {new Date(a.created_at).toLocaleString()} · Target: {a.target_role}
                  </div>
                </div>
              ))}
              {announcements.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>No announcements yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Logs ─────────────────────────────────────── */}
      {activeSection === 'audit' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="audit-header">
            <div>
              <div className="audit-bc">ADMINISTRATION / <strong>Audit Logs</strong></div>
              <div className="audit-title">Audit Logs</div>
              <div className="audit-desc">All system actions, tagged by user and timestamp.</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportAuditLogs}>📥 Export PDF</button>
          </div>
          <div className="audit-filters-row">
            <div className="audit-search-wrap">
              <input className="audit-search-input" placeholder="Search actor or action…" value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
            </div>
            <select className="audit-select" value={auditModule} onChange={e => setAuditModule(e.target.value)}>
              <option value="All">All Tables</option>
              <option value="employees">Employees</option>
              <option value="leave_requests">Leave</option>
              <option value="payroll">Payroll</option>
              <option value="profiles">Users</option>
              <option value="departments">Departments</option>
              <option value="system_settings">Settings</option>
              <option value="announcements">Announcements</option>
            </select>
            <input type="date" className="audit-date-input" value={auditDateFrom} onChange={e => setAuditDateFrom(e.target.value)} />
            <input type="date" className="audit-date-input" value={auditDateTo} onChange={e => setAuditDateTo(e.target.value)} />
          </div>
          <div className="card">
            <div className="audit-table-meta">
              <div className="audit-table-title">System Log</div>
              <div className="audit-table-count">Showing {logs.length} entries</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>TIMESTAMP</th><th>ACTOR</th><th>ACTION</th><th>TABLE</th><th>RECORD</th></tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--ink3)', fontSize: '.75rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 500, fontSize: '.78rem' }}>{(log.profile as { full_name?: string })?.full_name || '—'}</td>
                      <td style={{ fontSize: '.78rem' }}>{log.action}</td>
                      <td><span className="audit-chip">{log.table_name}</span></td>
                      <td style={{ fontSize: '.72rem', color: 'var(--ink3)', fontFamily: 'monospace' }}>{log.record_id?.slice(0, 8) || '—'}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No audit log entries match your filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Users & Roles ──────────────────────────────────── */}
      {activeSection === 'users' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card-hd" style={{ padding: '0 0 16px' }}>
            <div><div className="card-title" style={{ fontSize: '1.1rem' }}>Users &amp; Roles</div><div className="card-sub">{employees.length} employee records</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportUsersRoles}>📥 Export PDF</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>+ Add User</button>
            </div>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Full Name</th><th>Email</th><th>Department</th><th>Status</th><th>Role</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}><div>{e.full_name}</div><div style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{e.employee_id}</div></td>
                      <td style={{ color: 'var(--ink3)', fontSize: '.78rem' }}>{e.email || '—'}</td>
                      <td>{e.department || '—'}</td>
                      <td>{statusBadge(e.status)}</td>
                      <td>
                        {e.profile_id
                          ? roleBadge((e as Employee & { profile?: Pick<Profile, 'role'> }).profile?.role || 'employee')
                          : <span className="badge badge-slate">no account</span>}
                      </td>
                      <td style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleEditUserClick(e)}>Edit User</button>
                        {e.profile_id && (
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditRole({ emp: e, role: (e as Employee & { profile?: Pick<Profile, 'role'> }).profile?.role || 'employee' })}>Edit Role</button>
                        )}
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(e)}>
                          {e.status === 'inactive' ? 'Inactive' : '🗑️'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Departments ────────────────────────────────────── */}
      {activeSection === 'departments' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card-hd" style={{ padding: '0 0 16px' }}>
            <div><div className="card-title" style={{ fontSize: '1.1rem' }}>Departments</div><div className="card-sub">{departments.length} departments</div></div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddDept(true)}>+ New Department</button>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Description</th><th style={{ textAlign: 'right' }}>Employees</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td style={{ color: 'var(--ink3)', fontSize: '.8rem' }}>{d.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{employees.filter(e => e.department === d.name).length}</td>
                      <td style={{ textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditDept({ ...d })}>Edit</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteDept(d)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── System Settings ───────────────────────────────── */}
      {activeSection === 'settings' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card">
            <div className="card-hd"><div className="card-title">System Settings</div><div className="card-sub">Changes are saved to the database</div></div>
            <div className="card-body">
              <div className="form-row fr-2" style={{ marginBottom: 16 }}>
                <div className="form-grp"><label className="form-lbl">Company Name</label><input className="form-ctrl" value={settingsForm.company_name || ''} onChange={e => setSettingsForm(p => ({ ...p, company_name: e.target.value }))} /></div>
              </div>
              <div className="form-row fr-2" style={{ marginBottom: 16 }}>
                <div className="form-grp"><label className="form-lbl">Work Start Time</label><input type="time" className="form-ctrl" value={settingsForm.work_start || '08:00'} onChange={e => setSettingsForm(p => ({ ...p, work_start: e.target.value }))} /></div>
                <div className="form-grp"><label className="form-lbl">Work End Time</label><input type="time" className="form-ctrl" value={settingsForm.work_end || '17:00'} onChange={e => setSettingsForm(p => ({ ...p, work_end: e.target.value }))} /></div>
              </div>
              <div className="form-row fr-2" style={{ marginBottom: 20 }}>
                <div className="form-grp"><label className="form-lbl">Grace Period (minutes)</label><input type="number" className="form-ctrl" min="0" max="60" value={settingsForm.grace_period_minutes || '10'} onChange={e => setSettingsForm(p => ({ ...p, grace_period_minutes: e.target.value }))} /></div>
                <div className="form-grp"><label className="form-lbl">OT Multiplier</label><input type="number" step="0.05" min="1" max="3" className="form-ctrl" value={settingsForm.ot_multiplier || '1.25'} onChange={e => setSettingsForm(p => ({ ...p, ot_multiplier: e.target.value }))} /></div>
              </div>
              <button className="btn btn-primary" disabled={saving} onClick={handleSaveSettings}>
                {saving ? 'Saving…' : '💾 Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Employees Management ────────────────────────────── */}
      {activeSection === 'employees' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card-hd" style={{ padding: '0 0 16px' }}>
            <div><div className="card-title" style={{ fontSize: '1.1rem' }}>Employee Directory</div><div className="card-sub">{employees.length} records in database</div></div>
            <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportEmployees}>📥 Export PDF</button>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Details</th><th>Dept</th><th>Position</th><th>Salary</th><th>Status</th><th>Hire Date</th><th>Edit</th></tr></thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{e.full_name}</span>
                          <span style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>{e.email}</span>
                          <span style={{ fontSize: '.68rem', color: 'var(--ink3)', fontFamily: 'monospace' }}>{e.employee_id}</span>
                        </div>
                      </td>
                      <td>{e.department}</td>
                      <td>{e.position}</td>
                      <td style={{ fontWeight: 500 }}>₱{Number(e.basic_salary).toLocaleString()}</td>
                      <td>{statusBadge(e.status)}</td>
                      <td style={{ color: 'var(--ink3)', fontSize: '.78rem' }}>{e.hire_date}</td>
                      <td><button className="btn btn-ghost btn-xs" onClick={() => handleEditUserClick(e)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Management portal ────────────────────────── */}
      {activeSection === 'leaves' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card-hd" style={{ padding: '0 0 16px' }}>
            <div><div className="card-title" style={{ fontSize: '1.1rem' }}>Organizational Leave Management</div><div className="card-sub">Admin view — {stats.pendingLeavesCount} pending / {leaveRequests.length} total</div></div>
            <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportLeaves}>📥 Export PDF</button>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {leaveRequests.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.employee?.full_name || '—'}</td>
                      <td><span className="badge badge-purple">{l.leave_type}</span></td>
                      <td style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>{l.start_date} – {l.end_date}</td>
                      <td>{l.days_count}d</td>
                      <td>{statusBadge(l.status === 'pending' ? 'on_leave' : l.status === 'approved' ? 'active' : 'inactive')} <span style={{ marginLeft: 4, fontWeight: 600 }}>{l.status}</span></td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleEditLeaveClick(l)}>Edit</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteLeave(l.id)}>Del</button>
                      </td>
                    </tr>
                  ))}
                  {leaveRequests.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No records found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Payroll (admin approval view) ─────────────────────── */}
      {activeSection === 'payroll' && (
        <div style={{ animation: 'fadeIn .3s ease-out' }}>
          <div className="card-hd" style={{ padding: '0 0 16px' }}>
            <div>
              <div className="card-title" style={{ fontSize: '1.1rem' }}>Payroll Approval</div>
              <div className="card-sub">{pendingPayrolls.length} period{pendingPayrolls.length !== 1 ? 's' : ''} awaiting review</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--line)' }} onClick={handleExportPayrollSummary}>📥 Export PDF</button>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Period Name</th><th>Dates</th><th>Pay Date</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {pendingPayrolls.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.period_name}</td>
                      <td style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>{p.start_date} – {p.end_date}</td>
                      <td>{p.pay_date}</td>
                      <td>
                        {p.status === 'review'
                          ? <span className="badge badge-purple">Pending Admin Review</span>
                          : <span className="badge badge-warn">{p.status}</span>}
                      </td>
                      <td style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {p.status === 'review' && (
                          <button className="btn btn-primary btn-xs" onClick={() => handleViewPayroll(p)}>Review Details</button>
                        )}
                        {p.status === 'processing' && (
                          <span style={{ fontSize: '.72rem', color: 'var(--ink3)', fontStyle: 'italic' }}>Officer processing…</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pendingPayrolls.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No payroll periods pending approval.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODALS ══════════ */}

      {/* Add User Modal */}
      <div className={`modal-ov${showAddUser ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddUser(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Add New User / Employee</div><div className="modal-sub">Creates auth account + employee record</div></div>
            <button className="modal-x" onClick={() => setShowAddUser(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">First Name *</label><input className="form-ctrl" value={newUser.first_name} onChange={e => setNewUser(p => ({ ...p, first_name: e.target.value }))} placeholder="First name" /></div>
              <div className="form-grp"><label className="form-lbl">Last Name *</label><input className="form-ctrl" value={newUser.last_name} onChange={e => setNewUser(p => ({ ...p, last_name: e.target.value }))} placeholder="Last name" /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Email *</label><input className="form-ctrl" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="email@company.com" /></div>
            <div className="form-grp"><label className="form-lbl">Temporary Password *</label><input className="form-ctrl" type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Min. 8 chars, 1 uppercase, 1 number" /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Department *</label>
                <select className="form-ctrl" value={newUser.department} onChange={e => setNewUser(p => ({ ...p, department: e.target.value }))}>
                  <option value="">Select Dept…</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-grp"><label className="form-lbl">System Role</label>
                <select className="form-ctrl" value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="hr_manager">HR Manager</option>
                  <option value="payroll_officer">Payroll Officer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>
            <div className="form-grp"><label className="form-lbl">Position / Job Title</label><input className="form-ctrl" value={newUser.position} onChange={e => setNewUser(p => ({ ...p, position: e.target.value }))} placeholder="e.g. Senior Engineer" /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddEmployee}>Create Account &amp; Employee Record</button>
          </div>
        </div>
      </div>

      {/* Edit Role Modal */}
      <div className={`modal-ov${editRole ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditRole(null) }}>
        <div className="modal-box" style={{ maxWidth: 380 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Change System Role</div><div className="modal-sub">{editRole?.emp.full_name}</div></div>
            <button className="modal-x" onClick={() => setEditRole(null)}>✕</button>
          </div>
          {editRole && (
            <div className="modal-body">
              <div className="form-grp"><label className="form-lbl">New Role</label>
                <select className="form-ctrl" value={editRole.role} onChange={e => setEditRole(p => p ? { ...p, role: e.target.value } : null)}>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="hr_manager">HR Manager</option>
                  <option value="payroll_officer">Payroll Officer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleEditRole}>Save Role</button>
            </div>
          )}
        </div>
      </div>

      {/* Edit User Credentials Modal */}
      <div className={`modal-ov${editUser ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditUser(null) }}>
        <div className="modal-box" style={{ maxWidth: 400 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit User Details</div><div className="modal-sub">{editUser?.full_name}</div></div>
            <button className="modal-x" onClick={() => setEditUser(null)}>✕</button>
          </div>
          {editUser && (
            <div className="modal-body">
              <div className="form-grp"><label className="form-lbl">Full Name *</label><input className="form-ctrl" value={editUserForm.full_name} onChange={e => setEditUserForm(p => ({ ...p, full_name: e.target.value }))} /></div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Email Address *</label><input type="email" className="form-ctrl" value={editUserForm.email} onChange={e => setEditUserForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="form-grp"><label className="form-lbl">Employee ID</label><input className="form-ctrl" value={editUserForm.employee_id} onChange={e => setEditUserForm(p => ({ ...p, employee_id: e.target.value }))} /></div>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Department *</label>
                  <select className="form-ctrl" value={editUserForm.department} onChange={e => setEditUserForm(p => ({ ...p, department: e.target.value }))}>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-grp"><label className="form-lbl">Position *</label><input className="form-ctrl" value={editUserForm.position} onChange={e => setEditUserForm(p => ({ ...p, position: e.target.value }))} /></div>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Monthly Basic Salary</label><input type="number" className="form-ctrl" value={editUserForm.basic_salary} onChange={e => setEditUserForm(p => ({ ...p, basic_salary: Number(e.target.value) }))} /></div>
                <div className="form-grp"><label className="form-lbl">Status</label>
                  <select className="form-ctrl" value={editUserForm.status} onChange={e => setEditUserForm(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
              <div className="form-grp"><label className="form-lbl">Hire Date</label><input type="date" className="form-ctrl" value={editUserForm.hire_date} onChange={e => setEditUserForm(p => ({ ...p, hire_date: e.target.value }))} /></div>
              
              <div className="form-grp" style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <label className="form-lbl">Security &amp; Password</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '.75rem', color: 'var(--ink2)', marginBottom: 8 }}>To change this user's password, you must trigger a secure reset verification via their registered email.</div>
                  <button type="button" className="btn btn-ghost btn-xs" style={{ width: '100%', borderColor: 'var(--line)', background: 'white' }} 
                    onClick={() => handleSendResetLink(editUserForm.email)}>
                    📧 Send Reset Password Link
                  </button>
                </div>
              </div>
              
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleSaveUserCredentials}>Save All Changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Add Dept Modal */}
      <div className={`modal-ov${showAddDept ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowAddDept(false) }}>
        <div className="modal-box" style={{ maxWidth: 400 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Add New Department</div></div>
            <button className="modal-x" onClick={() => setShowAddDept(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Department Name *</label><input className="form-ctrl" value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Finance" /></div>
            <div className="form-grp"><label className="form-lbl">Description</label><textarea className="form-ctrl" value={newDept.description} onChange={e => setNewDept(p => ({ ...p, description: e.target.value }))} placeholder="What does this department do?" /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleAddDept}>Create Department</button>
          </div>
        </div>
      </div>

      {/* Edit Dept Modal */}
      <div className={`modal-ov${editDept ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditDept(null) }}>
        <div className="modal-box" style={{ maxWidth: 400 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit Department</div></div>
            <button className="modal-x" onClick={() => setEditDept(null)}>✕</button>
          </div>
          {editDept && (
            <div className="modal-body">
              <div className="form-grp"><label className="form-lbl">Department Name *</label><input className="form-ctrl" value={editDept.name} onChange={e => setEditDept(p => p ? { ...p, name: e.target.value } : null)} /></div>
              <div className="form-grp"><label className="form-lbl">Description</label><textarea className="form-ctrl" value={editDept.description || ''} onChange={e => setEditDept(p => p ? { ...p, description: e.target.value } : null)} /></div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleEditDept}>Save Changes</button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Leave Modal */}
      <div className={`modal-ov${editLeave ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditLeave(null) }}>
        <div className="modal-box" style={{ maxWidth: 450 }}>
          <div className="modal-hd">
            <div><div className="modal-title">Edit Leave Record</div><div className="modal-sub">{editLeave?.employee?.full_name}</div></div>
            <button className="modal-x" onClick={() => setEditLeave(null)}>✕</button>
          </div>
          {editLeave && (
            <div className="modal-body">
              <div className="form-grp"><label className="form-lbl">Leave Type</label>
                <select className="form-ctrl" value={editLeaveForm.leave_type} onChange={e => setEditLeaveForm(p => ({ ...p, leave_type: e.target.value }))}>
                  {['vacation','sick','emergency','maternity','paternity','other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row fr-2">
                <div className="form-grp"><label className="form-lbl">Start Date</label><input type="date" className="form-ctrl" value={editLeaveForm.start_date} onChange={e => setEditLeaveForm(p => ({ ...p, start_date: e.target.value }))} /></div>
                <div className="form-grp"><label className="form-lbl">End Date</label><input type="date" className="form-ctrl" value={editLeaveForm.end_date} onChange={e => setEditLeaveForm(p => ({ ...p, end_date: e.target.value }))} /></div>
              </div>
              <div className="form-grp"><label className="form-lbl">Status</label>
                <select className="form-ctrl" value={editLeaveForm.status} onChange={e => setEditLeaveForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="pending">Pending</option>
                  <option value="supervisor_approved">Supervisor Approved</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="form-grp"><label className="form-lbl">Employee Reason</label><textarea className="form-ctrl" rows={2} value={editLeaveForm.reason} onChange={e => setEditLeaveForm(p => ({ ...p, reason: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">HR/Admin Notes</label><textarea className="form-ctrl" rows={2} value={editLeaveForm.hr_notes} onChange={e => setEditLeaveForm(p => ({ ...p, hr_notes: e.target.value }))} /></div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleSaveLeave}>Save Leave Details</button>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast Modal */}
      <div className={`modal-ov${showBroadcast ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowBroadcast(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">📢 Broadcast Announcement</div><div className="modal-sub">Visible to all users on their notifications page</div></div>
            <button className="modal-x" onClick={() => setShowBroadcast(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Title *</label><input className="form-ctrl" value={broadcastForm.title} onChange={e => setBroadcastForm(p => ({ ...p, title: e.target.value }))} placeholder="Announcement title" /></div>
            <div className="form-grp"><label className="form-lbl">Message *</label><textarea className="form-ctrl" rows={4} value={broadcastForm.body} onChange={e => setBroadcastForm(p => ({ ...p, body: e.target.value }))} placeholder="Write your announcement here…" /></div>
            <div className="form-grp"><label className="form-lbl">Target Audience</label>
              <select className="form-ctrl" value={broadcastForm.target_role} onChange={e => setBroadcastForm(p => ({ ...p, target_role: e.target.value }))}>
                <option value="all">All Users</option>
                <option value="employee">Employees Only</option>
                <option value="hr_manager">HR Managers</option>
                <option value="supervisor">Supervisors</option>
                <option value="payroll_officer">Payroll Officers</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleBroadcast}>📢 Broadcast Now</button>
          </div>
        </div>
      </div>

      {/* Review Payroll Period Modal */}
      {reviewPeriod && (
        <div className="modal-ov active" onClick={e => { if (e.target === e.currentTarget) setReviewPeriod(null) }}>
          <div className="modal-box modal-box-lg" style={{ maxWidth: 800 }}>
            <div className="modal-hd">
              <div>
                <div className="modal-title">Review Payroll Period</div>
                <div className="modal-sub">{reviewPeriod.period.period_name} ({reviewPeriod.period.start_date} to {reviewPeriod.period.end_date})</div>
              </div>
              <button className="modal-x" onClick={() => setReviewPeriod(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Employee</th><th>Basic Pay</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th></tr></thead>
                  <tbody>
                    {reviewPeriod.records.map(r => {
                      const deductions = Number(r.sss_contribution) + Number(r.philhealth_contribution) + Number(r.pagibig_contribution) + Number(r.withholding_tax) + Number(r.other_deductions)
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.employee?.full_name || r.employee_id}</td>
                          <td>₱{Number(r.basic_salary).toLocaleString()}</td>
                          <td>₱{Number(r.gross_pay).toLocaleString()}</td>
                          <td style={{ color: 'var(--danger)' }}>-₱{deductions.toLocaleString()}</td>
                          <td style={{ fontWeight: 600 }}>₱{Number(r.net_pay).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                    {reviewPeriod.records.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 16 }}>No records calculated for this period yet.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleReturnPayroll(reviewPeriod.period)}>Return for Correction</button>
                <button className="btn btn-ok" onClick={() => handleApprovePayroll(reviewPeriod.period)}>Approve Payroll</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Deactivate Employee"
        message={`Are you sure you want to deactivate ${deleteTarget?.full_name}? Their account and records will be preserved but they will no longer be treated as an active employee.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={() => deleteTarget && handleDeleteEmployee(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
