import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee, PayrollPeriod, PayrollRecord } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { SkeletonLoader } from '../components/SkeletonLoader'

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

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [periodRes, empRes] = await Promise.all([
      supabase.from('payroll_periods').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('status', 'active').order('full_name'),
    ])
    const perList = (periodRes.data || []) as PayrollPeriod[]
    setPeriods(perList)
    setEmployees((empRes.data || []) as Employee[])
    if (perList.length > 0) {
      setActivePeriod(perList[0])
      await fetchRecords(perList[0].id)
    }
    setLoading(false)
  }

  async function fetchRecords(periodId: string) {
    const { data } = await supabase.from('payroll_records').select('*, employee:employees(*)').eq('period_id', periodId)
    setRecords((data || []) as (PayrollRecord & { employee?: Employee })[])
  }

  async function handleCreatePeriod() {
    const { error } = await supabase.from('payroll_periods').insert({ ...newPeriod, status: 'draft' })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Payroll period created', '✅')
    setShowNewPeriod(false)
    setNewPeriod({ period_name: '', start_date: '', end_date: '', pay_date: '' })
    fetchAll()
  }

  async function handleGeneratePayroll(period: PayrollPeriod) {
    // Generate draft payroll records for all active employees
    const insertData = employees.map(emp => {
      const gross = Number(emp.basic_salary) 
      const sss = Math.min(gross * 0.045, 1125)
      const ph = gross * 0.0275
      const pagibig = Math.min(gross * 0.02, 200)
      const taxable = gross - sss - ph - pagibig
      const tax = taxable > 0 ? taxable * 0.15 : 0
      return {
        period_id: period.id,
        employee_id: emp.id,
        basic_salary: gross,
        allowances: 0,
        overtime_pay: 0,
        gross_pay: gross,
        sss_contribution: parseFloat(sss.toFixed(2)),
        philhealth_contribution: parseFloat(ph.toFixed(2)),
        pagibig_contribution: parseFloat(pagibig.toFixed(2)),
        withholding_tax: parseFloat(tax.toFixed(2)),
        other_deductions: 0,
        net_pay: parseFloat((gross - sss - ph - pagibig - tax).toFixed(2)),
        status: 'draft',
      }
    })
    const { error } = await supabase.from('payroll_records').upsert(insertData, { onConflict: 'period_id,employee_id' })
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    await supabase.from('payroll_periods').update({ status: 'processing' }).eq('id', period.id)
    showToast('Payroll records generated', '✅')
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
    if (error) { showToast('Error: ' + error.message, '❌'); return }
    showToast('Record updated', '✅')
    setShowEditRecord(null)
    if (activePeriod) fetchRecords(activePeriod.id)
  }

  async function handleApprovePeriod(id: string) {
    await supabase.from('payroll_periods').update({ status: 'approved' }).eq('id', id)
    await supabase.from('payroll_records').update({ status: 'approved' }).eq('period_id', id)
    showToast('Payroll approved', '✅')
    fetchAll()
  }

  async function handleMarkPaid(id: string) {
    await supabase.from('payroll_periods').update({ status: 'paid' }).eq('id', id)
    await supabase.from('payroll_records').update({ status: 'paid' }).eq('period_id', id)
    showToast('Payroll marked as paid', '💰')
    fetchAll()
  }

  const totalNet = records.reduce((s, r) => s + Number(r.net_pay), 0)
  const totalGross = records.reduce((s, r) => s + Number(r.gross_pay), 0)
  const totalDeductions = totalGross - totalNet

  const periodBadge = (s: string) => {
    const map: Record<string, string> = { draft: 'badge-slate', processing: 'badge-warn', approved: 'badge-teal', paid: 'badge-ok' }
    return <span className={`badge ${map[s] || 'badge-slate'}`}>{s}</span>
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
                      {p.status === 'processing' && <button className="btn btn-ok btn-xs" onClick={() => handleApprovePeriod(p.id)}>Approve</button>}
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
            <div className="stat-tile"><div className="stat-label">Total Gross</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile"><div className="stat-label">Total Deductions</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>₱{totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile"><div className="stat-label">Total Net Pay</div><div className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--ok)' }}>₱{totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div></div>
            <div className="stat-tile"><div className="stat-label">Employees</div><div className="stat-value">{records.length}</div></div>
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
                        <td><button className="btn btn-ghost btn-xs" onClick={() => setShowEditRecord({ ...r })}>Edit</button></td>
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
            const statusColor: Record<string, string> = { draft: 'var(--slate)', processing: 'var(--warn)', approved: 'var(--teal)', paid: 'var(--ok)' }
            return (
              <div className="stat-tile" key={p.id} style={{ borderLeft: `3px solid ${statusColor[p.status] || 'var(--line)'}` }}>
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
