# Payroll Automation — Implementation Plan

Automate the 5 missing payroll features in [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx).

---

## 1. Government Contribution Auto-Calculation

Replace the simplified formulas with **2025 Philippine contribution tables**:

| Contribution | Current | Proposed |
|---|---|---|
| **SSS** | `gross * 0.045, max 1125` | Bracket-based table (₱4,250 salary → ₱180 up to ₱30,000+ → ₱1,350) |
| **PhilHealth** | `gross * 0.0275` | `gross * 0.05 / 2` (5% split employer/employee, employee pays half) |
| **Pag-IBIG** | `gross * 0.02, max 200` | [min(gross * 0.02, 200)](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/AdminDashboard.tsx#15-19) — current is correct, just needs validation |
| **Withholding Tax** | `taxable * 0.15` | Bracket-based BIR table (₱0-₱20,833 → 0%, ₱20,833-₱33,333 → 15%, etc.) |

#### [MODIFY] [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx)
- Add `computeSSS(monthly)`, `computePhilHealth(monthly)`, `computePagIBIG(monthly)`, `computeTax(taxable)` helper functions
- Update [handleGeneratePayroll()](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx#55-87) to use these functions

---

## 2. Overtime Computation from Attendance

When generating payroll, calculate overtime from `attendance_records`:
- Standard shift: 8 hours (08:00–17:00, 1hr lunch)
- Overtime = hours worked beyond 8hrs per day
- OT rate: basic hourly × 1.25 (regular OT)
- Hourly rate: `basic_salary / 22 / 8` (22 working days)

#### [MODIFY] [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx)
- Fetch attendance records for the pay period date range
- Calculate total OT hours per employee
- Auto-populate `overtime_pay` field

---

## 3. Absence Deduction

Deduct salary for unexcused absences:
- Daily rate: `basic_salary / 22`
- Count `absent` status days from attendance within the pay period
- `other_deductions += absent_days × daily_rate`

#### [MODIFY] [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx)
- Use same attendance fetch as overtime
- Count absent days per employee
- Auto-populate `other_deductions`

---

## 4. Leave Deduction from Balance

When generating payroll:
- Count approved leave days within the pay period from `leave_requests`
- If leave days exceed remaining balance in `leave_balances`, deduct the excess as unpaid leave
- Unpaid leave deduction = `excess_days × daily_rate`

#### [MODIFY] [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx)
- Fetch approved leave requests for the period
- Cross-check against `leave_balances`
- Add excess as deduction

---

## 5. Multi-Step Approval Workflow

Current flow: `draft → processing → approved → paid` (single-click)

New flow:
```
draft → processing (Generate Payroll)
   → review (Payroll Officer submits for review)
   → approved (Admin approves)
   → paid (Payroll Officer marks as paid after disbursement)
```

#### [MODIFY] [PayrollOfficerDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/PayrollOfficerDashboard.tsx)
- Add "Submit for Review" button (processing → review)
- Change "Approve" to only work for admin role
- Add status badge for `review` state

#### [MODIFY] [AdminDashboard.tsx](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/src/pages/AdminDashboard.tsx)
- Show pending payroll approvals in the Payroll section
- Admin can approve or return to payroll officer

#### [MODIFY] [schema.sql](file:///c:/Users/clare/Downloads/hrmatrix-main/hrmatrix-main/schema.sql)
- Add `'review'` to `payroll_periods` status CHECK constraint

---

## Verification

- Generate payroll for a test period and verify SSS/PhilHealth/PagIBIG match the 2025 tables
- Create attendance records with overtime hours and verify OT pay calculation
- Create absence records and verify deduction amount
- Test approval flow: Payroll submits → Admin approves → Payroll marks paid
