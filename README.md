# Procurement ERP

An internal procurement and financial management platform designed to track supplier orders, purchase costs, freight, VAT, margins, payment schedules, cash flow, and delivery timelines across multiple projects.

## Capabilities

- Secure employee authentication with ADMIN, MANAGER, and USER roles
- ADMIN-managed employee accounts, including activation and password changes
- A normalized foundation for projects, suppliers, procurement packages, and payment schedules
- Exact-decimal financial calculation utilities
- Responsive internal workspace shell

## Technical stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL and Prisma ORM
- Auth.js credentials authentication with bcrypt password hashing
- Zod validation and Vitest

## Local development

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and provide the required environment variables.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply migrations with `npm run db:deploy`.
5. Start the app with `npm run dev`.

## Environment variables

| Variable                   | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`             | Runtime PostgreSQL connection                                        |
| `DIRECT_URL`               | Direct PostgreSQL connection for migrations and bootstrap operations |
| `AUTH_SECRET`              | Auth.js session encryption secret                                    |
| `BOOTSTRAP_ADMIN_NAME`     | One-time initial administrator setup                                 |
| `BOOTSTRAP_ADMIN_EMAIL`    | One-time initial administrator setup                                 |
| `BOOTSTRAP_ADMIN_PASSWORD` | One-time initial administrator setup                                 |

Keep environment values outside source control. The initial administrator can be created from a trusted environment with `npm run users:bootstrap-admin` after migrations are applied.

## Database commands

| Command                         | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `npm run db:validate`           | Validate the Prisma schema               |
| `npm run db:migrate`            | Create and apply a development migration |
| `npm run db:deploy`             | Apply committed migrations               |
| `npm run db:seed`               | Load fictional development data          |
| `npm run users:bootstrap-admin` | Create the first administrator           |

## Quality checks

```text
npm run format:check
npm run db:validate
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment

The application is designed for Vercel with PostgreSQL. Configure the environment variables in the target environment, apply migrations as a separate controlled step, then deploy from the connected Git repository.

## Status

Phase 2 — Authentication and user management is complete. The next planned phase adds operational master data.
