<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MB Procurement ERP agent guide

## Mission and boundaries

Build MB Interiors' internal procurement-finance ERP incrementally. The business spine is:

`Client → Project → House/Building → Supplier Procurement Package/Order → Payment Schedule`

One package can apply to several buildings. The package/order remains the authoritative commercial procurement object; Phase 10 Items are Project/location-specific supporting detail.

Do not introduce a reusable product/SKU catalog, inventory, warehouse management, or statutory-accounting behavior. Rooms and Project-specific Items follow the Phase 10 rules below. Do not implement later roadmap phases unless the current task explicitly requests them.

## Financial language is exact

- All authoritative money, rates, percentages, VAT, and FX calculations use PostgreSQL `Decimal` fields and `decimal.js`; never JavaScript `number`, `parseFloat`, or binary floating-point arithmetic.
- Store rates as fractions: `0.30` means 30%; `0.20` means 20% VAT.
- Gross profit = selling price HT − landed cost HT.
- Gross margin rate = gross profit ÷ selling price HT.
- Markup rate = gross profit ÷ landed cost HT.
- Selling price from target margin = landed cost ÷ (1 − target margin rate).
- Margin and markup are not interchangeable. A €70,000 landed cost sold for €100,000 has 30% margin and approximately 42.8571% markup.
- Landed cost HT = supplier purchase HT + freight + customs/duties + miscellaneous procurement costs.
- Freight remains an identifiable cost even when included commercially in the package price.
- Keep formulas in `src/domain/finance`; UI components only display serialized results.

## Financial and payment architecture

- A Procurement Order is a supplier-level project package, never a product, SKU, room, or inventory item; it may relate to several Buildings in its Project.
- Each Procurement Order has one current authoritative cost structure.
- Cost components are normalized `ProcurementOrderCostLine` records. Do not add duplicate cost states or persist derived landed-cost/margin totals that can become stale.
- Every Order has one active pricing method: `PROJECT_MARKUP` dynamically uses the Project's Product/Freight/Other defaults, `ORDER_MARKUP` uses three explicit Order rates, and `DIRECT_SELLING_PRICE` uses the coherent direct package price plus any separately recharged freight. New Orders default to `PROJECT_MARKUP`; legacy Item pricing continues to use its Item-specific modes.
- Output VAT taxable base is Total Selling HT by default. `outputVatTaxableBaseOverride = NULL` means AUTO; a non-null value is an explicit manual override. Derived VAT entries must be recalculated from the effective base and rate without changing INPUT VAT behavior.
- Separately recharged freight is added once to total selling revenue and backed out of the calculated package price in target-margin mode. Freight remains part of landed cost regardless of commercial treatment.
- INPUT and OUTPUT VAT are independent entries. VAT is neither revenue nor cost by default, no VAT rate is hardcoded, and unusual treatments remain representable.
- Preserve original amount/currency, manual FX rate, converted amount, and reporting currency. ISO currency codes are relational data, not a closed enum.
- Supplier schedules and client schedules are distinct. Actual payments/receipts are child transactions so partial settlement remains auditable.
- Payment installments use an explicit `SUPPLIER_PAYMENT` or `CLIENT_RECEIPT` direction and support arbitrary schedules; presets are creation conveniences only.
- Each installment has one authoritative basis: percentage or fixed amount. Persist its calculated scheduled amount and never silently rewrite it when Order financials later change.
- Supplier payable is supplier purchase HT plus VAT actually payable on the supplier invoice; exclude unrelated freight, customs, and miscellaneous costs. Client receivable is selling revenue including separately recharged freight once, plus output VAT.
- Outstanding is scheduled amount minus recorded settlements. Prevent overpayment and derive payment status from cancellation, settlement totals, due date, and the business date rather than storing a stale status.
- Expected installment FX and actual settlement FX are independent manual rates. Missing foreign-currency FX makes reporting aggregation explicitly incomplete.
- Payment due dates and procurement timing are PostgreSQL `Date` values serialized as `YYYY-MM-DD`. Calendar events are derived from installment and Order source dates, never duplicated into a synchronized calendar table.
- Payment state and future invoice state are different concepts.
- Cash flow is derived from dated supplier outflows and client inflows; do not duplicate calendar/cash-flow events without a business reason.
- Project reporting aggregates only comparable Project-reporting-currency values. Aggregate money before deriving Project or portfolio margin and never average Order or Project margin percentages.
- Commercial profitability uses HT revenue and economic cost; cash flow uses TTC payable/receivable balances. Keep margin and cash timing separate.
- Project cash position is Client cash received minus Supplier cash paid. Expected cash uses outstanding installment balances by due date; actual cash uses recorded settlements by settlement date.
- Reporting is derived from authoritative Orders, installments, and settlements. Missing required FX makes totals explicitly incomplete; never substitute zero, silently omit the amount, or fabricate a rate.

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
- Archive Clients, Suppliers, and Buildings with `isActive`; archive Projects with `ProjectStatus.ARCHIVED`. ADMIN and MANAGER may also use the explicit, confirmed permanent-deletion workflows introduced later; preserve their transactional hierarchy rules and audit snapshots.
- Master-data writes require the authenticated ADMIN or MANAGER actor and always set `createdById`/`updatedById` server-side.
- Store optional countries as ISO-style two-letter codes and render labels from `src/config/countries`; currencies remain relational `Currency` records.

## Phase 5 country, currency, and VAT rules

- Supported country definitions and EU membership live in `src/config/countries`; country codes are ISO 3166-1 alpha-2. EU membership may provide hints but must never choose a VAT treatment automatically. GB and CH are non-EU.
- Order purchase currency, order selling currency, and Project reporting currency are independent sources of truth. Changing a master-data default never rewrites an Order.
- Preserve original contractual amounts. Manual FX uses `1 original-currency unit = X project-reporting-currency units`; each Order preserves one purchase rate and one selling rate.
- Missing foreign-currency FX keeps reporting values and margin explicitly incomplete. Never subtract values in different currencies or fabricate a conversion.
- Individual Projects retain their own reporting currency. The current MVP company and portfolio reporting currency is the centralized EUR business setting in `src/config/reporting`; company totals include only values that are safely comparable in EUR and never fabricate a missing conversion.
- INPUT (purchase) and OUTPUT (sales) VAT are independent, explicitly selected management classifications. VAT rates are fractional Decimal values and are not inferred as legal conclusions from country.
- Recoverable input VAT is excluded from landed cost and profit. Non-recoverable input VAT is added to economic landed cost. Output VAT is excluded from revenue and profit; margin remains based on comparable reporting-currency HT/economic values.

## Phase 8 supplier quote intake

- Supplier quote uploads are temporary processing inputs only. Never persist source binaries, base64 data, page images, or unreviewed extraction payloads, and never depend on persistent runtime storage. Phase 10 may persist employee-approved structured Item records.
- The employee-selected Project is authoritative. AI must not infer or change it, and any reviewed Buildings must belong to that Project.
- AI output is untrusted evidence. Validate it through the strict structured extraction schema and require an ADMIN or MANAGER review/confirmation before creating or updating an Order.
- Supplier suggestions match active existing Suppliers in priority order: normalized VAT number, normalized legal name, then normalized display name. Never create a Supplier automatically.
- Keep provider access behind the small `QuoteExtractionProvider` abstraction and keep provider credentials server-only. One upload normally makes one extraction request; manual review edits do not call AI again.
- Preserve one authoritative Order cost structure. Quote imports may update only explicitly reviewed fields and must never replace existing values with missing or ambiguous extraction output.
- VAT treatment, VAT recoverability, manual FX, and deterministic Decimal calculations remain application-authoritative. Do not ask AI to decide them.
- Extracted payment terms are proposals only. Persist Supplier Payment installments only after explicit employee approval, using the existing Phase 6 model and calculations.
- Multiple quote imports may be recorded as lightweight structured history, but import history is not a second financial source of truth and must not become a document-management subsystem.

## Phase 9 operational layer

- Primary operational lists use validated URL filters, deterministic server-side sorting, and server pagination. Visible-page selection must never imply selection of every database row.
- CSV exports are authenticated, use the current validated filters, preserve Decimal strings and ISO dates, identify currencies, and protect user-controlled cells from spreadsheet formula execution.
- Important authoritative mutations write lightweight `AuditEvent` snapshots inside the same transaction. Audit records retain immutable actor/entity references and must survive deletion of the related employee or operational entity.
- Company reporting currency remains read-only at runtime. Project reporting currencies and historical FX assumptions must not be silently reinterpreted by a settings change.
- Quote extraction retains temporary-file and server-side-secret protections. The UI prevents repeated submission and the server applies pragmatic per-instance, per-employee concurrency/burst protection without claiming globally distributed rate limiting.
- ADMIN may permanently delete employee accounts except their own current account or a selection that would leave no active ADMIN. User audit attribution and all operational business records must survive employee deletion; every authenticated request continues to resolve an active database user.

## Phase 10 item management

- An Item is Project-specific, not a reusable catalog product. The hierarchy is Project → Building → Room → Item; the same product in different Buildings or Rooms is represented by separate Items.
- Supplier, Procurement Order, Building, and Room may be absent during early planning. A selected Room must belong to the Item Building, and the Building must belong to the Item Project.
- Item quantity is Decimal and unit of measure is extensible. Item financial calculations use shared Decimal-safe rules; existing Order financials remain authoritative and are never silently replaced by Item sums.
- Commercial Item status and logistics status are separate. Logistics Locations are operational references only; do not add inventory, stock, images, or warehouse-management behavior.
- Revised imports propose explicit updates and never auto-delete missing Items. AI output remains untrusted and employee review is required before persistence.
- XLSX parsing is deterministic first, with at most one optional semantic mapping call. Supplier quote line extraction uses the independently configurable `ITEM_EXTRACTION_MODEL`, defaulting to `gpt-5.6-luna`.
- XLSX, PDF, and image sources are request-scoped, cleared after processing, and never stored. Persist only reviewed Items and lightweight import metadata.

## Phase 11 client billing and project financial management

- Item Management is an ADMIN-controlled optional Beta module. Disabling it hides Item routes and navigation without deleting Item data; the core Project, Order, payment, billing, and reporting workflows must not depend on Items.
- Project targets store employee-approved budget, estimated purchase/freight costs, and either target markup or expected sell HT. Derived target values use Decimal-safe formulas and never replace actual Order or billing values.
- Client Quotes and Invoices are separate from supplier Procurement Orders. Their PDF sources are request-scoped extraction inputs only; persist reviewed structured billing data and lightweight import metadata, never source binaries or raw AI output.
- AI may classify and propose Client, Project, monetary values, VAT, payment terms, and likely duplicates, but an ADMIN or MANAGER confirms every authoritative field. FX remains a manual application input.
- Client payment schedules are TTC cash expectations. A confirmed Invoice may explicitly match one planned Quote installment or create its own billing schedule, but must not duplicate both cash expectations.
- Client billing may remain Project-level or allocate HT across one or many Orders. Allocations are Decimal-safe commercial attribution, cannot exceed document HT, and never overwrite authoritative Order prices or become accounting journal entries.
- Client receipt transactions are the authoritative actual Client cash-in records. Derive paid, outstanding, overdue, and Project cash position from schedules and receipts; keep these distinct from HT profitability.
- Order and Project profitability aggregate comparable reporting-currency HT revenue and economic Order cost before deriving markup or margin. Missing required FX makes the result incomplete.
- Expected validation and business-rule failures must preserve the employee's complete create/edit draft. Major editors use controlled state or the shared persistent-action form pattern and return field-specific errors plus a form-level error.
- Project Freight Estimate % is a planning allowance applied to the Project's expected Product Purchase Cost HT (`estimatedPurchaseCostHt`), not live Order purchases, freight cost, Client billing, or freight markup.
- Order AUTO freight remains a separate proportional allocation based on that Order's own Product Purchase Cost HT; a nullable manual amount override may replace only the Order allocation.
- Order freight cost and Project-level freight expenses are distinct actual-cost sources. Freight reconciliation aggregates both, applies inherited or explicit freight markup, compares recovery with the Project planning allowance, and remains incomplete when required manual FX is missing.
- Actual Client collection reporting comes only from active Client Invoices and authoritative Client Receipts. Legacy Order client schedules remain planning data and must never drive or be presented as actual received, outstanding, or overdue balances.
- Input VAT recoverability uses an authoritative fractional `recoverableRate`: `0` is non-recoverable, `1` is fully recoverable, and intermediate rates are partially recoverable. Deductible VAT is VAT amount × recoverable rate; only the remainder increases economic cost.
- Project-level freight expenses may carry explicitly entered input VAT treatment, rate or manual amount, and recoverability. VAT remains absent unless entered, and their economic freight cost includes only non-deductible VAT.

## Database conventions

- UUID primary keys; UTC timestamps; `@db.Date` for business dates without time-of-day meaning.
- Amounts use `Decimal(19,4)`, rates `Decimal(9,6)`, and FX rates `Decimal(20,10)` unless a documented domain need changes precision.
- Core business relationships are restrictive unless an explicitly implemented permanent-deletion workflow removes the owned hierarchy transactionally. Employee audit/write-attribution relationships use `SetNull` so business and audit history survives employee deletion.
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
- Inactive and credential-less historical users cannot authenticate. ADMIN-only permanent employee deletion must preserve operational records and immutable audit attribution, reject self-deletion, and retain at least one active ADMIN. Obtain the current database user ID from the server auth helper for future `createdBy` and `updatedBy` writes.
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
