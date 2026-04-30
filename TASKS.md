# ✅ TASKS — Personal Finance Tracker

> Atomic development tasks in execution order.
> Stack: React Router v7 · Hono · Drizzle ORM · PostgreSQL · Better Auth

---

## Legend
- [ ] Not started
- [🔄] In progress
- [✅] Done
- [🔗] Blocked by another task

---

## Phase 0 — Project Scaffolding

### 0.1 Root Setup
- [✅] Initialize `package.json` (name, scripts, workspaces)
- [✅] Create `tsconfig.json` with path aliases (`@app`, `@server`, `@db`)
- [✅] Create `.env.example` with all required variables
- [✅] Create `.gitignore` (node_modules, .env, dist, .drizzle)
- [✅] Create `docker-compose.yml` (PostgreSQL 16 + pgAdmin)

### 0.2 React Router v7 Setup
- [✅] Install `react-router`, `@react-router/node`, `@react-router/dev`
- [✅] Create `vite.config.ts` with `@react-router/dev/vite` plugin
- [✅] Create `react-router.config.ts` (ssr: true)
- [✅] Create `app/root.tsx` (html shell, links, outlet)
- [✅] Create `app/entry.client.tsx`
- [✅] Create `app/entry.server.tsx`
- [✅] Create `app/tailwind.css` with Tailwind directives
- [✅] Create `tailwind.config.js` (content paths, theme)
- [✅] Create `postcss.config.js`

### 0.3 Hono Server Setup
- [✅] Install `hono`, `@hono/node-server`, `@hono/zod-validator`
- [✅] Create `server/index.ts` — Hono app entry point
- [✅] Add CORS middleware (allow frontend origin)
- [✅] Add logger middleware
- [✅] Add global error handler (JSON error responses)
- [✅] Mount React Router handler for non-`/api/*` routes
- [✅] Configure server start script in `package.json`

### 0.4 Drizzle ORM Setup
- [✅] Install `drizzle-orm`, `drizzle-kit`, `postgres`
- [✅] Create `drizzle.config.ts` (schema path, out path, driver: pg)
- [✅] Create `server/lib/db.ts` (postgres connection pool + drizzle instance)
- [✅] Test DB connection on server startup with a ping

---

## Phase 1 — Database Schema

### 1.1 Schema Files
- [✅] Create `db/schema/categories.ts` — categories table + enum
- [✅] Create `db/schema/transactions.ts` — transactions table + enums
- [✅] Create `db/schema/budgets.ts` — budgets table
- [✅] Create `db/schema/index.ts` — re-export all schemas
- [✅] Add Drizzle relations (transactions → users, categories)

### 1.2 Better Auth Schema
- [✅] Install `better-auth`
- [✅] Run `npx better-auth generate` to get auth schema (users, sessions, accounts)
- [✅] Merge auth schema into `db/schema/auth.ts`
- [✅] Create `server/lib/auth.ts` — Better Auth instance with Drizzle adapter

### 1.3 Migrations & Seed
- [✅] Run `npx drizzle-kit generate` — generate first migration
- [✅] Run `npx drizzle-kit push` — apply to local DB
- [✅] Create `db/seed.ts` — seed default categories + demo transactions
- [✅] Add `npm run db:seed` script

---

## Phase 2 — Auth

### 2.1 Server Auth Routes
- [✅] Create `server/routes/auth.ts` — mount Better Auth handler at `/api/auth/**`
- [✅] Add auth middleware helper `requireAuth()` for protected routes
- [✅] Test: POST `/api/auth/sign-up/email`
- [✅] Test: POST `/api/auth/sign-in/email`
- [✅] Test: POST `/api/auth/sign-out`
- [✅] Test: GET `/api/auth/session`

### 2.2 Frontend Auth Client
- [✅] Create `app/lib/auth-client.ts` — Better Auth React client
- [✅] Create `app/lib/session.ts` — `requireSession()` helper for loaders
- [✅] Create `app/routes/auth.login.tsx` — login form (loader + action)
- [✅] Create `app/routes/auth.register.tsx` — register form (loader + action)
- [✅] Create `app/routes/auth.logout.tsx` — logout action
- [✅] Create `app/components/ui/AuthGuard.tsx` — redirect if not logged in

### 2.3 Auth UI
- [✅] Login page: email + password form, validation, error messages
- [✅] Register page: name + email + password + confirm password
- [✅] Show loading state during auth requests
- [✅] Redirect to `/dashboard` on success
- [✅] Redirect to `/auth/login` if accessing protected route unauthenticated

---

## Phase 3 — Core API Routes (Hono)

### 3.1 Categories
- [✅] Create `server/routes/categories.ts`
- [✅] GET `/api/categories` — return all categories (public, seeded)

### 3.2 Transactions API
- [✅] Create `server/routes/transactions.ts`
- [✅] GET `/api/transactions` — list with filters: `?month=YYYY-MM&type=income|expense&category=&search=&page=&limit=`
- [✅] POST `/api/transactions` — create (Zod validation: type, amount, categoryId, description, date)
- [✅] PUT `/api/transactions/:id` — update (owner check)
- [✅] DELETE `/api/transactions/:id` — delete (owner check)

### 3.3 Budgets API
- [✅] Create `server/routes/budgets.ts`
- [✅] GET `/api/budgets?month=YYYY-MM` — list budgets for month
- [✅] POST `/api/budgets` — upsert budget (category + month = unique)
- [✅] PUT `/api/budgets/:id` — update limit amount
- [✅] DELETE `/api/budgets/:id` — remove budget limit (owner check)

### 3.4 Reports API
- [✅] Create `server/routes/reports.ts`
- [✅] GET `/api/reports/summary?month=YYYY-MM` — `{ income, expenses, balance, savingsRate, transactionCount }`
- [✅] GET `/api/reports/by-category?month=YYYY-MM` — array of `{ categoryId, label, color, amount, percentage }`
- [✅] GET `/api/reports/monthly?months=6` — last N months `{ month, income, expenses, balance }[]`

### 3.5 Route Mounting
- [✅] Create `server/routes/index.ts` — mount all routers on Hono app
- [✅] Create `app/lib/api-client.ts` — Hono RPC client for frontend

---

## Phase 4 — UI Base Components

### 4.1 Layout
- [✅] Create `app/components/layout/AppLayout.tsx` — sidebar + main content
- [✅] Create `app/components/layout/Sidebar.tsx` — nav links (Dashboard, Transactions, Budget, Reports)
- [✅] Create `app/components/layout/Header.tsx` — page title + user avatar + logout
- [✅] Create `app/routes/_app.tsx` — layout route wrapper with auth guard

### 4.2 UI Primitives
- [✅] Create `app/components/ui/Button.tsx` — variants: primary, secondary, danger, ghost; sizes: sm, md, lg
- [✅] Create `app/components/ui/Input.tsx` — label, error, helper text
- [✅] Create `app/components/ui/Select.tsx` — styled native select with label
- [✅] Create `app/components/ui/Card.tsx` — white card with shadow
- [✅] Create `app/components/ui/Modal.tsx` — accessible dialog with backdrop
- [✅] Create `app/components/ui/Badge.tsx` — colored category badge
- [✅] Create `app/components/ui/ProgressBar.tsx` — animated bar with label + percentage
- [✅] Create `app/components/ui/Spinner.tsx` — loading spinner
- [✅] Create `app/components/ui/EmptyState.tsx` — icon + title + description + CTA
- [✅] Create `app/components/ui/Toast.tsx` — success/error notifications
- [✅] Create `app/components/ui/ThemeToggle.tsx` — light/dark/system theme toggle

### 4.3 Finance Components
- [✅] Create `app/components/finance/StatCard.tsx` — metric card (icon + label + value + change %)
- [✅] Create `app/components/finance/TransactionItem.tsx` — single transaction row
- [✅] Create `app/components/finance/TransactionForm.tsx` — add/edit transaction form (shared)
- [✅] Create `app/components/finance/CategorySelect.tsx` — category picker with icons + colors
- [✅] Create `app/components/finance/BudgetCard.tsx` — category + limit + spent + progress bar
- [✅] Create `app/components/finance/BudgetForm.tsx` — set/edit budget limit form

---

## Phase 5 — Pages

### 5.1 Dashboard (`/dashboard`)
- [✅] Create `app/routes/_app.dashboard.tsx`
- [✅] Loader: fetch summary stats + recent 5 transactions + monthly chart data
- [✅] Stat cards: Total Balance, Monthly Income, Monthly Expenses, Savings Rate
- [✅] Recent transactions list (last 5, link to /transactions)
- [✅] Monthly income vs expenses bar chart (Recharts BarChart, last 6 months)
- [✅] Loading skeleton while data loads

### 5.2 Transactions (`/transactions`)
- [✅] Create `app/routes/_app.transactions.tsx`
- [✅] Loader: fetch paginated transactions with current filters
- [✅] Filter bar: month picker, type (all/income/expense), category dropdown, search input
- [✅] Transactions list with infinite scroll or pagination
- [✅] "Add Transaction" button → opens Modal with TransactionForm
- [✅] Edit transaction → opens Modal pre-filled
- [✅] Delete transaction → confirmation dialog → optimistic removal
- [✅] Empty state when no transactions match filters

### 5.3 Budget (`/budget`)
- [✅] Create `app/routes/_app.budget.tsx`
- [✅] Loader: fetch budgets + spending for current month
- [✅] Month picker (default: current month)
- [✅] Budget cards grid — one per category that has a budget
- [✅] Progress bar: green < 75%, yellow 75-90%, red > 90%
- [✅] "Set Budget" button → BudgetForm modal (select category + enter limit)
- [✅] Edit existing budget → pre-filled modal
- [✅] Delete budget limit
- [✅] Summary: total budgeted vs total spent
- [✅] Categories without budgets shown as "No limit set"

### 5.4 Reports (`/reports`)
- [✅] Create `app/routes/_app.reports.tsx`
- [✅] Loader: fetch all report data for selected month/range
- [✅] Month/range selector
- [✅] Income vs Expenses trend (LineChart, last 6 months)
- [✅] Spending by category (PieChart with legend)
- [✅] Category breakdown table (category, amount, % of total, vs last month)
- [✅] Savings rate over time (AreaChart)

### 5.5 Not Found & Error Pages
- [✅] Create `app/routes/$.tsx` — 404 page
- [✅] Add `ErrorBoundary` to root.tsx — 500 page

---

## Phase 6 — FinanceAI CLI

### 6.1 CLI Setup
- [✅] Create `cli/package.json` with `bin: { financeai: './bin/financeai.js' }`
- [✅] Install `commander`, `chalk`, `ora`, `inquirer`, `fs-extra`
- [🔄] Create `cli/bin/financeai.ts` — CLI entry, register all commands
- [✅] Create `cli/utils/config.ts` — read/write `.financeai.json` project config
- [ ] Create `cli/utils/ai.ts` — AI prompt helper (Anthropic API)
- [ ] Create `cli/utils/template.ts` — template engine (mustache-style)

### 6.2 Config Commands
- [ ] `financeai config:context` — set framework, ORM, testing style
- [ ] `financeai config:conventions` — set naming, file structure, imports
- [ ] `financeai config:set-key` — store API key securely

### 6.3 Init Command
- [ ] `financeai init` — initialize project config interactively
- [ ] Support `--ai-prompt` flag for AI-guided init

### 6.4 Generate Commands
- [ ] `financeai generate model <Name>` — Drizzle schema table
- [ ] `financeai generate service <Name>` — service class with CRUD
- [ ] `financeai generate controller <Name>` — Hono route handler
- [ ] `financeai generate repository <Name>` — Drizzle query repository
- [ ] `financeai generate test <Name>` — Vitest unit test file
- [ ] All commands support `--ai-prompt`, `--context-aware`, `--follow-pattern` flags

### 6.5 Scaffold Command
- [ ] `financeai scaffold <Feature>` — generate full feature stack
- [ ] Support `--type rest-api | crud | service-only`
- [ ] Support `--include model,service,controller,tests`

### 6.6 Database Commands
- [✅] `financeai db:migration` — run `drizzle-kit generate`
- [✅] `financeai db:push` — run `drizzle-kit push`
- [✅] `financeai db:seed` — run seed file
- [ ] `financeai db:reset` — drop + recreate + seed
- [✅] `financeai db:studio` — open Drizzle Studio

### 6.7 Test Commands
- [ ] `financeai test:unit <Name>` — run Vitest for a service
- [ ] `financeai test:integration <Feature>` — run integration tests
- [ ] `financeai test:coverage-report` — generate coverage report
- [ ] Support `--coverage` flag (e.g., `--coverage 85`)

### 6.8 Docs Commands
- [ ] `financeai docs:api` — generate OpenAPI YAML from Hono routes
- [ ] `financeai docs:component <Name>` — generate component docs
- [ ] Support `--output` and `--verify` flags

### 6.9 Utility Commands
- [ ] `financeai review <file>` — AI code review with suggestions
- [ ] `financeai refactor <file>` — AI refactoring suggestions
- [ ] `financeai debug <file>` — AI error analysis
- [ ] `financeai security:audit` — scan for common vulnerabilities
- [ ] `financeai chat` — interactive AI chat mode (iterative REPL)

---

## Phase 7 — Testing

### 7.1 Test Setup
- [✅] Install `vitest`, `@testing-library/react`, `@testing-library/user-event`
- [✅] Configure `vitest.config.ts`

### 7.2 Unit Tests
- [ ] Unit tests: Drizzle query helpers
- [✅] Unit tests: Hono route handlers (using `hono/testing`)
- [ ] Unit tests: utility/calculation functions

### 7.3 Integration Tests
- [✅] Integration test: full auth flow (register → login → session)
- [✅] Integration test: transaction CRUD via API
- [✅] Integration test: budget limit + report calculation
- [ ] (Optional) E2E: Playwright for dashboard flow

---

## Phase 8 — Polish & DevOps

### UI Polish
- [✅] Add loading skeletons to all data-loading pages
- [✅] Add optimistic UI for transaction delete
- [✅] Add toast notification system (success/error)
- [✅] Confirm dialog before destructive actions
- [✅] Mobile responsive layout (hamburger menu for sidebar)
- [✅] Keyboard accessibility (focus traps in modals)

### Features
- [✅] CSV export for transactions
- [✅] Date range picker for reports
- [ ] Recurring transaction support (stretch)
- [✅] Dark mode toggle ✅ COMPLETED

### PWA Features
- [✅] Service Worker registration
- [✅] Web App Manifest
- [✅] Offline indicator
- [✅] Install prompt
- [✅] Update prompt
- [✅] Pull-to-refresh
- [✅] Mobile-optimized inputs and cards

### DevOps
- [✅] Write full `README.md` with setup instructions
- [ ] Create `Dockerfile` for production build
- [✅] Create `.github/workflows/ci.yml` (lint + type-check + test)
- [✅] Add `npm run type-check` script
- [✅] Add `npm run lint` script (ESLint)

---

## Execution Order (Priority)

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5  →  Phase 6  →  Phase 7  →  Phase 8
 Setup       Schema       Auth        API        UI Base      Pages        CLI        Tests       Polish
```

### MVP Checklist (Minimum to ship)
- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete (email auth only)
- [x] Phase 3.1 + 3.2 + 3.3 complete (categories + transactions + budgets)
- [x] Phase 4 complete
- [x] Phase 5.1 + 5.2 + 5.3 complete (dashboard + transactions + budget)

### Current Status (as of 2026-02-27)

| Phase | Status | Completion |
|-------|--------|------------|
| 0 - Setup | ✅ Complete | 100% |
| 1 - Schema | ✅ Complete | 100% |
| 2 - Auth | ✅ Complete | 100% |
| 3 - API | ✅ Complete | 100% |
| 4 - UI | ✅ Complete | 100% |
| 5 - Pages | ✅ Complete | 100% |
| 6 - CLI | 🔄 Partial | ~30% |
| 7 - Tests | ✅ Partial | ~60% |
| 8 - Polish | ✅ Complete | 90% |

**Key Accomplishments:**
- Full-stack application with auth, transactions, budgets, reports
- Mobile-first responsive design with PWA features
- Comprehensive dark mode with user toggle (Light/Dark/System)
- Design tokens system for consistent theming
- 49 passing tests across auth, transactions, and components

- JSX structural errors in some route files (pre-existing)
- CLI commands partially implemented

---

### Current Sprint: Backend & UI Hardening (Hardening Sprint)
- [x] Fix global "Back" button navigation across all pages (`navigate(-1)`)
- [x] Standardize UI micro-interactions (`active:scale-95`) for navigation elements
- [x] Complete site-wide Translation Audit (Dashboard, Transactions, Budget, Analytics, Targets, Accounts, Scheduled, Profile)
- [x] Implement "Default Pocket" (Main Account) logic in UI and Backend
- [x] Standardize Iconography for missing categories (Investment, Family, etc.)
- [x] Create reusable `StatusToggle` component
- [x] Resolve TypeScript build errors in modal payloads
- [ ] Implement Account-based filtering for Transactions
- [ ] Add "Pay Now" logic for Scheduled Transactions to auto-post records
- [ ] Integrate FinanceAI CLI for scaffolding (Post-Hardening)

---

### Phase 6: FinanceAI CLI [PLANNED]
- [ ] 6.1 Initialize CLI package with Commander.js
- [ ] 6.2 Implement `financeai init` command
- [ ] 6.3 Create templates for Hono routes
- [ ] 6.4 Create templates for React Router pages
- [ ] 6.5 Implement `financeai generate feature <name>`
