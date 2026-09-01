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
- `OPENAI_API_KEY` (required for supplier quote extraction; server-side only)
- `QUOTE_EXTRACTION_MODEL` (optional server-side override; defaults to `gpt-5.6-luna`)
- `ITEM_EXTRACTION_MODEL` (optional independent Item mapping/extraction override; defaults to `gpt-5.6-luna`)
- `CLIENT_DOCUMENT_EXTRACTION_MODEL` (optional Client Quote/Invoice extraction override; defaults to `gpt-5.6-luna`)
- `DIRECT_URL` (recommended for migrations when the runtime URL is pooled)

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
