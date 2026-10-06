# Procurement Finance ERP

A web application for managing project procurement packages, financial performance, payment schedules, cash flow, and delivery timelines.

## Capabilities

- Employee authentication and role-based access
- Client, supplier, Project, and Building master data
- Supplier-package Procurement Orders with one authoritative cost structure
- Decimal-safe landed cost, VAT, FX, margin, and markup calculations
- Supplier payment schedules plus Client billing, receipt schedules, and partial settlements
- Derived procurement calendar, Project reporting, and cash-flow forecasting
- Review-first AI-assisted supplier quote intake for PDF and image quotes
- URL-based operational filtering, sorting, server pagination, and global search
- JejetoBot: read-only record search, filtered lists, counts and contextual follow-ups
- Secure filtered CSV exports and ADMIN/MANAGER activity history
- Safe company settings and protected employee-account administration
- Optional Item Management (Beta) for Project-specific Items, Rooms, logistics, claims, and pricing
- Review-first XLSX Project-budget imports and supplier-quote line-item extraction
- Review-first AI-assisted Client Quote and Invoice PDF intake with optional multi-Order allocation
- Project financial targets and actual profitability derived from Orders and Client billing

## Technical stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL and Prisma ORM
- Auth.js credentials authentication with bcrypt password hashing
- Zod validation and Vitest

## Local development

```text
npm ci
cp .env.example .env
npm run db:generate
npm run db:deploy
npm run dev
```

## Environment variables

- `DATABASE_URL`
- `AUTH_SECRET`
- `OPENAI_API_KEY` (required for AI extraction and the record assistant; server-side only)
- `QUOTE_EXTRACTION_MODEL` (optional server-side override; defaults to `gpt-6-luna`)
- `ITEM_EXTRACTION_MODEL` (optional independent Item mapping/extraction override; defaults to `gpt-6-luna`)
- `CLIENT_DOCUMENT_EXTRACTION_MODEL` (optional Client Quote/Invoice extraction override; defaults to `gpt-6-luna`)
- `DIRECT_URL` (recommended for migrations when the runtime URL is pooled)

Settings → AI processing offers GPT-6 Luna (default) and GPT-6.1 Sol independently
for all three workflows. Retired GPT-5.6 Terra/Luna/Sol settings and environment
overrides resolve to Luna for new requests; historical import metadata is unchanged.
Deploy `20261005000000_ai_processing_gpt6_models` with `npm run db:deploy` before
saving these new model choices. Preparing the migration does not apply it.

JejetoBot uses GPT-6 Luna independently of the extraction settings. Phases 1–2
support record search and filtered lists of Projects, Orders, Billing, Clients and
Suppliers, with counts, 25-row pages, explicit ambiguity choices and follow-ups
such as “only overdue” or “Orders for this Project.” Filters reuse existing list
services and payment statuses; derived-filter scopes above 500 records ask you to
narrow the list. Open-list links appear only when their filters are equivalent.
JejetoBot cannot edit records, calculate financial totals or answer general help
questions. Chat stays in browser memory and clears on reload/sign-out. OpenAI
receives the current and up to four previous questions, previous user-entered
filters, page context kind and business date (`store: false`), never retrieved
records, resolved IDs or financial results. Paging and parent selection do not
call AI again. All requests are limited per running server instance (8/minute per
employee, one in flight per employee and four overall), not a distributed spending
quota. No new environment variable, package or migration is needed for JejetoBot.

Keep environment values outside source control. Optional one-time administrator bootstrap variables are documented in `.env.example`.

## Database

Apply committed migrations separately from application builds:

```text
npm run db:deploy
```

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

The application is designed for Vercel with PostgreSQL. Configure environment variables in Vercel, apply committed database migrations as a separate controlled step, and deploy from the connected Git repository.
