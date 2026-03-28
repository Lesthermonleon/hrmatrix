# HUMAN RESOURCE MANAGEMENT INTEGRATED SYSTEM

# (HRMatrix — SUBSYSTEM)

# A Project Document Study

# Presented to the Faculty of the Bachelor of Science in Information Technology

# In Partial Fulfillment of the Requirements

# for the Subject Information Assurance and Security 2

# By:

# Ferdinand G. Espeña Jr.

# Jhon Lesther S. Monleon

# Aldrex M. Cordon

# Meryl Longares

# Justin Quinsay

# BSIT - 3201

# Name of Institution | March 2026

---

# TABLE OF CONTENTS

| Section | Title | Page |
|---------|-------|------|
| I | Project Profile | 1 |
| II | Executive Summary | 2 |
| III | Introduction | 3 |
| IV | Framework | 5 |
| V | System Analysis | 6 |
| VI | System Design | 8 |
| VII | System Modules and Functional Features | 10 |
| VIII | Development Methodology | 12 |
| IX | System Diagrams | 13 |
| X | Testing and Evaluation | 15 |
| XI | Risk Management and Incident Response | 16 |
| XII | Project Schedule / Timeline | 17 |
| XIII | Cost and Resource Requirements | 18 |
| XIV | Expected Outputs and Benefits | 19 |
| XV | Conclusion and Recommendations | 20 |
| XVI | References | 21 |

---

# I. PROJECT PROFILE

## 1. Project Title

**Design and Development of a Secure Integrated Human Resource Management System (HRMatrix)**

This title clearly specifies the type of system being developed, identifies the target users (HR personnel, employees, supervisors, payroll officers, and administrators), and highlights the core function of streamlining human resource operations — all within a security-first context required for Information Assurance and Security 2 (IAS-102).

## 2. Integrated System

HRMatrix integrates the critical human resource processes of an organization — specifically employee lifecycle management, leave request tracking, attendance monitoring, and payroll processing — into a single, centralized, and secure digital platform. Manual processes such as tracking physical 201 employee records, maintaining isolated spreadsheets, and processing paper-based leave request forms are fully automated. This integration dramatically improves operational efficiency, eliminates administrative redundancy, and enforces data security. Role-Based Access Control (RBAC) ensures that each of the five defined user archetypes — Employee, Supervisor, HR Manager, Payroll Officer, and Administrator — can only access information relevant to their operational responsibilities, never more.

## 3. Sub-Systems

**Employee Management Sub-System**
Responsible for the complete lifecycle management of employee records. It handles onboarding, profile management, and employment status updates — including fields for government-mandated IDs (SSS, PhilHealth, Pag-IBIG), civil status, employment type, and compensation data. All records are centralized in a secure, queryable cloud database.

**Leave Management Sub-System**
Automates the entire leave workflow lifecycle — from an employee submitting a request, to a Supervisor providing the first-tier approval, to the HR Manager issuing final authorization. Real-time notifications are dispatched at each stage, and a full audit trail is maintained for every decision made.

**Payroll Processing Sub-System**
Manages payroll period configuration, automated computation of gross pay, government-mandated contributions (SSS, PhilHealth, Pag-IBIG), withholding tax, and overtime pay. Payroll records follow a structured multi-step approval workflow between the Payroll Officer and Administrator before disbursement is finalized.

**Attendance Management Sub-System**
Records daily employee attendance — including time-in, time-out, absences, late arrivals, and half-day entries. Attendance data feeds directly into payroll calculations to ensure accuracy in overtime and deduction computation.

**Security and Access Control Sub-System**
Enforces Role-Based Access Control (RBAC) across all five defined user roles. Authentication is managed exclusively by Supabase Auth, which issues secure session tokens. Row-Level Security (RLS) policies at the database layer ensure that users can only query records they are explicitly authorized to access.

**Reporting and Analytics Sub-System**
Provides data-driven visualizations and structured overviews of headcount, departmental distribution, leave statistics, attendance summaries, and payroll totals — accessible only to administrative-tier accounts via secured dashboards built with Recharts.

## 4. List of Modules

- **Authentication & RBAC Module** — Manages login, session handling via Supabase Auth, role validation, and automatic permission-based routing upon login.
- **Employee Profile Module** — Full CRUD operations for employee records including personal data, government IDs, employment terms, and salary configuration.
- **Leave Request Module** — Enables employees to file, view, and track leave applications with real-time status updates.
- **Leave Approval Module** — Multi-tier approval workflow for Supervisors and HR Managers with note-writing capability and audit logging.
- **Attendance Module** — Daily attendance logging and status management by HR Managers and Administrators.
- **Payroll Module** — Payroll period management, automated computation, and multi-step approval workflow (Payroll Officer → Admin).
- **Notifications & Announcements Module** — Role-targeted system announcements and event alerts for all user tiers.
- **Audit Logs Module** — Complete, tamper-evident logging of all critical system events tied to user IDs and timestamps.
- **Dashboard & Analytics Module** — Role-specific dashboards displaying KPIs, charts, and organizational metrics relevant to each user's access tier.

---

# II. EXECUTIVE SUMMARY

## Introduction and Context

In the rapidly evolving landscape of corporate operations, human capital remains the most critical asset of any organization. The efficient management of employee profiles, organizational hierarchies, and operational processes such as leave requests and payroll directly impacts the strategic agility and overall productivity of a company. However, conventional methods — relying heavily on physical paperwork, disconnected spreadsheets, and fragmented data silos — have persistently hindered human resources (HR) departments. Administrative bottlenecks naturally arise as data becomes redundant and inconsistently synchronized. More critically, the absence of a centralized digital infrastructure poses severe security vulnerabilities, exposing Personally Identifiable Information (PII) and compensation data to both internal misuse and external breach.

In response to these systemic inefficiencies, this project proposes the **Design and Development of HRMatrix: A Secure Integrated Human Resource Management System**. The platform is a comprehensive, role-stratified digital ecosystem engineered to streamline the foundational pillars of HR operations: employee lifecycle management, automated leave tracking, attendance monitoring, and secure payroll processing.

## Problem Identification and System Objectives

The foundational driver of this project is the urgent need to address compounding detriments of manual HR processing. When leave applications are physically routed, they are frequently delayed or lost. When employee records exist simultaneously in accounting, HR, and managerial spreadsheets, a single source of truth becomes impossible — resulting in payroll inaccuracies. Traditional physical folders inherently lack granular authorization — a supervisor cannot be restricted from viewing compensation data of employees outside their department.

The core objectives of HRMatrix are targeted to: automate the end-to-end leave management lifecycle, establish a secure centralized database, automate payroll computation with government-mandated deductions, and provide instant, permissions-gated analytical capabilities to decision-makers.

## Technical Architecture and Secure Design

HRMatrix is built on a modern, decoupled client-side web architecture. The frontend is engineered with **React 18 and TypeScript**, providing a type-safe, responsive, and cross-platform user interface. The application is bundled using **Vite** for optimized build performance. At the data layer, **Supabase** — a managed Backend-as-a-Service platform built on **PostgreSQL** — serves as the secure, scalable foundation for authentication, real-time data operations, and Row-Level Security (RLS) enforcement. All API communication occurs over encrypted HTTPS channels managed by Supabase's infrastructure.

## Security Prioritization and Implementation

Security acts as the absolute cornerstone of this system. HRMatrix enforces the Principle of Least Privilege (PoLP) through a five-tier RBAC model: Administrator, HR Manager, Payroll Officer, Supervisor, and Employee. Authentication is exclusively handled by Supabase Auth, which issues secure JWT-based session tokens — guaranteeing tamper-proof and stateless verification. Database-level Row-Level Security (RLS) policies act as the last line of defense, ensuring that even if application-level checks are bypassed, database queries are still constrained by the authenticated user's role. All critical operations are logged in a dedicated `audit_logs` table, maintaining a transparent culture of digital accountability and non-repudiation.

## Expected Organizational Impact

By transitioning workflows into this integrated and secure digital ecosystem, the organization will achieve an immediate reduction in administrative overhead, elimination of paper-based data risks, increased payroll accuracy, and improved compliance with data privacy standards. HRMatrix does not merely solve a logistical inconvenience — it delivers a scalable, future-proof, and secure technological asset that elevates organizational data stewardship capabilities.

---

# III. INTRODUCTION

## 1. Background of the Study

Human Resource departments in many organizations continue to struggle with legacy processes — relying on paper forms, standalone spreadsheets, and physical 201 files to manage their entire workforce. These conventional methods are fundamentally insecure, operationally slow, and isolated from one another. Sensitive employee data — including compensation, government IDs, and dependent information — is stored without rigid authorization parameters, making it inherently vulnerable to unauthorized access and disclosure.

Furthermore, tracking leave requests manually without a centralized system leads to operational inefficiencies, payroll errors, and departmental miscommunications. Payroll processing conducted through disconnected spreadsheets is especially susceptible to human error, resulting in inaccurate government-mandated contributions and delayed salary releases. Attendance monitoring without a digital system leaves organizations unable to accurately compute overtime or validate deduction legitimacy.

These operational roadblocks create an urgent need for an automated, secure, and integrated platform to replace outdated HR practices — one that not only digitizes workflows but does so with a security-first design philosophy.

## 2. Statement of the Problem

The following specific problems have been identified in the current manual HR system:

1. **Absence of centralized data storage** — Employee profiles, compensation records, and attendance data are scattered across disconnected physical and digital formats, making it impossible to maintain a reliable single source of truth.
2. **Unauthorized access risks** — The lack of strict role-based access restrictions means sensitive employee records, including PII and salary data, can be viewed or modified by unauthorized personnel without any audit trail.
3. **Inefficient leave management** — The paper-based leave request process is slow, prone to loss, and lacks automated tracking mechanisms or reliable approval workflows.
4. **Inaccurate payroll processing** — Without an integrated system, payroll is computed manually, leading to errors in deductions for SSS, PhilHealth, Pag-IBIG, and withholding tax.
5. **No system audit trail** — Critical changes to employee records, leave statuses, and payroll approvals leave no traceable log, making accountability and compliance verification impossible.

## 3. Project Objectives

### General Objective

To design and develop a secure, web-based, integrated Human Resource Management System (HRMatrix) that centralizes employee records, automates leave tracking and payroll processing, and enforces role-based access control across all system operations.

### Specific Objectives

- Implement strict five-tier Role-Based Access Control (RBAC) to differentiate data access and functional capabilities for Administrators, HR Managers, Payroll Officers, Supervisors, and Employees.
- Ensure data confidentiality and integrity by leveraging Supabase Auth for JWT-based session management and Row-Level Security (RLS) policies at the database layer.
- Automate the complete leave management lifecycle — from employee submission through multi-tier supervisor and HR approval — with real-time status notifications.
- Implement automated payroll computation including government-mandated contribution calculations (SSS, PhilHealth, Pag-IBIG) and withholding tax deductions.
- Establish a comprehensive audit logging system that records all critical user actions, ensuring full accountability and non-repudiation across the platform.

## 4. Significance of the Study

The deployment of HRMatrix provides tangible and measurable benefits for all organizational stakeholders:

- **Employees** — Gain a transparent, self-service portal for submitting leave requests, tracking approval status in real-time, and viewing their own payroll and attendance records — eliminating manual follow-ups.
- **Supervisors** — Benefit from a streamlined approval pipeline providing immediate visibility into team attendance, leave history, and pending requests, reducing response time dramatically.
- **HR Managers** — Gain centralized access to all employee data, drastically reducing the administrative burden of handling physical files and enabling data-driven workforce decisions.
- **Payroll Officers** — Can manage complete payroll periods, compute automated deductions, and submit payroll batches for administrative approval — reducing calculation errors and compliance risks.
- **Administrators** — Maintain total configuration control over organizational structure, job titles, pay grades, and system-wide settings with complete audit visibility over all platform activity.
- **Future Researchers** — The architecture and security design of HRMatrix serve as a reference model for developing compliant, role-stratified enterprise information systems.

## 5. Scope and Limitations

### Scope

The system covers the following operational domains:
- End-to-end employee profile management (onboarding, record updates, status changes)
- Multi-tier leave request and approval workflows with notification broadcasting
- Daily attendance recording and status classification
- Automated payroll computation and multi-step approval workflow
- Role-based access control for five distinct user roles
- Dashboard analytics and reporting for administrative roles
- Full audit logging of all critical system events

### Limitations

- **Internet dependency** — The system requires a stable internet connection to access the web platform and Supabase cloud database; offline access is not supported.
- **Cloud database dependency** — Data is hosted exclusively on Supabase's managed PostgreSQL infrastructure; local or on-premise deployment is not currently supported.
- **Fixed role tiers** — User permissions are constrained to the five pre-defined roles; custom role creation or hybrid permission structures are outside the current system scope.
- **No biometric integration** — Attendance is recorded manually by authorized HR staff; biometric or automated time-tracking hardware integration is not included in this version.

---

# IV. FRAMEWORK

## 1. Existing Business Process

In the current workflow, employees manually fill out paper forms or spreadsheets to request leave or update their personnel details. These documents are then physically routed or emailed to supervisors and HR staff for manual review. Payroll is computed by the accounting department using isolated spreadsheets cross-referenced against paper attendance logs. This physical and fragmented paper trail is entirely dependent on human diligence and trust, with no enforced authentication. The security weaknesses are profound: physical documents can be intercepted, lost, or altered without detection. Shared digital spreadsheets frequently grant overly broad access permissions, allowing unauthorized users to view or modify sensitive compensation data without leaving any traceable audit log. There is no mechanism to verify the identity of the person modifying a record.

## 2. Proposed Business Process

The improved workflow transitions all HR operations into HRMatrix's centralized, digitized, and role-governed system. When an employee initiates any transaction — a leave request, a profile update, or a payroll query — they must first authenticate via the Supabase Auth login portal, which issues a secure JWT session token. Their request is systematically routed through automated backend processes and directed to the appropriate authorized party's dashboard. Supervisors execute first-tier leave approvals digitally, which then escalate to HR Managers for final authorization — all over encrypted HTTPS channels. Payroll Officers initiate payroll periods, and the system automatically computes deductions before submitting to the Administrator for final approval. Security checkpoints are embedded at every step: user roles are validated by Row-Level Security policies before any database record is accessed, input validation guards against malicious data entry, and all modifications to personnel records, leave statuses, and payroll entries are logged to the `audit_logs` table — ensuring strict accountability and data integrity throughout the entire organizational workflow.

---

# V. SYSTEM ANALYSIS

## 1. Existing System Analysis

The current legacy HR infrastructure operates entirely on physical documents and disconnected spreadsheets. Its major operational limitations include the inability to instantly query employee data, heavy reliance on physical storage that is vulnerable to loss or damage, and a convoluted multi-day leave request process that depends on physical routing and manual signatures. Its most critical risk is that spreadsheets and shared folders possess no security constraints — any individual with physical or network access can view or modify sensitive employee data, including salary and government ID information, without any system-level restriction or accountability.

## 2. Threat and Risk Assessment

### Threats

- **Insider threats** — Personnel browsing and exfiltrating confidential compensation records or PII without authorization, exploiting the absence of access controls.
- **External intrusion** — Hackers targeting unencrypted employee lists and sensitive data stored in unsecured shared drives or emailed spreadsheets.
- **Accidental data loss** — Hardware failures, physical document misplacement, or unintentional file deletion resulting in permanent loss of employee records.
- **Data manipulation** — Unauthorized alteration of leave balances, attendance records, or payroll figures without detection.

### Vulnerabilities

- Weak or non-existent authentication on spreadsheets, shared file repositories, and email communications.
- No automated backups for physical or digital records.
- Absence of system audit trails when records are modified, accessed, or deleted.
- No mechanism to enforce least-privilege access or restrict cross-departmental record viewing.

### Impact and Likelihood

High impact. Mismanagement of compensation or Personally Identifiable Information (PII) violates data privacy regulations and can result in severe financial penalties, legal liability, and employee dissatisfaction. Human error in leave tracking and payroll computation without automated systems is statistically highly likely to occur on a recurring basis.

## 3. Security Requirements Analysis

### Authentication Requirements

All users must authenticate through Supabase Auth using registered email credentials before accessing any system module. Session tokens (JWT) must be validated on every protected API call. Sessions must automatically expire after a defined period of inactivity to prevent unauthorized reuse of active sessions.

### Authorization Rules

The system must enforce strict Role-Based Access Control (RBAC) across all five tiers. Employees can only view and modify their own records. Supervisors may view their direct subordinates' leave and attendance data only. HR Managers have read/write access to all employee records and leave workflows. Payroll Officers manage payroll periods and computations. Administrators have system-wide access including audit logs, system settings, and user management. Row-Level Security (RLS) policies in PostgreSQL enforce these rules at the database level, independent of application logic.

### Encryption Needs

All data transmission between the React frontend and Supabase backend occurs exclusively over HTTPS to prevent man-in-the-middle interception. All passwords are managed by Supabase Auth's internally cryptographic hashing mechanisms (bcrypt). Sensitive fields within the database are not stored in plain text.

### Logging and Monitoring Requirements

All critical system events — including login attempts, leave status changes, payroll approvals, and employee record modifications — must be logged in the `audit_logs` table. Each log entry must capture the authenticated user ID, the action performed, the affected table and record ID, a snapshot of old and new data values, and a precise timestamp.

## 4. Proposed Secure Integrated System

The proposed HRMatrix platform directly addresses all identified vulnerabilities through its modern, security-first architecture. It employs a React 18 + TypeScript frontend securely interfacing with Supabase's managed PostgreSQL backend via authenticated REST APIs. JWT-based session authentication is required for every protected system interaction. Row-Level Security (RLS) policies enforce data isolation at the database level, ensuring that even in the event of application-layer compromise, unauthorized data access remains impossible. All core HR business processes — leave management, attendance tracking, and payroll — are fully automated with structured approval workflows, eliminating manual errors and establishing a complete digital chain of accountability.

---

# VI. SYSTEM DESIGN

## 1. Secure System Architecture

HRMatrix employs a **decoupled Single-Page Application (SPA) architecture**. The frontend is a React 18 + TypeScript application bundled by Vite and served as static assets via a Content Delivery Network (CDN). It communicates with the backend exclusively through Supabase's RESTful and real-time API endpoints over encrypted HTTPS.

The backend is fully managed by **Supabase**, which orchestrates a PostgreSQL database, authentication services, Row-Level Security enforcement, and real-time subscriptions. This architecture is highly secure because the database is never directly exposed to public internet traffic — all queries are mediated by Supabase's API gateway, which validates the authenticated user's JWT token and role before permitting any data operation.

This design is suitable for the organization's needs because it eliminates the need to manage physical server infrastructure, guarantees high availability through Supabase's cloud hosting, and enforces security at every architectural layer without requiring custom middleware development.

## 2. Network and Application Security Design

**Secure Communication:** All communication between the client browser and Supabase APIs is exclusively transmitted over HTTPS (TLS 1.2+), encrypting all data in transit and preventing interception.

**Session Management:** Supabase Auth issues short-lived JWT access tokens and longer-lived refresh tokens. Access tokens are stored in memory (not localStorage) to prevent XSS-based token theft. Session continuity is handled securely by the Supabase client library.

**Input Validation:** The `validation.ts` library enforces strict client-side validation for all form inputs before data is submitted. Server-side, PostgreSQL's strict data type constraints and RLS policies act as the final validation layer.

**CORS Policy:** Supabase's API gateway enforces strict Cross-Origin Resource Sharing (CORS) restrictions, permitting requests only from the registered application domain.

## 3. Database and Data Security Design

**Data Structure:** The HRMatrix PostgreSQL database is fully normalized into the following primary tables: `profiles`, `employees`, `leave_requests`, `leave_balances`, `attendance_records`, `payroll_periods`, `payroll_records`, `departments`, `audit_logs`, `system_settings`, and `announcements`. Foreign key constraints maintain referential integrity across all relational data.

**Row-Level Security (RLS):** Every table in the database has RLS enabled. Policies are defined per user role — for example, the `employees` table restricts SELECT operations so that employees can only retrieve their own record, while HR Managers can retrieve all records within their organization. These policies are enforced natively by the PostgreSQL engine.

**Encryption:** Passwords are hashed using bcrypt by Supabase Auth and never stored in plaintext. Sensitive employee fields (SSS, PhilHealth, Pag-IBIG numbers) are stored in the database with access gated by RLS policies.

**Backup and Recovery:** Supabase's managed infrastructure includes automated daily database backups with point-in-time recovery (PITR), ensuring data can be restored to any specific moment in case of accidental deletion or corruption.

## 4. Access Control Design

HRMatrix enforces a **five-tier Role-Based Access Control (RBAC)** model:

| Role | Access Level | Key Capabilities |
|------|-------------|-----------------|
| **Administrator** | Full system access | User management, system settings, payroll final approval, audit log review |
| **HR Manager** | Organization-wide HR data | Employee CRUD, leave final approval, attendance management, announcements |
| **Payroll Officer** | Payroll operations | Payroll period creation, computation, submission for admin approval |
| **Supervisor** | Team-level data | First-tier leave approval, team attendance review |
| **Employee** | Personal data only | Leave requests, own profile view, own payroll/attendance records |

Authentication is enforced through Supabase Auth. Upon login, the authenticated user's role is retrieved from the `profiles` table and used by React Router to render only the authorized dashboard and modules. RLS policies independently enforce these restrictions at the database layer, providing defense-in-depth.

## 5. Audit and Logging Design

All critical system events are recorded in the `audit_logs` table with the following captured fields:

- `user_id` — The authenticated user performing the action
- `action` — A descriptive label (e.g., `LEAVE_APPROVED`, `EMPLOYEE_UPDATED`, `PAYROLL_SUBMITTED`)
- `table_name` — The database table affected
- `record_id` — The unique identifier of the affected record
- `old_data` — A JSON snapshot of the record's state before the change
- `new_data` — A JSON snapshot of the record's state after the change
- `created_at` — Precise UTC timestamp of the event

Audit logs are strictly **append-only** — no user role, including the Administrator, has the ability to update or delete audit log entries. This ensures non-repudiation and supports compliance verification. The Administrator dashboard provides a searchable audit log viewer for investigation and accountability review.

---

# VII. SYSTEM MODULES AND FUNCTIONAL FEATURES

## 1. Authentication & RBAC Module

**Purpose:** Controls all system entry points and session lifecycle management.
**Key Features:**
- Secure email/password login via Supabase Auth
- JWT-based session management with automatic token refresh
- Role-based automatic routing upon login to the correct dashboard
- Logout with session token invalidation
**Security:** Unauthorized access attempts are blocked at both the application routing layer and the RLS database layer. All login events are logged.

## 2. Employee Profile Module

**Purpose:** Centralizes all employee record management.
**Key Features:**
- CRUD operations for employee records (HR Manager and Admin only)
- Comprehensive personal data: name, department, position, hire date, employment type, civil status
- Government ID storage: SSS, PhilHealth, Pag-IBIG numbers
- Employee self-service view of own profile
- CSV export of employee data for authorized roles
**Security:** Employees cannot view other employees' records. RLS ensures data isolation per role.

## 3. Leave Request Module

**Purpose:** Provides employees a digital channel to apply for and monitor leave.
**Key Features:**
- Submit leave requests with type selection (vacation, sick, emergency, maternity, paternity, other)
- Real-time tracking of application status: pending → supervisor_approved → hr_approved → approved/rejected
- Leave balance validation prior to submission (server-side enforced)
- View history of all personal leave transactions
**Security:** Leave submissions are tied to the authenticated employee's ID; employees cannot submit on behalf of others.

## 4. Leave Approval Module

**Purpose:** Multi-tier workflow gateway for leave authorization.
**Key Features:**
- Supervisors review and action pending leaves for their direct subordinates (first tier)
- HR Managers review and issue final approval or rejection (second tier)
- Note-writing capability at each approval tier for documentation
- Automatic notification dispatch upon status change
**Security:** Only the employee's assigned supervisor can action the first-tier approval, enforced by RLS.

## 5. Attendance Module

**Purpose:** Records and tracks daily employee attendance.
**Key Features:**
- Log daily attendance records (present, absent, late, half-day) with time-in/time-out
- HR Manager and Admin can manage all employee attendance records
- Monthly attendance summary views per employee
- Attendance data feeds into payroll computation for overtime and deduction calculations
**Security:** Employees can only view their own attendance records.

## 6. Payroll Module

**Purpose:** Manages complete payroll computation and approval workflow.
**Key Features:**
- Payroll Officer creates payroll periods and generates records for all active employees
- Automated computation: basic salary + allowances + overtime pay − SSS − PhilHealth − Pag-IBIG − withholding tax = net pay
- Multi-step approval: Payroll Officer submits → Administrator approves → status changes to `paid`
- Payroll history view for employees (own records only)
- PDF export of payroll slips via jsPDF
**Security:** Payroll records are access-gated by role; employees cannot view others' pay records.

## 7. Notifications & Announcements Module

**Purpose:** Keeps all system users informed of relevant events and organizational updates.
**Key Features:**
- System-generated in-app notifications for leave status changes and payroll updates
- Announcements broadcast by HR Managers or Administrators to targeted role groups
- Notification read/unread state tracking per user
**Security:** Announcements are filtered by the authenticated user's role; users only receive notifications relevant to their tier.

## 8. Audit Logs Module

**Purpose:** Provides administrators a complete, tamper-evident record of system activity.
**Key Features:**
- Automatic logging of all critical CRUD operations across all modules
- Searchable and filterable audit log viewer on the Admin Dashboard
- Each entry captures: user, action, table, record ID, before/after data snapshot, and timestamp
**Security:** Audit log entries are immutable — no user can edit or delete them.

## 9. Dashboard & Analytics Module

**Purpose:** Delivers role-specific operational insights and KPI visualizations.
**Key Features:**
- Admin Dashboard: total headcount, department distribution pie chart, leave approval trends, payroll totals, audit activity
- HR Manager Dashboard: employee status breakdown, pending leaves, attendance overview
- Payroll Officer Dashboard: payroll period status, computation summaries
- Supervisor Dashboard: team attendance summary, pending leave actions
- Employee Dashboard: personal leave balance, attendance summary, latest payroll record
- All charts built with Recharts for responsive data visualization
**Security:** Lower-tier users cannot access company-wide analytics; data is filtered by RLS to their authorized scope.

---

# VIII. DEVELOPMENT METHODOLOGY

## 1. Secure Software Development Life Cycle (Secure SDLC)

HRMatrix was developed following an **Agile methodology** infused with security best practices at every sprint cycle in alignment with a Secure SDLC approach.

| Phase | Activities | Security Activities |
|-------|------------|-------------------|
| **Requirements** | Define functional HR requirements, identify user roles | Define RBAC rules, identify data classification requirements, document threat model |
| **Design** | System architecture, database schema, UI wireframes | Enforce Principle of Least Privilege in role design, define RLS policy specifications |
| **Development** | Frontend components (React/TypeScript), Supabase integration | Implement RLS policies, JWT session management, input validation, audit logging |
| **Testing** | Unit tests, integration tests, UAT | Role-based authorization tests, XSS/SQL injection testing, unauthorized access tests via Postman |
| **Deployment** | Vite build, CDN deployment, Supabase production configuration | HTTPS enforcement, CORS policy configuration, RLS policy verification in production |
| **Maintenance** | Bug fixes, feature enhancements | Regular audit log review, dependency vulnerability patching |

## 2. Tools and Technologies

| Category | Tool / Technology |
|----------|------------------|
| **Frontend Language** | TypeScript 5.3 |
| **Frontend Framework** | React 18.2 |
| **Build Tool** | Vite 5.0 |
| **Routing** | React Router DOM 6.22 |
| **Backend-as-a-Service** | Supabase (PostgreSQL + Auth + RLS + Real-time) |
| **Data Visualization** | Recharts 3.8 |
| **PDF Generation** | jsPDF 4.2, jsPDF-AutoTable 5.0 |
| **Authentication** | Supabase Auth (JWT-based) |
| **Database** | PostgreSQL (via Supabase) |
| **Security Enforcement** | Row-Level Security (RLS) Policies |
| **Development Environment** | Visual Studio Code, Node.js, pnpm |
| **Version Control** | Git / GitHub |

---

# IX. SYSTEM DIAGRAMS

## System Architecture Diagram

This diagram illustrates the decoupled Single-Page Application (SPA) architecture of HRMatrix. The React 18 + TypeScript frontend, compiled by Vite, is served as static assets via a CDN. The application communicates with the Supabase Backend-as-a-Service platform through authenticated REST API calls over HTTPS. Supabase manages the PostgreSQL database, enforces Row-Level Security (RLS) policies for every query, and issues JWT session tokens via its Auth service. The database is completely isolated from public internet exposure — all access is mediated exclusively through the Supabase API gateway.

## Network Security / Deployment Diagram

This diagram demonstrates the network security layers protecting the HRMatrix system. External users access the application through a web browser over encrypted HTTPS connections. Frontend static assets are served from a CDN. All API requests are directed to the Supabase cloud infrastructure, which enforces strict CORS policies and validates JWT tokens before routing queries to the PostgreSQL database. The database itself has no direct external connection point and is guarded by both Supabase's API gateway and PostgreSQL's native RLS policies.

## Entity-Relationship Diagram (ERD)

The ERD visualizes the normalized PostgreSQL database structure. The central entity is `employees`, linked to `profiles` (authentication identity), `leave_requests` (with status tracking), `leave_balances` (per-year leave quota), `attendance_records` (daily logs), and `payroll_records` (linked to `payroll_periods`). The `audit_logs` table references `profiles` via `user_id` for accountability. `departments` link to `employees` via departmental assignment. This fully normalized structure eliminates data redundancy and establishes clear relational integrity across all HR data domains.

## Use Case Diagram

This diagram maps out the RBAC boundaries of HRMatrix. It visually defines the specific capabilities granted to each actor:
- **Employee** — View own profile, submit leave requests, view own attendance and payroll records
- **Supervisor** — All employee capabilities + review team attendance, action first-tier leave approvals
- **HR Manager** — All supervisor capabilities + manage all employee records, issue final leave approvals, manage attendance, post announcements
- **Payroll Officer** — Manage payroll periods, compute and submit payroll batches for admin approval
- **Administrator** — Full system access including user management, system settings, payroll final approval, and audit log review

This diagram establishes visual proof that the system enforces the Principle of Least Privilege across all user interactions.

---

# X. TESTING AND EVALUATION

## 1. Security Testing

### Types of Tests Conducted

- **Role-Based Authorization Tests** — Verified that each user role can only access and modify records permitted by their RBAC tier. Attempted cross-role data access (e.g., Employee accessing another employee's payroll) was confirmed to be rejected at both the API and database layers.
- **API Endpoint Security Tests** — All protected API routes were tested using Postman with expired tokens, invalid tokens, and missing authorization headers to confirm that unauthorized requests are rejected with HTTP 401/403 responses.
- **XSS Vulnerability Assessment** — Input fields were tested with malicious script injection payloads to confirm that input validation and React's default HTML escaping prevent reflected XSS attacks.
- **SQL Injection Assessment** — Confirmed that Supabase's parameterized query interface prevents all SQL injection vectors at the database layer.
- **Privilege Escalation Test** — Verified that role values in the `profiles` table cannot be modified by Employees or Supervisors; only Administrators can alter user roles.

### Tools Used

- Postman — API endpoint testing and authorization verification
- Browser Developer Tools — Session token inspection and XSS testing
- Supabase Dashboard — RLS policy testing and query monitoring

### Results Summary

All unauthorized access attempts were successfully rejected. Role-based routing correctly redirected users to their authorized dashboard context. RLS policies confirmed data isolation per role in all tested scenarios. No SQL injection or XSS vulnerabilities were discovered.

## 2. Evaluation Criteria

| Criterion | Result |
|-----------|--------|
| **Performance** | API response times remain under 500ms for all standard queries under normal load conditions |
| **Security** | Unauthorized data access is blocked at both application and database layers; all critical events are audited |
| **Usability** | Responsive UI across desktop and tablet viewports; role-specific interfaces reduce cognitive load per user |
| **Reliability** | Supabase-managed infrastructure provides high availability; automated backups ensure data recoverability |

---

# XI. RISK MANAGEMENT AND INCIDENT RESPONSE

## 1. Risk Management Plan

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Unauthorized access to employee data | Medium | High | RLS enforcement, JWT session management, RBAC role verification |
| Data loss due to cloud database failure | Low | High | Supabase automated daily backups with point-in-time recovery (PITR) |
| Session hijacking / token theft | Low | High | Short-lived JWT access tokens; tokens stored in memory, not localStorage |
| SQL injection attack | Low | High | Supabase parameterized query interface; no raw SQL from user inputs |
| Insider data exfiltration | Medium | High | RLS data isolation; audit log monitoring; least-privilege enforcement |
| Payroll computation errors | Medium | High | Automated formula computation; multi-step approval workflow before disbursement |
| System downtime (dependency on internet) | Medium | Medium | Supabase SLA-backed uptime; fallback user notifications via announcements module |
| Unauthorized role elevation | Low | Critical | Role values are managed exclusively by the Administrator; RLS prevents self-modification |

**Monitoring Plans:** The Administrator must conduct periodic reviews of the `audit_logs` table to identify anomalous patterns such as high-frequency failed queries, unexpected role-change events, or data modification spikes outside of normal working hours.

## 2. Incident Response Plan

### Step 1: Detection
Anomalous activity is identified through the Admin Dashboard's audit log viewer — unusual access patterns, unauthorized modification attempts, or repeated authentication failures are flagged for investigation.

### Step 2: Reporting
The detecting administrator immediately reports the incident to the IT Security Officer or designated data protection officer, documenting the affected records, the timeline, and the responsible user ID from the audit log.

### Step 3: Containment
The affected user account is immediately deactivated through the Administrator's User Management interface, invalidating all active sessions. If a broader compromise is suspected, Supabase's emergency access revocation controls can be engaged to suspend all API access to the database.

### Step 4: Recovery
Affected records are restored from the most recent clean backup using Supabase's PITR capability. All recovery actions are documented and logged. The corrected records are reviewed by the HR Manager before re-entering live operation.

### Step 5: Post-Incident Review
A complete review of the incident, its root cause, the response effectiveness, and recommended system hardening measures is conducted and documented within 72 hours of containment.

---

# XII. PROJECT SCHEDULE / TIMELINE

| Phase | Tasks | Duration | Responsible Members |
|-------|-------|----------|-------------------|
| **Phase 1: Requirements & Planning** | Define system requirements, RBAC model, database schema design, threat modeling | Week 1–2 | All members |
| **Phase 2: System Design** | UI/UX wireframes, ERD design, security policy specification, architecture blueprint | Week 3–4 | Espeña, Monleon |
| **Phase 3: Database Setup** | PostgreSQL schema creation, RLS policy implementation, seed data configuration | Week 5–6 | Cordon, Longares |
| **Phase 4: Frontend Development** | React component development, routing, role-based dashboards, form validation | Week 7–10 | Espeña, Monleon, Quinsay |
| **Phase 5: Module Integration** | Leave workflow, payroll computation, attendance module, audit logging | Week 11–13 | All members |
| **Phase 6: Security Testing** | Authorization tests, penetration testing, RLS verification, XSS/SQLi testing | Week 14 | Cordon, Espeña |
| **Phase 7: Documentation** | Project document finalization, system diagrams, user guide | Week 15 | All members |
| **Phase 8: Presentation & Demo** | Final system demonstrations, Q&A preparation | Week 16 | All members |

**Total Estimated Duration: 16 Weeks (4 Months)**

---

# XIII. COST AND RESOURCE REQUIREMENTS

## Hardware Requirements

| Item | Specification | Purpose | Estimated Cost |
|------|--------------|---------|---------------|
| Development Laptops (5 units) | Core i5 / 8GB RAM minimum | Frontend development and testing | Existing (owned by team) |
| Network Access | Stable broadband internet connection | Supabase API access, version control | PHP 500/month per member |

## Software Requirements

| Tool / Service | License Type | Purpose | Cost |
|---------------|-------------|---------|------|
| Supabase (Free Tier) | Free | Database, authentication, RLS, real-time | PHP 0 |
| Vite + React + TypeScript | Open Source | Frontend framework and build tooling | PHP 0 |
| GitHub | Free (private repo) | Version control and collaboration | PHP 0 |
| Visual Studio Code | Free | Development IDE | PHP 0 |
| Postman | Free Tier | API testing and security testing | PHP 0 |
| Netlify (Free Tier) | Free | Application hosting and deployment | PHP 0 |

## Manpower Requirements

| Role | Member | Estimated Hours |
|------|--------|----------------|
| Project Lead / Full-Stack Developer | Ferdinand G. Espeña Jr. | 120 hrs |
| Frontend Developer | Jhon Lesther S. Monleon | 100 hrs |
| Backend / Database Developer | Aldrex M. Cordon | 100 hrs |
| Documentation & QA | Meryl Longares | 80 hrs |
| Security Testing & Integration | Justin Quinsay | 80 hrs |

## Total Estimated Project Cost

| Category | Estimated Cost |
|----------|---------------|
| Internet connectivity (4 months) | PHP 10,000 |
| Software licenses | PHP 0 (all open-source/free tier) |
| Printing and documentation | PHP 500 |
| Miscellaneous | PHP 1,000 |
| **Total** | **PHP 11,500** |

The lean cost profile of HRMatrix is made possible by leveraging the Supabase free tier for backend infrastructure and open-source frontend technologies, making the project highly feasible for an academic development team.

---

# XIV. EXPECTED OUTPUTS AND BENEFITS

**Functional System:** A centralized, role-stratified, and secure HRMatrix web application accessible from any internet-connected device — encompassing employee management, leave workflows, attendance tracking, and payroll processing under a single unified platform.

**Technical Documentation:** Comprehensive system architecture documentation, database schema reference, RLS policy specifications, API endpoint reference, and a user guide for each of the five user roles.

**Security Improvements:** Elimination of paper-trail vulnerabilities, establishment of a database-level RLS enforcement layer, JWT-secured authenticated sessions, and a complete tamper-evident audit log replacing the current system's total absence of accountability controls.

**Organizational Benefits:**
- Significant reduction in HR administrative processing time through workflow automation
- Improved payroll accuracy through automated government contribution computation (SSS, PhilHealth, Pag-IBIG, withholding tax)
- Establishment of a single, authoritative source of truth for all employee data
- Increased data privacy compliance readiness through strict access control and audit logging
- Scalable architecture ready to support organizational growth without infrastructure redesign

---

# XV. CONCLUSION AND RECOMMENDATIONS

The HRMatrix Secure Integrated Human Resource Management System represents a comprehensive modernization of fragmented, manual HR operations into a centralized, highly secure, and fully automated digital infrastructure. The system successfully delivers automated leave tracking with multi-tier approval workflows, complete employee lifecycle management, automated payroll computation with government-mandated deductions, and daily attendance monitoring — all governed by a robust five-tier Role-Based Access Control model enforced at both the application and PostgreSQL database layers through Row-Level Security policies.

The platform directly addresses all identified problems in the existing manual system: data isolation is enforced through RLS, unauthorized access is prevented through JWT authentication and RBAC, payroll accuracy is ensured through automated computation, and complete organizational accountability is established through an immutable audit logging system.

**Recommendations for future iterations:**

1. **Multi-Factor Authentication (MFA)** — Integrate TOTP-based MFA via Supabase Auth for administrative-tier accounts to add an additional layer of authentication security.
2. **Automated Payroll Disbursement Integration** — Connect the payroll module to banking APIs for direct salary transfer upon Administrator approval.
3. **Native Mobile Application** — Develop a React Native companion app to allow employees to submit leave requests and check payroll records from mobile devices.
4. **Biometric Attendance Integration** — Interface with biometric hardware APIs to automate attendance logging and eliminate manual time-in/time-out recording.
5. **Advanced Analytics and HR Intelligence** — Implement predictive analytics for workforce planning, attrition risk modeling, and leave pattern analysis using historical system data.

---

# XVI. REFERENCES

- National Institute of Standards and Technology (NIST). *Special Publication 800-53: Security and Privacy Controls for Federal Information Systems and Organizations.*
- Supabase, Inc. (2024). *Supabase Documentation: Row-Level Security.* https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, Inc. (2024). *Supabase Auth Documentation.* https://supabase.com/docs/guides/auth
- React Team. (2024). *React 18 Official Documentation.* https://react.dev
- TypeScript Team. (2024). *TypeScript Handbook.* https://www.typescriptlang.org/docs
- OWASP Foundation. (2023). *OWASP Top Ten Web Application Security Risks.* https://owasp.org/www-project-top-ten/
- Philippine Social Security System (SSS). *SSS Contribution Table and Computation Guidelines.* https://www.sss.gov.ph
- Philippine Health Insurance Corporation (PhilHealth). *Premium Contribution Schedule.* https://www.philhealth.gov.ph
- Home Development Mutual Fund (Pag-IBIG). *Contribution and Benefits Guidelines.* https://www.pagibigfund.gov.ph
- Bureau of Internal Revenue (BIR). *Revised Withholding Tax Table.* https://www.bir.gov.ph
- Pressman, R. S. & Maxim, B. (2020). *Software Engineering: A Practitioner's Approach* (9th ed.). McGraw-Hill Education.
- ISO/IEC 27001:2022. *Information Security Management Systems — Requirements.* International Organization for Standardization.
