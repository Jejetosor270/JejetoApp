# MB Procurement ERP

Internal procurement-finance software for interior-design studio. The application will manage clients, projects and buildings, supplier procurement packages, landed costs, selling prices, VAT, currencies, payment schedules, delivery forecasts, cash exposure, and profitability.

The central procurement object is a supplier package/order. This is not an inventory, warehouse, product/SKU, room-specification, or statutory-accounting system.

## Current status

Phase 2 — Authentication & Users is complete. The repository currently provides:

- a responsive application shell and design-system foundations;
- a normalized PostgreSQL/Prisma data model and initial migration;
- exact-decimal finance functions with unit tests;
- environment validation, lazy server-only database access, and Auth.js employee sessions;
- ADMIN-managed employee accounts with roles, active/inactive controls, and bootstrap support;
- fictional, idempotent development seed infrastructure;
- formatting, linting, type checking, coverage, CI, and production-build tooling.

Operational procurement CRUD is intentionally not implemented. Phase 3 will add clients, suppliers, projects, and buildings.

## Technical stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- Tailwind CSS 4 and shadcn/ui (Radix primitives)
- PostgreSQL
- Prisma ORM 7 with the `pg` driver adapter
- Zod, date-fns, and decimal.js
- Auth.js credentials provider and bcrypt password hashing
- Vitest with V8/LCOV coverage
- ESLint and Prettier

## Prerequisites

- Windows 10/11 with PowerShell
- Git and GitHub Desktop
- Node.js 24 LTS recommended; Node.js 22.12 or newer is supported
- npm 11 or newer
- A PostgreSQL database for migrations, seeding, and future data work

No database is required to render or build the Phase 1 shell.

## Windows local setup

1. Clone the GitHub repository with GitHub Desktop and open it in your preferred editor or Codex.
2. Open PowerShell in the repository folder.
3. Install the locked dependencies:

   ```powershell
   npm ci
   ```

4. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Replace the example PostgreSQL URLs in `.env` with values from your database provider.
6. Create the database tables and representative development data:

   ```powershell
   npm run db:deploy
   npm run db:seed
   ```

7. Start the application:

   ```powershell
   npm run dev
   ```

8. Open [http://localhost:3000](http://localhost:3000).

The seed is fictional, idempotent, and refuses to run when `NODE_ENV=production`. It creates four currencies, one inactive development administrator without credentials, a sample client/supplier/project, three villas, one two-villa package, cost/VAT examples, and payment schedules.

## Environment configuration

| Variable       | Required                          | Purpose                                                                                         |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Yes for database access           | Pooled PostgreSQL URL used by the deployed application and local runtime                        |
| `DIRECT_URL`   | Recommended for hosted PostgreSQL | Direct PostgreSQL URL used by Prisma migrations and seed commands; falls back to `DATABASE_URL` |
| `AUTH_SECRET`  | Yes for employee authentication   | High-entropy secret used by Auth.js to encrypt secure HTTP-only employee session cookies        |

Keep `.env` local. Vercel values belong in Project Settings → Environment Variables or should be injected by a Marketplace database integration. Never prefix database variables with `NEXT_PUBLIC_`.

Generate `AUTH_SECRET` with `npm exec auth secret`. Use one stable, unique value for each Vercel environment; changing it signs out existing employees.

## Employee authentication

The application is private: there is no public sign-up, invitation, social login, magic link, or password-reset email flow. Auth.js uses email/password credentials with bcrypt password hashes and encrypted, HTTP-only eight-hour sessions. Every protected server request loads the current user from PostgreSQL, so inactive employees and changed roles lose useful access immediately.

All ERP routes require an active employee account. `ADMIN`, `MANAGER`, and `USER` are the available roles; authorization helpers centralize role checks, and only `ADMIN` can access `/admin/users`. Administrators create and edit employee accounts there. The last active administrator cannot be deactivated or demoted.

### First administrator

After applying the Phase 2 migration, establish the first administrator once from a trusted PowerShell session. Do not put this password in Git or a Vercel build setting:

```powershell
$env:BOOTSTRAP_ADMIN_NAME = "Your administrator name"
$env:BOOTSTRAP_ADMIN_EMAIL = "administrator@your-company.example"
$env:BOOTSTRAP_ADMIN_PASSWORD = "a-unique-password-with-at-least-12-characters"
npm run users:bootstrap-admin
```

The command refuses to create another administrator while an active administrator exists. It is intentionally separate from the fictional development seed and is safe to use against the configured Neon database.

## Development commands

| Command                         | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                   | Start the local Next.js server                                     |
| `npm run build`                 | Create a production build                                          |
| `npm run start`                 | Serve an existing production build                                 |
| `npm run typecheck`             | Run strict TypeScript checking                                     |
| `npm run lint`                  | Run ESLint with zero warnings allowed                              |
| `npm test`                      | Run unit tests once                                                |
| `npm run test:watch`            | Run tests while editing                                            |
| `npm run test:coverage`         | Produce terminal and `coverage/lcov.info` reports                  |
| `npm run format`                | Apply Prettier formatting                                          |
| `npm run format:check`          | Verify formatting without edits                                    |
| `npm run db:generate`           | Regenerate the ignored Prisma Client                               |
| `npm run db:validate`           | Validate the Prisma schema                                         |
| `npm run db:migrate`            | Create and apply a development migration                           |
| `npm run db:deploy`             | Apply committed migrations without creating new ones               |
| `npm run db:seed`               | Load representative fictional development data                     |
| `npm run db:studio`             | Open Prisma Studio                                                 |
| `npm run users:bootstrap-admin` | Create the first active ADMIN from temporary environment variables |

Before committing, run:

```powershell
npm run format:check
npm run db:validate
npm run typecheck
npm run lint
npm test
npm run build
```

## Database workflow

The initial migration is committed in `prisma/migrations`. The schema deliberately uses:

- `Decimal(19,4)` for money, `Decimal(9,6)` for rates, and `Decimal(20,10)` for FX;
- normalized BUDGET, COMMITTED, and ACTUAL financial records with cost line items;
- separate INPUT/OUTPUT VAT entries;
- original and reporting amounts/currencies for conversions;
- separate expected schedules and actual supplier/client cash transactions;
- explicit order-to-building links;
- restricted deletion on historical business relations and nullable audit-user links.

For a schema change, edit `prisma/schema.prisma`, run `npm run db:migrate`, inspect the generated SQL, and commit both schema and migration. Never edit a migration already applied to a shared database. Phase 2 includes `20260822000000_add_employee_password_hash`; apply it with `npm run db:deploy` using the production `DIRECT_URL` before testing login on Vercel.

## GitHub workflow

Use GitHub Desktop to review the complete diff, write a clear summary, and commit the Phase 1 files. Push only after the local quality gates pass. The workflow in `.github/workflows/quality.yml` repeats formatting, schema validation, type checking, linting, tests/coverage, and build for pull requests and pushes to `main`.

Do not commit `.env`, `.vercel`, `node_modules`, `.next`, generated Prisma Client, coverage, or credentials. They are already ignored.

## Vercel deployment

1. Push the repository to GitHub.
2. In Vercel, create a project by importing that repository.
3. Keep the detected Next.js framework, repository root, install command, and build command unchanged. `postinstall` automatically generates Prisma Client.
4. From Vercel Marketplace, provision a managed PostgreSQL integration such as Neon, or connect an existing PostgreSQL provider.
5. Map the provider's pooled connection URL to `DATABASE_URL` for Development, Preview, and Production. Map its direct URL to `DIRECT_URL` where available.
6. Set a unique `AUTH_SECRET` for Development, Preview, and Production. Generate it with `npm exec auth secret`; never expose it to the browser.
7. Before the first schema-dependent production release, run `npm run db:deploy` once from a trusted machine or controlled CI job using the production direct URL.
8. Deploy. Git-connected Vercel projects automatically create previews for branches/pull requests and production deployments from the configured production branch.

Do not run database migrations inside every Vercel build: concurrent preview builds could race. The application uses the Node.js runtime and a small connection pool; the database module initializes lazily, so build-time rendering does not require a live connection.

## SonarCloud

1. Sign in to SonarCloud with GitHub and import the repository.
2. Use SonarCloud Automatic Analysis initially; no repository token or committed credentials are required.
3. If you later switch to CI-based analysis, add `SONAR_TOKEN` as a GitHub Actions secret, set the Sonar organization/project keys in that workflow, and point TypeScript coverage to `coverage/lcov.info`.
4. Exclude generated Prisma Client, `.next`, `coverage`, and migration SQL from source analysis. Do not weaken rules to improve the score.

## Repository map

```text
prisma/                    Schema, migration history, fictional seed
src/app/                   App Router layouts and route states
src/components/app-shell/  Composed responsive application shell
src/components/ui/         Owned shadcn/ui component source
src/config/                Static navigation configuration
src/domain/finance/        Pure exact-decimal finance logic and tests
src/domain/users/          Password, validation, authorization, and user safety rules
src/lib/auth/              Server-only current-user and Auth.js configuration
src/lib/                   Database, environment, and shared utilities
```

Future coding agents must read `AGENTS.md` before making changes.
