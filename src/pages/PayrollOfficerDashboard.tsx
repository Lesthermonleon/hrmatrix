import React, { useState, useEffect } from 'react'
import { supabase, fetchAllPaged } from '../lib/supabase'
import type { Employee, PayrollPeriod, PayrollRecord, AttendanceRecord, LeaveRequest, LeaveBalance, Announcement } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { useTheme } from '../context/ThemeContext'
import { getChartTheme } from '../lib/chartTheme'
import { SkeletonLoader } from '../components/SkeletonLoader'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  parseSettingsForPayroll,
  computeAttendanceTimeAdjustments,
  computeLeaveDeductionsSil,
  dailyRateFromMonthly,
  hourlyRateFromMonthly,
  basicEarnedForPayPeriod,
  expandApprovedLeaveCalendarDays,
} from '../lib/payrollPh'

// ── 2025 Philippine Government Contribution Tables ──

function computeSSS(monthly: number): number {
  // 2025 SSS Employee Contribution Table (simplified brackets)
  const brackets: [number, number][] = [
    [4250, 180], [4749.99, 202.50], [5249.99, 225], [5749.99, 247.50],
    [6249.99, 270], [6749.99, 292.50], [7249.99, 315], [7749.99, 337.50],
    [8249.99, 360], [8749.99, 382.50], [9249.99, 405], [9749.99, 427.50],
    [10249.99, 450], [10749.99, 472.50], [11249.99, 495], [11749.99, 517.50],
    [12249.99, 540], [12749.99, 562.50], [13249.99, 585], [13749.99, 607.50],
    [14249.99, 630], [14749.99, 652.50], [15249.99, 675], [15749.99, 697.50],
    [16249.99, 720], [16749.99, 742.50], [17249.99, 765], [17749.99, 787.50],
    [18249.99, 810], [18749.99, 832.50], [19249.99, 855], [19749.99, 877.50],
    [20249.99, 900], [20749.99, 922.50], [21249.99, 945], [21749.99, 967.50],
    [22249.99, 990], [22749.99, 1012.50], [23249.99, 1035], [23749.99, 1057.50],
    [24249.99, 1080], [24749.99, 1102.50], [25249.99, 1125], [29749.99, 1125],
    [Infinity, 1350],
  ]
  if (monthly < 4250) return 180
  for (const [ceil, contrib] of brackets) {
    if (monthly <= ceil) return contrib
  }
  return 1350
}

function computePhilHealth(monthly: number): number {
  // 2025: 5% premium rate, split 50/50 employer-employee
  // Floor ₱10,000 ceiling ₱100,000
  const base = Math.max(10000, Math.min(monthly, 100000))
  return parseFloat((base * 0.05 / 2).toFixed(2))
}

function computePagIBIG(monthly: number): number {
  // Employee rate: 2% of monthly salary, max ₱200/month (for salaries ≥₱5,000)
  if (monthly <= 1500) return parseFloat((monthly * 0.01).toFixed(2))
  return Math.min(parseFloat((monthly * 0.02).toFixed(2)), 200)
}

function computeWithholdingTax(taxableIncome: number): number {
  // 2025 BIR Monthly Withholding Tax Table (TRAIN Law)
  if (taxableIncome <= 20833) return 0
  if (taxableIncome <= 33332) return parseFloat(((taxableIncome - 20833) * 0.15).toFixed(2))
  if (taxableIncome <= 66666) return parseFloat((1875 + (taxableIncome - 33333) * 0.20).toFixed(2))
  if (taxableIncome <= 166666) return parseFloat((8541.80 + (taxableIncome - 66667) * 0.25).toFixed(2))
  if (taxableIncome <= 666666) return parseFloat((33541.80 + (taxableIncome - 166667) * 0.30).toFixed(2))
  return parseFloat((183541.80 + (taxableIncome - 666667) * 0.35).toFixed(2))
}

interface PayrollProps {
  activeSection: string
  onNavigate: (section: string) => void
}

export function PayrollOfficerDashboard({ activeSection, onNavigate }: PayrollProps) {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<(PayrollRecord & { employee?: Employee })[]>([])
  const [activePeriod, setActivePeriod] = useState<PayrollPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewPeriod, setShowNewPeriod] = useState(false)
  const [showEditRecord, setShowEditRecord] = useState<(PayrollRecord & { employee?: Employee }) | null>(null)
  const [newPeriod, setNewPeriod] = useState({ period_name: '', start_date: '', end_date: '', pay_date: '' })
  const { showToast } = useToast()
  const { theme } = useTheme()
  const chart = getChartTheme(theme)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => { fetchAll() }, [])

  // When user navigates to "Payroll Records", ensure we have a period selected
  // and trigger a fetch (fetchAll() only runs once on mount).
  useEffect(() => {
    if (loading) return
    if (activeSection !== 'records') return
    if (periods.length === 0) return
    if (!activePeriod) {
      setActivePeriod(periods[0])
      fetchRecords(periods[0].id)
      return
    }
    fetchRecords(activePeriod.id)
  }, [activeSection, loading, periods.length, activePeriod?.id])

  async function fetchAll() {
    setLoading(true)
    const [periodRes, empPaged, annRes] = await Promise.all([
      supabase.from('payroll_periods').select('*').order('created_at', { ascending: false }),
      fetchAllPaged<Employee>(async (from, to) =>
        supabase.from('employees').select('*').eq('status', 'active').order('full_name').range(from, to),
      ),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
    ])

    if (periodRes.error) showToast(`Payroll periods: ${periodRes.error.message}`, 'error')
    if (empPaged.error) showToast(`Employees: ${empPaged.error.message}`, 'error')
    if (annRes.error) showToast(`Announcements: ${annRes.error.message}`, 'error')

    const perList = (periodRes.data || []) as PayrollPeriod[]
    setPeriods(perList)
    setEmployees(empPaged.data as Employee[])
    setAnnouncements((annRes.data || []) as Announcement[])
    if (perList.length > 0) {
      setActivePeriod(perList[0])
      await fetchRecords(perList[0].id)
    } else {
      setActivePeriod(null)
      setRecords([])
    }
    setLoading(false)
  }

  async function fetchRecords(periodId: string) {
    const { data, error } = await supabase.from('payroll_records').select('*, employee:employees(*)').eq('period_id', periodId)
    if (error) showToast(`Payroll records: ${error.message}`, 'error')
    setRecords((data || []) as (PayrollRecord & { employee?: Employee })[])
  }

  async function handleCreatePeriod() {
    const { error } = await supabase.from('payroll_periods').insert({ ...newPeriod, status: 'draft' })
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast('Payroll period created', 'success')
    setShowNewPeriod(false)
    setNewPeriod({ period_name: '', start_date: '', end_date: '', pay_date: '' })
    fetchAll()
  }

  async function handleGeneratePayroll(period: PayrollPeriod) {
    showToast('Generating payroll…', 'info')

    const calendarYear = new Date(period.start_date + 'T12:00:00').getFullYear()
    const yearStart = `${calendarYear}-01-01`

    const [settRes, attRes, leaveRes, balRes] = await Promise.all([
      supabase.from('system_settings').select('key, value'),
      supabase.from('attendance_records').select('*')
        .gte('date', period.start_date).lte('date', period.end_date),
      supabase.from('leave_requests').select('*')
        .in('status', ['approved', 'hr_approved'])
        .lte('start_date', period.end_date)
        .gte('end_date', yearStart),
      supabase.from('leave_balances').select('*').eq('year', calendarYear),
    ])
    if (settRes.error) showToast(`Settings: ${settRes.error.message}`, 'error')
    if (attRes.error) showToast(`Attendance: ${attRes.error.message}`, 'error')
    if (leaveRes.error) showToast(`Leave: ${leaveRes.error.message}`, 'error')
    if (balRes.error) showToast(`Balances: ${balRes.error.message}`, 'error')

    const settingsMap: Record<string, string> = {}
    for (const row of settRes.data || []) {
      const r = row as { key: string; value: string }
      settingsMap[r.key] = String(r.value ?? '')
    }
    const policy = parseSettingsForPayroll(settingsMap)

    const allAtt = (attRes.data || []) as AttendanceRecord[]
    const allLeaves = (leaveRes.data || []) as LeaveRequest[]
    const allBalances = (balRes.data || []) as LeaveBalance[]

    const insertData = employees.map(emp => {
      const basicMonthly = Math.max(0, parseFloat(String(emp.basic_salary ?? '')) || 0)
      const basicEarned = basicEarnedForPayPeriod(basicMonthly, period.start_date, period.end_date)
      const cutOffProration = basicMonthly > 0 ? basicEarned / basicMonthly : 1

      const dailyRate = dailyRateFromMonthly(basicMonthly, policy)
      const hourlyRate = hourlyRateFromMonthly(basicMonthly, policy)

      const empAtt = allAtt.filter(a => a.employee_id === emp.id)
      const leaveDatesInPeriod = expandApprovedLeaveCalendarDays(emp.id, allLeaves, period.start_date, period.end_date)
      const { overtimeHours, undertimeHours } = computeAttendanceTimeAdjustments(empAtt, policy, leaveDatesInPeriod)
      const otPayRaw = overtimeHours * hourlyRate * policy.otMultiplier
      const utDedRaw = undertimeHours * hourlyRate
      const overtimePay = Number.isFinite(otPayRaw) ? Math.max(0, parseFloat(otPayRaw.toFixed(2))) : 0
      const undertimeDeduction = Number.isFinite(utDedRaw) ? Math.max(0, parseFloat(utDedRaw.toFixed(2))) : 0

      // Do not charge “absence” on days already covered by approved leave (attendance often still “absent”).
      const absentDays = empAtt.filter(
        a => a.status === 'absent' && !leaveDatesInPeriod.has(a.date),
      ).length
      const absenceDeduction = parseFloat((absentDays * dailyRate).toFixed(2))

      const bal = allBalances.find(b => b.employee_id === emp.id)
      const { unpaidLeaveDays } = computeLeaveDeductionsSil(emp, period.start_date, period.end_date, calendarYear, allLeaves, bal)
      const unpaidLeaveDeduction = parseFloat((unpaidLeaveDays * dailyRate).toFixed(2))

      // ── Government contributions (2025 tables) ──
      // Gross basic matches the pay window; statutory amounts prorated by the same factor as basic.
      const gross = basicEarned + overtimePay
      const sss = parseFloat((computeSSS(basicMonthly) * cutOffProration).toFixed(2))
      const ph = parseFloat((computePhilHealth(basicMonthly) * cutOffProration).toFixed(2))
      const pagibig = parseFloat((computePagIBIG(basicMonthly) * cutOffProration).toFixed(2))
      const taxable = gross - sss - ph - pagibig
      const tax = computeWithholdingTax(Math.max(0, taxable))
      const otherDeductions = absenceDeduction + unpaidLeaveDeduction + undertimeDeduction
      const net = parseFloat((gross - sss - ph - pagibig - tax - otherDeductions).toFixed(2))

      return {
        period_id: period.id,
        employee_id: emp.id,
        basic_salary: basicEarned,
        allowances: 0,
        overtime_pay: overtimePay,
        gross_pay: parseFloat(gross.toFixed(2)),
        sss_contribution: sss,
        philhealth_contribution: ph,
        pagibig_contribution: pagibig,
        withholding_tax: tax,
        other_deductions: otherDeductions,
        net_pay: net,
        status: 'draft',
      }
    })

    const { error } = await supabase.from('payroll_records').upsert(insertData, { onConflict: 'period_id,employee_id' })
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', period.id)
    showToast(`Payroll generated for ${employees.length} employees`, 'success')
    fetchAll()
    fetchRecords(period.id)
  }

  async function handleUpdateRecord() {
    if (!showEditRecord) return
    const gross = Number(showEditRecord.basic_salary) + Number(showEditRecord.allowances) + Number(showEditRecord.overtime_pay)
    const net = gross - Number(showEditRecord.sss_contribution) - Number(showEditRecord.philhealth_contribution) - Number(showEditRecord.pagibig_contribution) - Number(showEditRecord.withholding_tax) - Number(showEditRecord.other_deductions)
    const { error } = await supabase.from('payroll_records').update({
      basic_salary: showEditRecord.basic_salary,
      allowances: showEditRecord.allowances,
      overtime_pay: showEditRecord.overtime_pay,
      gross_pay: gross,
      sss_contribution: showEditRecord.sss_contribution,
      philhealth_contribution: showEditRecord.philhealth_contribution,
      pagibig_contribution: showEditRecord.pagibig_contribution,
      withholding_tax: showEditRecord.withholding_tax,
      other_deductions: showEditRecord.other_deductions,
      net_pay: net,
    }).eq('id', showEditRecord.id)
    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast('Record updated', 'success')
    setShowEditRecord(null)
    if (activePeriod) fetchRecords(activePeriod.id)
  }

  async function handleSubmitForReview(id: string) {
    await supabase.from('payroll_periods').update({ status: 'review' }).eq('id', id)
    showToast('Payroll submitted for admin review', 'info')
    fetchAll()
  }

  async function handleApprovePeriod(id: string) {
    await supabase.from('payroll_periods').update({ status: 'approved' }).eq('id', id)
    await supabase.from('payroll_records').update({ status: 'approved' }).eq('period_id', id)
    showToast('Payroll approved', 'success')
    fetchAll()
  }

  async function handleReturnToPayroll(id: string) {
    await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', id)
    showToast('Payroll returned to payroll officer for revision', 'warn')
    fetchAll()
  }

  async function handleMarkPaid(id: string) {
    await supabase.from('payroll_periods').update({ status: 'paid' }).eq('id', id)
    await supabase.from('payroll_records').update({ status: 'paid' }).eq('period_id', id)
    showToast('Payroll marked as paid', 'success')
    fetchAll()
  }

  const totalNet = records.reduce((s, r) => s + Number(r.net_pay), 0)
  const totalGross = records.reduce((s, r) => s + Number(r.gross_pay), 0)
  const totalDeductions = totalGross - totalNet

  function handlePrintPayslip(r: PayrollRecord & { employee?: Employee }) {
    const deductions = Number(r.sss_contribution) + Number(r.philhealth_contribution) + Number(r.pagibig_contribution) + Number(r.withholding_tax) + Number(r.other_deductions)
    const w = window.open('', '_blank', 'width=600,height=800')
    if (!w) return
    w.document.write(`<html><head><title>Payslip - ${r.employee?.full_name}</title>
      <style>body{font-family:'Segoe UI',sans-serif;padding:40px;color:#1a1a2e}h2{margin:0 0 4px;font-size:1.4rem}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #e0e0e0;font-size:.88rem}th{font-weight:600;color:#555;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}.total{font-weight:700;border-top:2px solid #333}.net{font-size:1.1rem;color:#16a34a;font-weight:700}.right{text-align:right}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}.sub{font-size:.82rem;color:#666}</style>
    </head><body>
      <div class="header"><div><h2>Payslip</h2><div class="sub">${activePeriod?.period_name || 'Period'}</div></div><div style="text-align:right"><strong>HRMatrix</strong><br><span class="sub">Pay Date: ${activePeriod?.pay_date || '—'}</span></div></div>
      <table><tr><td><strong>Employee</strong></td><td>${r.employee?.full_name || '—'}</td><td><strong>Employee ID</strong></td><td>${r.employee?.employee_id || '—'}</td></tr>
      <tr><td><strong>Department</strong></td><td>${r.employee?.department || '—'}</td><td><strong>Position</strong></td><td>${r.employee?.position || '—'}</td></tr></table>
      <table><tr><th colspan="2">Earnings</th></tr>
      <tr><td>Basic Salary</td><td class="right">₱${Number(r.basic_salary).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Allowances</td><td class="right">₱${Number(r.allowances).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Overtime Pay</td><td class="right">₱${Number(r.overtime_pay).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr class="total"><td><strong>Gross Pay</strong></td><td class="right"><strong>₱${Number(r.gross_pay).toLocaleString('en-PH',{minimumFractionDigits:2})}</strong></td></tr></table>
      <table><tr><th colspan="2">Deductions</th></tr>
      <tr><td>SSS</td><td class="right">-₱${Number(r.sss_contribution).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>PhilHealth</td><td class="right">-₱${Number(r.philhealth_contribution).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Pag-IBIG</td><td class="right">-₱${Number(r.pagibig_contribution).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Withholding Tax</td><td class="right">-₱${Number(r.withholding_tax).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Other Deductions</td><td class="right">-₱${Number(r.other_deductions).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
      <tr class="total"><td><strong>Total Deductions</strong></td><td class="right"><strong>-₱${deductions.toLocaleString('en-PH',{minimumFractionDigits:2})}</strong></td></tr></table>
      <table><tr class="total"><td><strong>Net Pay</strong></td><td class="right net">₱${Number(r.net_pay).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr></table>
    </body></html>`)
    w.document.close()
    w.print()
  }

  const periodBadge = (s: string) => {
    const map: Record<string, string> = { draft: 'badge-slate', processing: 'badge-warn', review: 'badge-info', approved: 'badge-teal', paid: 'badge-ok' }
    const labels: Record<string, string> = { draft: 'Draft', processing: 'Processing', review: 'Pending Approval', approved: 'Approved', paid: 'Paid' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{labels[s] || s}</span>
  }

  if (loading) return <div className="wrap"><SkeletonLoader type="dashboard" /></div>

  return (
    <div className="wrap">
      <div className="ph">
        <div className="ph-sup">Payroll Management</div>
        <div className="ph-row">
          <div>
            <div className="ph-title">Payroll Officer Portal</div>
            <div className="ph-sub">Manage payroll periods and employee compensation</div>
            <div className="ph-sub" style={{ marginTop: 6, fontSize: '.78rem', color: 'var(--ink3)', maxWidth: 720 }}>
              Basic is prorated by calendar days in the period. Time in/out: grace adjusts paid start; short hours vs regular schedule deduct at straight hourly rate; OT defaults to time after scheduled end (toggle early clock-in OT in Admin). Absences on approved leave dates are skipped. SIL then balances for vacation/sick.
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
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewPeriod(true)}>+ New Period</button>
          </div>
        </div>
      </div>


      {activeSection === 'periods' && (
        <div className="card">
          <div className="card-hd"><div className="card-title">Payroll Periods</div></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Period</th><th>Dates</th><th>Pay Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {periods.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No payroll periods yet</td></tr>}
                {periods.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.period_name}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: '.72rem' }}>{p.start_date} – {p.end_date}</td>
                    <td style={{ color: 'var(--ink3)' }}>{p.pay_date}</td>
                    <td>{periodBadge(p.status)}</td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => { setActivePeriod(p); fetchRecords(p.id); onNavigate('records') }}>View</button>
                      {p.status === 'draft' && <button className="btn btn-ok btn-xs" onClick={() => handleGeneratePayroll(p)}>Generate</button>}
                      {p.status === 'processing' && <button className="btn btn-ok btn-xs" onClick={() => handleSubmitForReview(p.id)}>Submit for Review</button>}
                      {p.status === 'review' && <span style={{ fontSize: '.68rem', color: 'var(--ink3)' }}>Awaiting admin approval</span>}
                      {p.status === 'approved' && <button className="btn btn-primary btn-xs" onClick={() => handleMarkPaid(p.id)}>Mark Paid</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'records' && (
        <>
          {activePeriod && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--accent-lt)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--accent)' }}>📋 Viewing: <strong>{activePeriod.period_name}</strong></span>
              {periodBadge(activePeriod.status)}
            </div>
          )}
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('records')}><div className="stat-label">Total Gross</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('records')}><div className="stat-label">Total Deductions</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('records')}><div className="stat-label">Total Net Pay</div><div className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--ok)' }}>₱{totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile" style={{ cursor: 'pointer' }} onClick={() => onNavigate('summary')}><div className="stat-label">Employees</div><div className="stat-value">{records.length}</div></div>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-hd"><div className="card-title">Payroll Breakdown Overview</div></div>
            <div style={{ height: 250, padding: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Gross Pay', value: totalGross, fill: chart.series.blue },
                  { name: 'Deductions', value: totalDeductions, fill: chart.series.red },
                  { name: 'Net Pay', value: totalNet, fill: chart.series.green },
                ]} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.tickFill }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chart.tickFill }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: chart.cursorFill }} contentStyle={chart.tooltipContentStyle} formatter={(val: unknown) => `₱${Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Employee</th><th>Basic</th><th>Allowances</th><th>OT Pay</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Edit</th></tr></thead>
                <tbody>
                  {records.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink3)', padding: 24 }}>No payroll records. Generate payroll first.</td></tr>}
                  {records.map(r => {
                    const deductions = Number(r.sss_contribution) + Number(r.philhealth_contribution) + Number(r.pagibig_contribution) + Number(r.withholding_tax) + Number(r.other_deductions)
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>{r.employee?.full_name || '—'}</td>
                        <td>₱{Number(r.basic_salary).toLocaleString()}</td>
                        <td>₱{Number(r.allowances).toLocaleString()}</td>
                        <td>₱{Number(r.overtime_pay).toLocaleString()}</td>
                        <td>₱{Number(r.gross_pay).toLocaleString()}</td>
                        <td style={{ color: 'var(--danger)' }}>₱{deductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: 600, color: 'var(--ok)' }}>₱{Number(r.net_pay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => setShowEditRecord({ ...r })}>Edit</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => handlePrintPayslip(r)}>🖨️</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSection === 'summary' && (
        <div className="panel-grid">
          {periods.map(p => {
            const statusColor: Record<string, string> = { draft: 'var(--slate)', processing: 'var(--warn)', review: 'var(--accent)', approved: 'var(--teal)', paid: 'var(--ok)' }
            return (
              <div className="stat-tile" key={p.id} style={{ borderLeft: `3px solid ${statusColor[p.status] || 'var(--line)'}`, cursor: 'pointer' }} onClick={() => { setActivePeriod(p); fetchRecords(p.id); onNavigate('records') }}>
                <div className="stat-label">{p.period_name}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--ink3)', marginBottom: 8 }}>{p.start_date} – {p.end_date}</div>
                {periodBadge(p.status)}
                <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--ink2)' }}>Pay date: {p.pay_date}</div>
              </div>
            )
          })}
          {periods.length === 0 && <div style={{ color: 'var(--ink3)', gridColumn: '1/-1', padding: 24, textAlign: 'center' }}>No payroll periods</div>}
        </div>
      )}

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

      {/* New Period Modal */}
      <div className={`modal-ov${showNewPeriod ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowNewPeriod(false) }}>
        <div className="modal-box">
          <div className="modal-hd">
            <div><div className="modal-title">Create Payroll Period</div></div>
            <button className="modal-x" onClick={() => setShowNewPeriod(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-grp"><label className="form-lbl">Period Name</label><input className="form-ctrl" value={newPeriod.period_name} onChange={e => setNewPeriod(p => ({ ...p, period_name: e.target.value }))} placeholder="e.g. May 2025 – 1st Half" /></div>
            <div className="form-row fr-2">
              <div className="form-grp"><label className="form-lbl">Start Date</label><input className="form-ctrl" type="date" value={newPeriod.start_date} onChange={e => setNewPeriod(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="form-grp"><label className="form-lbl">End Date</label><input className="form-ctrl" type="date" value={newPeriod.end_date} onChange={e => setNewPeriod(p => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div className="form-grp"><label className="form-lbl">Pay Date</label><input className="form-ctrl" type="date" value={newPeriod.pay_date} onChange={e => setNewPeriod(p => ({ ...p, pay_date: e.target.value }))} /></div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={handleCreatePeriod}>Create Period</button>
          </div>
        </div>
      </div>

      {/* Edit Record Modal */}
      <div className={`modal-ov${showEditRecord ? ' active' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowEditRecord(null) }}>
        <div className="modal-box modal-box-lg">
          <div className="modal-hd">
            <div><div className="modal-title">Edit Payroll — {showEditRecord?.employee?.full_name}</div></div>
            <button className="modal-x" onClick={() => setShowEditRecord(null)}>✕</button>
          </div>
          {showEditRecord && (
            <div className="modal-body">
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--ink3)', marginBottom: 10 }}>EARNINGS</div>
              <div className="form-row fr-3">
                <div className="form-grp"><label className="form-lbl">Basic Salary</label><input className="form-ctrl" type="number" value={showEditRecord.basic_salary} onChange={e => setShowEditRecord(p => p ? { ...p, basic_salary: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Allowances</label><input className="form-ctrl" type="number" value={showEditRecord.allowances} onChange={e => setShowEditRecord(p => p ? { ...p, allowances: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Overtime Pay</label><input className="form-ctrl" type="number" value={showEditRecord.overtime_pay} onChange={e => setShowEditRecord(p => p ? { ...p, overtime_pay: Number(e.target.value) } : p)} /></div>
              </div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--ink3)', margin: '12px 0 10px' }}>DEDUCTIONS</div>
              <div className="form-row fr-3">
                <div className="form-grp"><label className="form-lbl">SSS</label><input className="form-ctrl" type="number" value={showEditRecord.sss_contribution} onChange={e => setShowEditRecord(p => p ? { ...p, sss_contribution: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">PhilHealth</label><input className="form-ctrl" type="number" value={showEditRecord.philhealth_contribution} onChange={e => setShowEditRecord(p => p ? { ...p, philhealth_contribution: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Pag-IBIG</label><input className="form-ctrl" type="number" value={showEditRecord.pagibig_contribution} onChange={e => setShowEditRecord(p => p ? { ...p, pagibig_contribution: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Withholding Tax</label><input className="form-ctrl" type="number" value={showEditRecord.withholding_tax} onChange={e => setShowEditRecord(p => p ? { ...p, withholding_tax: Number(e.target.value) } : p)} /></div>
                <div className="form-grp"><label className="form-lbl">Other Deductions</label><input className="form-ctrl" type="number" value={showEditRecord.other_deductions} onChange={e => setShowEditRecord(p => p ? { ...p, other_deductions: Number(e.target.value) } : p)} /></div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleUpdateRecord}>Save Changes</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}   