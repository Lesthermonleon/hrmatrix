# HRMatrix — Payroll & Supervisor Module Guide

## Login Credentials

| Role | Email | Password |
|---|---|---|
| Payroll Officer | pay@hrmatrix.com | Demo@1234 |
| Supervisor | super@hrmatrix.com | Demo@1234 |

---

## Payroll Officer Module

**User:** Jose Reyes · Accounting

### Sidebar Navigation

| Section | Description |
|---|---|
| **Pay Periods** | Create and manage payroll cycles |
| **Payroll Records** | View per-employee breakdown for a selected period |
| **Summary** | Overview of all periods and their statuses |
| **Notifications** | View system-wide announcements |

### How Payroll Works (Step by Step)

#### Step 1: Create a Pay Period
1. Click **"+ New Period"** (top-right)
2. Fill in: Period Name (e.g. "March 2026 – 1st Half"), Start Date, End Date, Pay Date
3. Click **Create Period** → status starts as **Draft**

#### Step 2: Generate Payroll
1. On a **Draft** period, click **Generate**
2. The system automatically:
   - Fetches all active employees and their basic salary
   - Queries `attendance_records` for the date range → calculates **overtime** (hours > 8/day × hourly rate × 1.25)
   - Counts **absent** days → deducts `absent_days × daily_rate`
   - Queries approved `leave_requests` → cross-checks `leave_balances` → deducts **unpaid leave** if balance exceeded
   - Computes government contributions using **2025 Philippine tables**:
     - **SSS**: Bracket-based (₱180 to ₱1,350)
     - **PhilHealth**: 5% of salary ÷ 2 (employee share)
     - **Pag-IBIG**: 2% of salary, max ₱200
     - **Withholding Tax**: BIR TRAIN Law brackets (0% to 35%)
   - Calculates **Net Pay** = Gross – SSS – PhilHealth – PagIBIG – Tax – other deductions
3. Period status changes to **Processing**

#### Step 3: Review & Edit
- Navigate to **Payroll Records** to see per-employee breakdown
- Click **Edit** on any record to manually adjust amounts if needed
- Click **🖨️** to print a formatted payslip

#### Step 4: Submit for Approval
- On a **Processing** period, click **Submit for Review** → status changes to **Pending Approval**
- The Admin must approve from their dashboard

#### Step 5: Mark as Paid
- After Admin approves → status becomes **Approved**
- Click **Mark Paid** → final status **Paid**

### Payroll Status Flow

```
Draft → Processing → Pending Approval → Approved → Paid
         (Generate)   (Submit for         (Admin      (Mark
                        Review)           approves)    Paid)
```

If Admin returns it: `Pending Approval → Processing` (back to Payroll Officer for revision)

### Key Formulas

| Item | Formula |
|---|---|
| Daily Rate | `basic_salary ÷ 22` |
| Hourly Rate | `daily_rate ÷ 8` |
| Overtime Pay | `OT_hours × hourly_rate × 1.25` |
| Absence Deduction | `absent_days × daily_rate` |
| Unpaid Leave | `excess_leave_days × daily_rate` |
| Gross Pay | `basic_salary + overtime_pay` |
| Net Pay | `gross – SSS – PhilHealth – PagIBIG – tax – other_deductions` |

---

## Supervisor Module

**User:** Lisa Tan

### Sidebar Navigation

| Section | Description |
|---|---|
| **Overview** | Stats dashboard + pending leave approvals + team quick view |
| **My Team** | Full list of team members under this supervisor |
| **Leave Requests** | All leave requests from team members |
| **Attendance** | Team attendance log + manual attendance entry |
| **My Info** | Self-service (own attendance, leaves, payslips) |
| **Notifications** | View system-wide announcements |

### How the Supervisor Works

#### Team Assignment
- Employees are assigned to a supervisor via the `supervisor_id` field in the `employees` table
- Only employees whose `supervisor_id` matches the supervisor's employee record appear as team members
- If no employees are assigned, the dashboard shows "No team members assigned yet"

#### Leave Approval Flow
1. Employee files a leave request → status: **Pending**
2. Supervisor sees it in **Overview** → clicks **Review**
3. Supervisor can add notes, then:
   - **Endorse to HR** → status becomes `supervisor_approved`
   - **Reject** → status becomes `rejected`
4. HR Manager/Admin reviews endorsed requests and gives final approval

```
Employee files leave (pending)
       ↓
Supervisor endorses (supervisor_approved) or rejects
       ↓
HR Manager/Admin gives final approval (approved) or rejects
```

#### Logging Attendance
1. Click **📋 Log Attendance** (top bar) or go to **Attendance** → **+ Log**
2. Select employee from team, set date, time in, time out, status (present/absent/late/half day)
3. Click **Save Record** → inserted into `attendance_records` table
4. This data is used by Payroll when generating payroll (overtime, absence deductions)

#### Self-Service (My Info)
The supervisor also has access to their own data:
- **My Profile** — name, employee ID, department, position
- **My Attendance** — own time records
- **My Leave Requests** — view own status + file own leave via **📝 File Leave**
- **My Payslips** — gross, deductions, net pay per period

---

## How Payroll and Supervisor Connect

```
Supervisor logs attendance → attendance_records table
                                    ↓
Payroll Officer generates payroll → reads attendance for OT + absences
                                    ↓
Payroll records net pay per employee → Employee sees payslip
                                    ↓
Supervisor can also view own payslip in My Info section
```

| Supervisor Action | Payroll Impact |
|---|---|
| Logs employee as **present** with overtime hours | Overtime pay calculated automatically |
| Logs employee as **absent** | Absence deduction applied |
| Endorses leave request → HR approves | Approved leave days checked against balance; unpaid leave deducted if exceeded |

---

## Database Tables Used

| Table | Payroll Officer | Supervisor |
|---|---|---|
| `employees` | Read (salary, active status) | Read (team by supervisor_id) |
| `attendance_records` | Read (for OT & absences) | Read/Write (log attendance) |
| `leave_requests` | Read (for unpaid leave calc) | Read/Write (endorse/reject) |
| `leave_balances` | Read (for balance check) | — |
| `payroll_periods` | Read/Write (create, submit, mark paid) | — |
| `payroll_records` | Read/Write (generate, edit) | Read (own payslips) |
| `announcements` | Read (notifications) | Read (notifications) |
