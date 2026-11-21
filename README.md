# HunarHub

### A local marketplace for skilled hands and handmade work

HunarHub connects customers with local micro-entrepreneurs, independent makers, and service providers. Customers can discover skills and products, request services, and place product orders. Entrepreneurs can manage their profiles and listings, while administrators oversee applications and marketplace activity.

> **Project status:** Responsive web application with customer, entrepreneur, and administrator workflows. Digital payments, logistics, native mobile apps, and training/certification are future enhancements.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, JavaScript, Bootstrap 5, Vite |
| Backend | Node.js, Express 4 |
| API | REST, JSON |
| Database | PostgreSQL, `pg` connection pool |
| Authentication | Database-backed HTTP-only sessions, scrypt password hashing |
| Uploads | Multer, `file-type`, local image storage |
| Tests | Node.js built-in test runner |

## Key features

### Marketplace
- Browse verified entrepreneurs and handmade products.
- Filter by category, skill, location, search term, and service price.
- View entrepreneur profiles, services, product details, ratings, and reviews.
- Paginated discovery with responsive layouts for desktop and mobile.

### Customer accounts
- Register, sign in, and manage an authenticated session.
- Submit service requests and product order requests.
- Review eligible completed transactions and track request/order activity.
- Submit complaints and receive in-app notifications.

### Entrepreneur workspace
- Create and edit a public business profile and select marketplace skills.
- Add, update, activate, and deactivate service and product listings.
- Upload product images and manage availability.
- Review incoming orders and service requests.
- View transaction history, completed earnings, and profile verification status.

### Administration
- Review, approve, or reject entrepreneur applications.
- Manage marketplace categories and skills.
- Monitor orders, service requests, and complaints.
- View date-filtered marketplace activity and performance reports.

## Getting started

### Prerequisites

- Node.js 20 or newer
- PostgreSQL 16 or newer, running locally
- PostgreSQL command-line tools (`psql` and `createdb`)

### 1. Create a local database

Start your PostgreSQL service, then open a terminal and connect as a PostgreSQL administrator:

```powershell
psql -U postgres -h localhost
```

At the `postgres=#` prompt, create an application user and database. Replace the placeholder with a password you choose locally:

```sql
CREATE USER hunarhub WITH PASSWORD 'replace_with_a_local_password';
CREATE DATABASE hunarhub OWNER hunarhub;
\q
```

If the role or database already exists, use the existing local database credentials instead of creating duplicates.

### 2. Configure the environment

From the project root, copy the example file and edit the database connection string:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` to your local PostgreSQL connection. For example:

```dotenv
DATABASE_URL=postgresql://hunarhub:replace_with_a_local_password@localhost:5432/hunarhub
```

Percent-encode URL-special characters in the password. Keep `.env` private; it is ignored by Git. `APP_ORIGIN` must match the browser origin used to open the Vite frontend.

### 3. Create the schema and catalog

```powershell
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\schema.sql
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\seed.sql
```

The seed file creates the default categories and skills. It does not create sample entrepreneurs or sample services. If demo profiles from an earlier version exist, the seed deactivates them and their listings without deleting transaction history or registered profiles.

### 4. Install dependencies and run

```powershell
npm install
npm run dev
```

Open the frontend at [http://localhost:5173](http://localhost:5173). The Express API runs at [http://localhost:4000](http://localhost:4000), and its health endpoint is [http://localhost:4000/api/health](http://localhost:4000/api/health).

## Administrator setup

Administrator accounts cannot be registered through the public sign-up form. After applying the database schema, set these variables in the local terminal and create the account:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_NAME = "Marketplace Admin"
$securePassword = Read-Host "Enter a unique admin password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    npm run admin:create
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Use a unique password of at least 10 characters and do not commit it or share it in source control.

## Existing database migrations

Fresh databases should use the current `backend/sql/schema.sql`. For databases created by earlier project versions, apply applicable migrations in order after the original schema:

```powershell
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\migrations\002_accounts_transactions.sql
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\migrations\003_skills_catalog.sql
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\migrations\004_in_app_notifications.sql
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\migrations\005_demo_entrepreneurs.sql
psql -h localhost -U hunarhub -d hunarhub -f backend\sql\migrations\006_hide_demo_profiles.sql
```

Run migrations only when upgrading a database that does not already have those changes. The demo-profile cleanup migration deactivates sample profiles and their listings while preserving any transaction history. The seed can also be rerun safely to refresh catalog entries and keep old demo profiles inactive.

## Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and Vite frontend together with file watching |
| `npm run dev:api` | Run the Express API only |
| `npm run dev:web` | Run the Vite frontend only |
| `npm run build` | Create the production frontend bundle |
| `npm test` | Run the automated Node.js test suite |
| `npm start` | Start the Express API |
| `npm run admin:create` | Create an administrator from local environment variables |

The Vite development server proxies `/api` requests to Express. Login and registration use in-memory rate limiting by default. Configure a shared rate-limit store if deploying multiple API instances. Set `TRUST_PROXY=1` only when the server is behind exactly one trusted reverse proxy.

## Project structure

```text
backend/
  sql/                  PostgreSQL schema, migrations, and catalog seed
  src/
    routes/             Authentication, marketplace management, and transactions
    scripts/            Administrative setup utilities
frontend/
  src/
    auth/               Registration, sign-in, and session context
    dashboard/          Customer, entrepreneur, and admin workspaces
    marketplace/        Maker and product detail views
    notifications/      In-app notification center
    App.jsx             Marketplace layout and navigation
    styles.css          Responsive visual system
```

## Security and operational notes

- Passwords are stored as scrypt hashes; session tokens are stored as hashes.
- Session cookies are HTTP-only and same-site.
- Registration and sign-in endpoints are rate-limited.
- State-changing API routes validate the trusted frontend origin.
- Product image uploads are limited to supported image formats and 5 MB.
- Local uploads are stored under `backend/uploads`; production deployments should use durable object storage.
- Product orders are requests and do not represent payment processing or payment confirmation.
- In-app notifications are supported; email/SMS delivery is not currently included.

## Scope and future enhancements

The current scope includes a responsive web marketplace, entrepreneur profiles and listings, customer order and service-request management, and an administrator dashboard.

Planned future enhancements:
- Native mobile applications
- Digital payments and wallets
- Logistics and delivery integration
- Skills training and certification

## Documentation

- [Product and technical design](./HunarHub-Project-Design.md) — requirements, user flows, data model, and acceptance criteria.

## License

No license has been specified for this project yet. All rights remain with the project owner unless a license is added.
