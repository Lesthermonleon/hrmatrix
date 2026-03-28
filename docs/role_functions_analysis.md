# HRMatrix — Role Functions Analysis

## Quick Summary

| Role | Pages/Sections | Can Read | Can Write |
|------|---------------|----------|-----------|
| **Admin** | Dashboard, Audit Logs, Users & Roles, Departments, Settings, Employees, Leaves, Payroll | All tables | employees, departments |
| **HR Manager** | Overview, Employees, Leave Requests, Attendance | employees, leave_requests, attendance_records | employees (edit), leave_requests (approve/reject/create) |
| **Payroll Officer** | Pay Periods, Payroll Records, Summary | payroll_periods, payroll_records, employees | payroll_periods (create), payroll_records (generate/edit/approve/pay) |
| **Supervisor** | Overview, My Team, Leave Requests, Attendance | team employees, team leaves, team attendance | leave_requests (endorse/reject), attendance_records (log) |
| **Employee** | Home, Profile, Attendance, Leave Requests, Payslips | own records only | leave_requests (file) |

---

## 🔐 Admin

**Sections:** Dashboard · Audit Logs · Users & Roles · Departments · System Settings · Employees · Leaves · Payroll

| Function | Status | Notes |
|----------|--------|-------|
| View system-wide stats (employees, depts, pending leaves) | ✅ Working | Fetches real counts from DB |
| View system activity feed | ⚠️ **Mock** | Hardcoded — not reading from `audit_logs` table |
| View system config (company, work hours, OT) | ⚠️ **Mock** | Hardcoded values, not from DB |
| View active sessions / DB status | ⚠️ **Mock** | Hardcoded "14 users", "Healthy" |
| Add new employee | ✅ Working | Inserts into `employees` table |
| ~~Create auth user account~~ | ❌ **Missing** | Password field exists but is never used; no Supabase auth user or profile is created |
| Delete employee | ✅ Working | **Hard-deletes** — cascades to all related records |
| View all employees (Users & Roles) | ✅ Working | Shows name, email, position, dept, status |
| ~~Edit employee role~~ | ❌ **Missing** | No role editing UI — position ≠ system role |
| Create department | ✅ Working | Inserts into `departments` table |
| View departments + employee count | ✅ Working | Cross-references employees by dept name |
| Edit system settings (work hours, grace period, OT) | ⚠️ **Not saved** | Form renders defaults but never persists changes |
| View audit logs | ⚠️ **Mock** | Uses hardcoded mock array, has filter UI but no real data |
| Export report / CSV | ❌ **Not implemented** | Buttons exist but have no functionality |
| Broadcast announcement | ❌ **Not implemented** | Button exists but does nothing |
| Navigate to Employees/Leaves/Payroll sections | ⚠️ **Placeholder** | Shows "managed under Admin Operations" message |

> [!WARNING]
> **Fit Assessment:** The Admin role is incomplete. It has the skeleton of a super-admin but key functions (user auth creation, settings persistence, audit logs, announcements) are non-functional.

---

## 👥 HR Manager

**Sections:** Overview · Employees · Leave Requests · Attendance

| Function | Status | Notes |
|----------|--------|-------|
| View HR stats (total employees, active, pending/approved leaves) | ✅ Working | Computed from real DB data |
| View pending leave requests with employee names | ✅ Working | Joins `leave_requests` + `employees` |
| Review & approve/reject leave requests | ✅ Working | Updates status to `approved` or `rejected` with `hr_notes` |
| View all leave requests (all statuses) | ✅ Working | Full history with filtering |
| Create leave request on behalf of employee | ✅ Working | Picks employee from dropdown |
| View all employees with salary | ✅ Working | Shows full_name, dept, position, salary, status |
| Edit employee details (name, dept, position, salary, status) | ✅ Working | Modal form, saves to DB |
| View recent attendance records | ✅ Working | Last 50 records with employee join |
| ~~Manage leave balances~~ | ❌ **Missing** | No leave balance table or management UI |
| ~~Export/print reports~~ | ❌ **Missing** | No export functionality |

> [!TIP]
> **Fit Assessment:** The HR Manager role is the **most complete** role. Core functions (employee CRUD, leave management, attendance viewing) all work correctly. Missing: leave balance management and reporting.

---

## 💰 Payroll Officer

**Sections:** Pay Periods · Payroll Records · Summary

| Function | Status | Notes |
|----------|--------|-------|
| Create payroll period (name, dates, pay date) | ✅ Working | Inserts with `draft` status |
| Generate payroll records for all active employees | ✅ Working | Auto-computes SSS, PhilHealth, Pag-IBIG, tax deductions |
| View payroll records per period | ✅ Working | Shows earnings, deductions, net pay per employee |
| Edit individual payroll record (salary, allowances, OT, deductions) | ✅ Working | Recalculates gross/net on save |
| Approve payroll period | ✅ Working | Updates period + all records to `approved` |
| Mark payroll as paid | ✅ Working | Updates period + all records to `paid` |
| View payroll summary (all periods) | ✅ Working | Period cards with status badges |
| View aggregated totals (gross, deductions, net) | ✅ Working | Computed from records array |
| ~~Generate payslip PDFs~~ | ❌ **Missing** | No PDF generation |
| ~~Integrate with attendance for OT calculation~~ | ❌ **Missing** | OT is manually entered, not computed from attendance |

> [!TIP]
> **Fit Assessment:** The Payroll role is **well-built** with a complete lifecycle (draft → generate → review → approve → paid). Missing: PDF generation and auto-OT from attendance data.

---

## 👔 Supervisor

**Sections:** Overview · My Team · Leave Requests · Attendance

| Function | Status | Notes |
|----------|--------|-------|
| View team members (filtered by `supervisor_id`) | ✅ Working | Finds own employee record, then filters team |
| View team stats (members, pending approvals, present today, on leave) | ✅ Working | Computed from team-scoped data |
| View pending leave requests from team | ✅ Working | Filtered by team employee IDs |
| Review & endorse leave to HR (`supervisor_approved`) | ✅ Working | Two-step: Supervisor → HR |
| Reject leave request | ✅ Working | Sets status to `rejected` with supervisor notes |
| View all team leave requests (history) | ✅ Working | All statuses for team members |
| View team attendance log | ✅ Working | Last 30 records for team members |
| Log attendance for team member | ✅ Working | Upserts with date, time_in/out, status |
| ~~View own attendance/leaves~~ | ❌ **Missing** | Supervisor can't see their own employee data |
| ~~File their own leave~~ | ❌ **Missing** | No personal leave filing option |

> [!CAUTION]
> **Fit Assessment:** Core team management works well, but the Supervisor has **no self-service features**. They can manage their team but can't view their own attendance, payslips, or file their own leave. Also, if no `supervisor_id` is set, it **falls back to showing the first 10 employees** from the entire org.

---

## 🧑‍💼 Employee

**Sections:** Home · My Profile · Attendance · Leave Requests · My Payslips · Notifications

| Function | Status | Notes |
|----------|--------|-------|
| View personalized dashboard with greeting and live clock | ✅ Working | Shows current time, department |
| View stats (days worked, leave balance, pending leaves, net pay) | ⚠️ **Partial** | Days worked and pending leaves are real; leave balance is hardcoded "8" |
| View attendance calendar (color-coded by status) | ✅ Working | Present, late, absent, leave overlays |
| View daily time records table | ✅ Working | Time in/out, hours worked, late calculation |
| View recent leave requests | ✅ Working | Type, dates, days, status |
| File new leave request | ✅ Working | Type, dates, reason → status: pending |
| View leave history (detailed) | ✅ Working | Full table with remarks |
| View leave balances | ⚠️ **Mock** | Hardcoded vacation/sick/emergency/special values |
| View payslips (earnings & deductions breakdown) | ✅ Working | Gross, SSS, PhilHealth, Pag-IBIG, tax, net |
| View own profile (personal + employment info) | ⚠️ **Partial** | Employee ID, name, dept, position, hire date from DB; DOB, gender, address, phone, SSS/PhilHealth/Pag-IBIG numbers are **hardcoded** |
| Real-time updates | ✅ Working | Subscribes to changes on attendance, leaves, payroll |
| Payslip banner notification | ✅ Working | Shows latest paid/approved payslip net pay |
| Download payslip PDF | ❌ **Not implemented** | PDF button exists but does nothing |
| Mark payslip as viewed | ❌ **Not implemented** | Button exists but does nothing |
| Notifications section | ❌ **Not implemented** | In nav config but no UI rendered |

> [!WARNING]
> **Fit Assessment:** The Employee portal is feature-rich but has significant **mock/hardcoded data** issues (leave balances, profile fields). The real-time subscription is a great touch. Missing: actual leave balance tracking, PDF downloads, notifications.

---

## Cross-Role Feature Matrix

| Feature | Admin | HR | Payroll | Supervisor | Employee |
|---------|:-----:|:--:|:-------:|:----------:|:--------:|
| View all employees | ✅ | ✅ | ✅ (active only) | Team only | Own only |
| Edit employee info | ❌ | ✅ | ❌ | ❌ | ❌ |
| Add employee | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete employee | ✅ | ❌ | ❌ | ❌ | ❌ |
| File leave request | ❌ | ✅ (for others) | ❌ | ❌ | ✅ (own) |
| Approve/reject leave | ❌ | ✅ (final) | ❌ | ✅ (endorse) | ❌ |
| View attendance | ❌ | ✅ (all) | ❌ | ✅ (team) | ✅ (own) |
| Log attendance | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage payroll | ❌ | ❌ | ✅ | ❌ | ❌ |
| View payslips | ❌ | ❌ | ✅ (all) | ❌ | ✅ (own) |
| Create departments | ✅ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ⚠️ Mock | ❌ | ❌ | ❌ | ❌ |
| System settings | ⚠️ No save | ❌ | ❌ | ❌ | ❌ |
| Real-time updates | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Overall Verdict

| Role | Completeness | Grade |
|------|-------------|-------|
| HR Manager | Core functions all work | ⭐⭐⭐⭐ **B+** |
| Payroll Officer | Full lifecycle works | ⭐⭐⭐⭐ **B+** |
| Employee | Feature-rich but mock data issues | ⭐⭐⭐ **B-** |
| Supervisor | Team management works, no self-service | ⭐⭐⭐ **C+** |
| Admin | Many placeholders and mock data | ⭐⭐ **C-** |
