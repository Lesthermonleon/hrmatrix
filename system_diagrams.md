# HRMatrix System Diagrams

*Note: The file `very_latest.sql` was empty, so these diagrams were generated based on the actual schema found in `sql implemented/schema.sql`.*

## Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    %% Entities
    AUTH_USERS {
        uuid id PK
    }
    
    PROFILES {
        uuid id PK "REFERENCES auth.users(id)"
        string email
        string full_name
        string role "admin, hr_manager, payroll_officer, supervisor, employee"
        string department
        string position
        string employee_id
        string avatar_url
        timestamp created_at
    }

    DEPARTMENTS {
        uuid id PK
        string name "UNIQUE"
        uuid head_id
        string description
        timestamp created_at
    }

    EMPLOYEES {
        uuid id PK
        uuid profile_id FK "REFERENCES profiles(id)"
        string employee_id "UNIQUE"
        string full_name
        string email
        string department
        string position
        date hire_date
        string status "active, inactive, on_leave"
        uuid supervisor_id FK "REFERENCES employees(id)"
        numeric basic_salary
        date date_of_birth
        string gender
        string civil_status
        string address
        string phone
        string sss_number
        string philhealth_number
        string pagibig_number
        string employment_type
        timestamp created_at
    }

    LEAVE_BALANCES {
        uuid id PK
        uuid employee_id FK "REFERENCES employees(id)"
        int year
        int vacation
        int sick
        int emergency
        int special
        timestamp updated_at
    }

    LEAVE_REQUESTS {
        uuid id PK
        uuid employee_id FK "REFERENCES employees(id)"
        string leave_type
        date start_date
        date end_date
        int days_count
        string reason
        string status "pending, supervisor_approved, hr_approved, approved, rejected"
        uuid supervisor_id FK "REFERENCES employees(id)"
        string supervisor_notes
        string hr_notes
        timestamp created_at
    }

    ATTENDANCE_RECORDS {
        uuid id PK
        uuid employee_id FK "REFERENCES employees(id)"
        date date
        time time_in
        time time_out
        string status "present, absent, late, half_day"
        string notes
        timestamp created_at
    }

    PAYROLL_PERIODS {
        uuid id PK
        string period_name
        date start_date
        date end_date
        date pay_date
        string status "draft, processing, review, approved, paid"
        timestamp created_at
    }

    PAYROLL_RECORDS {
        uuid id PK
        uuid period_id FK "REFERENCES payroll_periods(id)"
        uuid employee_id FK "REFERENCES employees(id)"
        numeric basic_salary
        numeric allowances
        numeric overtime_pay
        numeric gross_pay
        numeric sss_contribution
        numeric philhealth_contribution
        numeric pagibig_contribution
        numeric withholding_tax
        numeric other_deductions
        numeric net_pay
        string status "draft, approved, paid"
        timestamp created_at
    }

    ANNOUNCEMENTS {
        uuid id PK
        string title
        string body
        uuid author_id FK "REFERENCES profiles(id)"
        string target_role
        timestamp created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK "REFERENCES profiles(id)"
        string action
        string table_name
        uuid record_id
        jsonb old_data
        jsonb new_data
        string ip_address
        timestamp created_at
    }

    SYSTEM_SETTINGS {
        string key PK
        string value
        timestamp updated_at
    }

    %% Relationships
    AUTH_USERS ||--o| PROFILES : "extends"
    PROFILES ||--o{ EMPLOYEES : "has profile"
    EMPLOYEES |o--o{ EMPLOYEES : "managed by (supervisor_id)"
    EMPLOYEES ||--|{ LEAVE_BALANCES : "has"
    EMPLOYEES ||--o{ LEAVE_REQUESTS : "requests"
    EMPLOYEES |o--o{ LEAVE_REQUESTS : "approves (supervisor_id)"
    EMPLOYEES ||--o{ ATTENDANCE_RECORDS : "records"
    PAYROLL_PERIODS ||--o{ PAYROLL_RECORDS : "contains"
    EMPLOYEES ||--o{ PAYROLL_RECORDS : "receives"
    PROFILES |o--o{ ANNOUNCEMENTS : "authors"
    PROFILES |o--o{ AUDIT_LOGS : "performs actions"
```

## Use Case Diagram

*Built with `flowchart LR` as standard Mermaid Use Case support is limited.*

```mermaid
flowchart LR
    %% Actors
    Emp(fa:fa-user Employee)
    Sup(fa:fa-user-tie Supervisor)
    HR(fa:fa-users HR Manager)
    Pay(fa:fa-wallet Payroll Officer)
    Adm(fa:fa-user-shield Admin)

    %% System Boundary
    subgraph System[HRMatrix Main Operations]
        %% Use Cases
        UC_Profile([View Profile & Info])
        UC_Announce([View Announcements])
        UC_ReqLeave([Request Leave])
        UC_MyAtt([View My Attendance])
        UC_MyPay([View My Payslip])
        
        UC_AppLeaveSup([Approve Team Leave])
        UC_TeamAtt([Monitor Team Attend.])
        
        UC_MngEmp([Manage Employees])
        UC_AppLeaveHR([Final Approve Leave])
        UC_CompAtt([Manage Company Attend.])
        UC_PostAnn([Post Announcements])
        
        UC_ProcPay([Process Payroll])
        UC_CalcPay([Calc Deductions])
        
        UC_SysSet([Manage System Settings])
        UC_Audit([View Audit Logs])
    }

    %% Actor Inheritances (Implicit via links to base uses or direct links)
    %% In flowchart, we just hook up the actors to their use cases
    
    %% Employee
    Emp --> UC_Profile
    Emp --> UC_Announce
    Emp --> UC_ReqLeave
    Emp --> UC_MyAtt
    Emp --> UC_MyPay

    %% Supervisor
    Sup --> UC_Profile
    Sup --> UC_AppLeaveSup
    Sup --> UC_TeamAtt

    %% HR Manager
    HR --> UC_Profile
    HR --> UC_MngEmp
    HR --> UC_AppLeaveHR
    HR --> UC_CompAtt
    HR --> UC_PostAnn

    %% Payroll Officer
    Pay --> UC_Profile
    Pay --> UC_ProcPay
    Pay --> UC_CalcPay

    %% Admin
    Adm --> UC_MngEmp
    Adm --> UC_PostAnn
    Adm --> UC_SysSet
    Adm --> UC_Audit
```
