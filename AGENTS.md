<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MB Procurement ERP agent guide

## Mission and boundaries

Build MB Interiors' internal procurement-finance ERP incrementally. The business spine is:

`Client → Project → House/Building → Supplier Procurement Package/Order → Payment Schedule`

One package can apply to several buildings. The package/order, not a product, is the central procurement object.

Do not introduce rooms, products/SKUs, inventory, warehouse management, or statutory-accounting behavior. Do not implement later roadmap phases unless the current task explicitly requests them.

## Financial language is exact

- All authoritative money, rates, percentages, VAT, and FX calculations use PostgreSQL `Decimal` fields and `decimal.js`; never JavaScript `number`, `parseFloat`, or binary floating-point arithmetic.
- Store rates as fractions: `0.30` means 30%; `0.20` means 20% VAT.
- Gross profit = selling price HT − landed cost HT.
- Gross margin rate = gross profit ÷ selling price HT.
- Markup rate = gross profit ÷ landed cost HT.
- Selling price from target margin = landed cost ÷ (1 − target margin rate).
- Margin and markup are not interchangeable. A €70,000 landed cost sold for €100,000 has 30% margin and approximately 42.8571% markup.
- Landed cost HT = supplier purchase HT − positive supplier discount + freight + customs/duties + miscellaneous procurement costs.
- Freight remains an identifiable cost even when included commercially in the package price.
- Keep formulas in `src/domain/finance`; UI components only display serialized results.

## Financial and payment architecture

- `ProcurementOrderFinancials` represents BUDGET, COMMITTED, or ACTUAL; the unique order/state pair is optional until known.
- Cost components are normalized `ProcurementOrderCostLine` records. Do not add three copied sets of financial columns or persist derived landed-cost/margin totals that can become stale.
- INPUT and OUTPUT VAT are independent entries. VAT is neither revenue nor cost by default, no VAT rate is hardcoded, and unusual treatments remain representable.
- Preserve original amount/currency, manual FX rate, converted amount, and reporting currency. ISO currency codes are relational data, not a closed enum.
- Supplier schedules and client schedules are distinct. Actual payments/receipts are child transactions so partial settlement remains auditable.
- Payment state and future invoice state are different concepts.
- Cash flow is derived from dated supplier outflows and client inflows; do not duplicate calendar/cash-flow events without a business reason.

## Architecture and repository

- Next.js App Router, React Server Components by default, strict TypeScript, Tailwind CSS, and owned shadcn/ui source.
- PostgreSQL through Prisma ORM 7 and the `pg` driver adapter. Runtime access is server-only through the lazy `getDatabase()` function.
- Server reads query the database directly from Server Components; mutations should use authenticated Server Actions with Zod validation. Route Handlers are for external/webhook/API use cases.
- `src/app`: routes, layouts, and route-level loading/error states.
- `src/components/ui`: shadcn primitives; `src/components/app-shell`: composed shell components.
- `src/domain`: pure business rules; `src/lib`: infrastructure; `src/config`: static configuration.
- `prisma/schema.prisma`: relational model; `prisma/migrations`: immutable migration history; `prisma/seed.ts`: fictional development data only.
- `src/generated/prisma` is generated and ignored. Never edit or import its internals from client components.

## Phase 3 master data

- The operational hierarchy is Client → Project → Building; suppliers are separate reusable master data.
- Archive Clients, Suppliers, and Buildings with `isActive`; archive Projects with `ProjectStatus.ARCHIVED`. Do not expose destructive deletion.
- Master-data writes require the authenticated ADMIN or MANAGER actor and always set `createdById`/`updatedById` server-side.
- Store optional countries as ISO-style two-letter codes and render labels from `src/config/countries`; currencies remain relational `Currency` records.

## Database conventions

- UUID primary keys; UTC timestamps; `@db.Date` for business dates without time-of-day meaning.
- Amounts use `Decimal(19,4)`, rates `Decimal(9,6)`, and FX rates `Decimal(20,10)` unless a documented domain need changes precision.
- Core historical relationships use `onDelete: Restrict`; archive/deactivate records instead of cascading deletion.
- Important entities have `createdAt`, `updatedAt`, `createdById`, and `updatedById`. Audit user links may become null if a user is removed; business links remain restricted.
- Index foreign keys and operational status/date filters. Use explicit join models when the relationship needs auditability or future metadata.
- No core financial data in JSON blobs. Nullability must represent a real workflow state, not implementation convenience.
- Use Prisma transactions for multi-record financial writes. Never change an applied migration; add a new migration.

## Coding and security

- Keep strict types; do not use `any`, non-null assertions for unvalidated input, giant components, scattered constants, or ignored errors.
- Validate all server inputs with Zod. Normalize emails/codes in services and enforce authorization server-side.
- Never expose Prisma, connection strings, or secrets to client components. Never commit `.env`, credentials, tokens, real customer data, or real employee credentials.
- Authentication is Auth.js credentials-only with bcrypt password hashes and an encrypted HTTP-only session cookie. There is no public sign-up, invitation, social login, magic link, or password-reset email flow. ADMIN may set an employee password through the internal user-management UI; passwords use the centralized six-character minimum.
- All ERP routes must resolve the current active database user through `requireUser()`; mutations must authorize server-side with `requireRole()` or `requireAdmin()`. Do not rely on session claims or hidden navigation for authorization.
- Roles are `ADMIN`, `MANAGER`, and `USER`. Only ADMIN can manage employee accounts. Preserve the transactional rule that the final active ADMIN cannot be deactivated or demoted.
- Inactive and credential-less historical users cannot authenticate. Do not delete employees referenced by historical records. Obtain the current database user ID from the server auth helper for future `createdBy` and `updatedBy` writes.
- Prefer small cohesive modules, accessible semantic markup, early returns, and parallel independent I/O.

## UI conventions

- Restrained, desktop-first financial ERP: compact spacing, clear hierarchy, subtle borders, readable forms/tables, one accent color, and no decorative dashboard theater.
- Use design tokens and shadcn primitives; avoid ad hoc palette colors and repeated custom controls.
- Financial figures use tabular numerals and always show a currency where ambiguity exists.
- Provide designed loading, empty, error, and not-found states. Keep keyboard focus visible and labels accessible.
- Use Server Components unless interactivity requires a narrow client boundary.

## Testing and quality gates

- Add unit tests immediately for financial rules and edge cases. Compare exact decimal strings, not floating tolerances.
- For each completed task run: `npm run format:check`, `npm run db:validate`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Run `npm run test:coverage` when changing domain logic; SonarCloud reads `coverage/lcov.info` when CI analysis is configured.
- Do not disable lint/Sonar rules to hide a defect. Exclude only generated code and build artifacts.

## Common commands

```text
npm run dev             Local application
npm run typecheck       Strict TypeScript check
npm run lint            ESLint with zero warnings
npm test                Unit tests
npm run test:coverage   Tests plus LCOV coverage
npm run format          Apply Prettier
npm run db:validate     Validate Prisma schema
npm run db:migrate      Create/apply a development migration
npm run db:deploy       Apply committed migrations in deployment environments
npm run db:seed         Load fictional development data
npm run build           Production build
```

Copy `.env.example` to `.env` and set `DATABASE_URL`; use `DIRECT_URL` for migrations when the runtime URL is pooled. Vercel should use its normal Next.js defaults. Generate Prisma Client during `postinstall`; apply migrations as a separate controlled step, never concurrently in every application build.

SonarCloud should be connected through GitHub with generated Prisma, `.next`, and coverage artifacts excluded. Do not commit Sonar or Vercel tokens.

## Prohibited shortcuts

No floating-point finance, mutable supplier defaults as historical order truth, hardcoded currencies/VAT, dangerous cascade deletes, client-side authorization, direct client database access, core financial JSON blobs, fake operational dashboards, premature products/rooms/inventory, or unrelated future-phase implementation.
