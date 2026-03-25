# HRMatrix — Management Suite

A modern, comprehensive Human Resources Management System (HRMS) built with **React**, **Vite**, **TypeScript**, and **Supabase**. HRMatrix provides specialized portals for Administrators, HR Managers, Payroll Officers, Supervisors, and Employees to manage organizational data, attendance, leave requests, and payroll efficiently.

## 🚀 Key Features

-   **Multi-Role Dashboards**: Tailored interfaces for Admin, HR, Payroll, Supervisor, and Employee.
-   **Attendance Tracking**: Daily time-in/out logs with status indicators (Late, Present, Absent).
-   **Leave Management**: End-to-end workflow from application to supervisor endorsement and HR approval.
-   **Payroll Processing**: Period-based payroll generation, deduction calculations (SSS, PhilHealth, Pag-IBIG), and payslip release.
-   **System Audit Logs**: Track all critical system actions for compliance and security.
-   **Modern UI**: Responsive design with skeleton loading states and real-time updates.

## 🛠️ Tech Stack

-   **Frontend**: React 18, Vite, TypeScript
-   **Styling**: Vanilla CSS (Custom Design System)
-   **Backend/Database**: Supabase (PostgreSQL, Auth, RLS)
-   **State Management**: React Hooks & Context

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
-   [Node.js](https://nodejs.org/) (v18 or higher)
-   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
-   A [Supabase](https://supabase.com/) account and project

## ⚙️ Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/Lesthermonleon/hrmatrix.git
cd hrmatrix
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Configuration
1.  Go to your **Supabase Dashboard** -> **SQL Editor**.
2.  Copy the contents of `schema.sql` from the root of this project.
3.  Paste and run the script to create tables, RLS policies, and triggers.

### 4. Environment Variables
Create a `.env` file in the root directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
*Note: You can find these in Project Settings -> API in the Supabase dashboard.*

### 5. Run the Application
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

## 📦 Available Scripts

-   `npm run dev`: Start the development server.
-   `npm run build`: Build the production-ready application.
-   `npm run preview`: Preview the production build locally.

---

© 2026 HRMatrix Management Suite
