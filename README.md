# Rayana People — Employee & HR Management System

**Rayana Travels** · Inbound tourism company · Sri Lanka

Modern full-stack MERN HRMS for Rayana's employees, guides, reservations, guest services, transport, tour operations, sales and finance teams.

## Modules

| Module | Available functionality |
| --- | --- |
| Login | Admin, HR Manager and Employee roles; hashed passwords, JWT session |
| HR Dashboard | Headcount, today's attendance, pending leave, payroll summary, recent actions |
| Employee Directory | Add/edit staff, designation, department, joining date, employment type, salary, languages, license |
| Departments | Six tourism-oriented seed departments; add custom departments |
| Attendance | Employee check-in/check-out, late flag (after 9:15 AM Sri Lanka time), HR manual entries |
| Leave | Requests, pending/approved/rejected review, notes, self-service portal |
| Payroll | Monthly draft salary records, allowances/deductions, admin-only paid flag, printable statement |
| Reports | Four CSV exports for recently loaded employee/attendance/leave/payroll records |
| Security | No public registration, role-based API checks, rate limiting, admin audit log screen, validation, helmet, CORS |

**Important:** This is an internship/demo-ready application, **not a production-certified payroll or biometric attendance solution**. Payroll is manual recordkeeping; no Sri Lankan EPF, ETF, APIT/PAYE statutory rules, overtime, holiday calendars, bank transfers, real tax filing, or automated leave-entitlement calculations are provided. A paid flag does not transfer funds. Guide license field is informational, not official validation. Before live HR use, add backups, user provisioning/reset workflow, MFA, sensitive-field access reviews, encryption, retention policy, payroll/legal review, production HTTPS, hardened HttpOnly sessions/CSRF protection, integration tests, external security review, and privacy compliance.

## Requirements

- Node.js 22.x (or compatible supported Node.js release)
- npm
- **MongoDB Atlas** (recommended) or MongoDB server
- Windows PowerShell and VS Code

The backend defaults to port **5001** (to avoid conflict with the Inventory + POS project's port 5000). The web UI uses **localhost:5173** and does not expose a LAN server by default.

## Step-by-step Windows setup

1. Unzip and open `employee-hr-management-system` in VS Code. Or clone your newly created GitHub repo in VS Code and copy the unzipped **contents** into the cloned folder; preserve `.git` and README as appropriate.
2. In VS Code terminal (PowerShell), run:

   ```powershell
   npm.cmd run install:all
   ```

3. In File Explorer or VS Code, copy **`server/.env.example` to `server/.env`**. Replace the placeholders for:

   - `MONGODB_URI`: MongoDB Atlas connection string. Recommended database name `rayana_hrms`, distinct from the Inventory POS database.
   - `JWT_SECRET`: a unique, random **32+ character** secret; never reuse Inventory POS JWT secret.
   - `ADMIN_EMAIL`: email for initial administrator.
   - `ADMIN_PASSWORD`: unique, strong **12–72 byte** password. Do **not** commit this file.

   Do not paste these secrets into screenshots, chat, GitHub or commits.

4. Create the administrator and Rayana tourism departments **once**:

   ```powershell
   npm.cmd run seed
   ```

   Re-running this seed is safe for admin credentials: existing password is NOT overwritten. The seed only creates the initial admin if absent and inserts missing department names.

5. Stop the previous Inventory/POS Vite frontend if it is still using port `5173` (`Ctrl + C` in its terminal). This HR app is configured to require `5173`, to avoid silently switching ports. Then start the backend and frontend together:

   ```powershell
   npm.cmd run dev
   ```

6. Visit **http://localhost:5173/** using the same computer. Log in with your chosen `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
7. Try Employees > Add employee. HR Manager or Employee portal account: Employees > key icon on a row (administrator only) > choose role and initial password. Employee self-service is available after login.

### Optional: Populate fictional demo records

**Only for a fresh/empty DEMO database.** This step is NOT required. The regular seed above creates no fake employee data. The optional sample data includes 12 **fictional** employee profiles, attendance, leave and payroll records. Never use demo records in real HR/payroll operations.

1. Confirm you are connected to the intended empty **demo** database, not a company's real database.
2. Add `CONFIRM_DEMO_SEED=YES` to `server/.env`.
3. Run `npm.cmd run seed:demo`.
4. Remove `CONFIRM_DEMO_SEED=YES` from `server/.env` afterward.

The demo seeder refuses to run if any employees already exist. `@rayana.example` email addresses and sample salaries are fictional.

## GitHub update through VS Code Source Control

1. Clone the existing `employee-hr-management-system` GitHub repo in VS Code (your repository already exists).
2. Copy files from this project ZIP into that cloned repository. Keep its `.git` intact.
3. Verify `.env` and `node_modules` are **not** in Source Control's staged files.
4. Select Source Control (`Ctrl + Shift + G`) > **Stage All**.
5. Commit message: `feat: build Rayana Travels MERN HR management system`.
6. Select **Sync Changes** or **Push**.

## API overview

- `POST /api/auth/login` and `GET /api/auth/me`
- `GET/POST /api/departments`
- `GET/POST /api/employees`, `PATCH /api/employees/:id`, `POST /api/employees/:id/account` (admin)
- `GET /api/attendance`, `POST /api/attendance/check-in`, `/check-out`, `/manual` (HR)
- `GET/POST /api/leaves`, `PATCH /api/leaves/:id/review` (HR)
- `GET/POST /api/payroll`, `PATCH /api/payroll/:id/pay` (admin)
- `GET /api/overview`, `GET /api/audit` (admin)

All `/api` routes except health/login require a valid JWT. Staff management endpoints require Admin/HR role; payroll 'paid' and creation of logins are Admin-only. Employee accounts see only their own basic profile, attendance, leave and payroll.

## Known limitations

- Requires a reachable MongoDB server. The app cannot function offline.
- CSV exports contain up to the recent 200 records fetched into the screen (employee directory up to 500); they are not full-history exports.
- Manual attendance entry is a logged HR action; this is **not** biometric or geofenced verification.
- No employee deletion in the UI; change employee status to `Inactive` instead.
- Self-service account passwords require administrator-managed setup; there is no forgotten-password flow.
- The client stores JWT in sessionStorage for simplicity; reassess with an HttpOnly cookie-based security design for production use.
- Importing sample data and adding live employee information in the same database is discouraged.

## Folder layout

```text
employee-hr-management-system/
├── client/
│   ├── src/App.jsx         # React modules and forms
│   └── src/styles.css      # Rayana visual system
├── server/
│   ├── src/index.js        # Express REST API and access policies
│   ├── src/models.js       # MongoDB models
│   ├── scripts/seed.js     # Admin + department bootstrap
│   ├── scripts/demo-seed.js# Optional fictional data
│   └── .env.example
├── .gitignore
└── README.md
```
