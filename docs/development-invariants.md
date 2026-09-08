# Development invariants

Read alongside [AGENTS.md](../AGENTS.md). Verified against `7058fe0` on `V2.0`.
Code and tests remain authoritative; recheck affected helpers before changing behavior.
Observed limitations below describe current code, not requirements to preserve defects.

## Product boundaries and terminology

Use **Orders**, **Billing**, **Payments**, **Client Receipts**,
**Projects**, **Clients**, **Suppliers**, **Funding Coverage**, **Freight reconciliation**,
and **Items (Beta)** in human-facing workflows. Reserve “Procurement Order” for
internal names such as `ProcurementOrder` and procurement service paths.

**Purchasing** names the top-level `/orders` workspace and navigation; individual
records and their creation/edit actions remain **Orders**.

A Order is a Supplier-level Project package that may cover several Buildings.
It owns one normalized cost structure. Items are Project-specific supporting detail,
not a reusable catalog, inventory, or a replacement for Order financial authority.

## Pricing, economic cost, and profitability

Operational pricing is markup-first: **Sell HT = Cost HT × (1 + markup rate)**.
Project Product, Freight, and Other Cost defaults are distinct; Other Cost covers
customs/duties and miscellaneous costs. New Orders default to `PROJECT_MARKUP`.

| Operational pricing method | Authority                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `PROJECT_MARKUP`           | Dynamically inherits all three Project markup defaults.                                 |
| `ORDER_MARKUP`             | Uses three explicit Order Product/Freight/Other rates.                                  |
| `DIRECT_SELLING_PRICE`     | Uses explicit package selling price plus separately recharged freight, when applicable. |

Count separately recharged freight exactly once in revenue. Freight remains an
identifiable cost regardless of commercial treatment. Do not offer legacy Order
pricing modes in new operational UI.

- **Purchase Cost HT:** the normalized Supplier purchase cost line.
- **Landed Cost HT:** purchase + freight + customs/duties + miscellaneous costs.
- **Economic Landed Cost:** landed cost + applicable non-deductible input VAT.
- **Gross Profit:** comparable HT revenue minus economic cost.
- **Markup:** gross profit / cost; operational component pricing uses component HT costs.
- **Margin:** gross profit / revenue; primarily analytical.

Aggregate monetary amounts before deriving effective markup or margin; never average
component, Order, or Project percentages. Preserve helper behavior for zero denominators.
Component pricing and economic-profitability ratios may differ because non-deductible
VAT increases economic cost without changing the component HT pricing base.

Project target cost uses approved estimated purchase plus estimated freight costs.
Target sell uses Product/Freight markups in `MARKUP` mode or entered `expectedSellHt`
in `EXPECTED_SELL` mode. Targets do not replace actuals. Actual Project profitability
compares non-cancelled Client Invoice HT with non-cancelled Order economic costs plus
Project freight expense economic costs once. Order planned sell, Quotes,
Client budget, legacy Order Client schedules, and allocation amounts alone are not
actual Project revenue. Invoice allocations support Order-level attribution without
overwriting Order prices or duplicating Project revenue.

## Billing, collections, and cash

Billing owns Quotes/Invoices, Billing installments, Client Receipts, and Client
outstanding. Recognized Client outstanding is non-cancelled Invoice TTC less associated
receipts; preserve document-level and matched-installment attribution. Allocations
cannot exceed document HT and must reference Orders in the same Project.

Actual cash in comes from `ClientReceipt`; actual Supplier cash out comes from
`PaymentSettlement` on `SUPPLIER_PAYMENT` installments. Schedules describe expected
amounts and dates, not actual cash. Persist scheduled amounts; later pricing changes
must not silently rewrite them. Prevent over-settlement and distinguish scheduled
outstanding from unscheduled and total remaining balances.

Supplier payable uses purchase HT plus input VAT payable under the current helper's
`DOMESTIC`/`CUSTOM` treatments; unrelated freight/customs/miscellaneous are excluded.
Actual cash uses receipt/settlement dates and their own FX. Forecasts use outstanding
Billing/Supplier installments, due dates, and expected FX. Cash position is Client
cash received minus Supplier cash paid. Cash timing never determines profitability.
Legacy Order `CLIENT_RECEIPT` schedules must not become actual Client cash truth.

**Current receipt-scope limitation:** `recordClientReceipt` and `updateClientReceipt`
do not explicitly reject Quote or cancelled documents. Billing summaries exclude
cancelled documents but collect receipts across the remaining document types; actual
cash queries in `src/lib/reporting/{reports,global-reports}.ts` do not impose an
Invoice-only or document-cancellation filter. Do not assume all Client cash is
Invoice-only, or silently change eligibility while adding an unrelated feature.

## Funding Coverage

**Funding Coverage HT = eligible Billing HT − non-cancelled Order Sell HT.**
This is commercial coverage, not cash or profit. Positive means excess coverage,
zero fully covered, and negative a funding gap.

Eligibility in `src/lib/billing/reporting.ts` is:

- Non-cancelled **Invoices** only; Quotes contribute no coverage.
- Include Invoice allocations to non-cancelled Orders.
- Include unallocated Project remainder only when `isProjectRemainderApproved` is true.
- Remainder is `max(Invoice HT − all allocations, 0)`, including allocations to
  cancelled Orders in that subtraction. Their excluded allocation is not automatically
  freed into approved remainder.
- Convert eligible coverage and Order sell to Project reporting currency. Missing
  required FX makes the result explicitly incomplete.

Client Receipts, Supplier Payments, and VAT do not change Funding Coverage.

## Freight reconciliation

Keep the following amounts distinct:

- **Project planning allowance:** approved expected Product Purchase HT
  (`estimatedPurchaseCostHt`) × Project Freight Estimate rate. Never substitute live
  Order purchases or Product Sell.
- **Order AUTO allowance:** that Order's Product Purchase HT × Project Freight
  Estimate rate, expressed in selling currency by the Order summary. A nullable
  manual override replaces only this allowance, not actual freight cost.
- **Actual reconciliation cost:** non-cancelled Order freight costs plus Project-level
  freight expenses, converted comparably. Project expense contributions include
  applicable non-deductible VAT; do not infer pure HT from the reconciliation field names.
- **Recovery target:** sum of each included cost × (1 + applicable freight markup).
  Order rates follow pricing inheritance/overrides; Project expenses use an explicit
  override or the Project Freight default. This is a target, not collected cash.
- **Freight gross profit:** recovery target − actual reconciliation cost.
- **Headroom:** Project planning allowance − recovery target.

Planning and actual completeness are separate. Actual reconciliation can remain
available without planning inputs; missing actual FX must not silently drop a cost.

## VAT

Input VAT and output VAT are independent, explicitly reviewed classifications.
Country/EU hints must not automatically select tax treatment or rates.
For classified input VAT, deductible VAT = VAT amount × stored `recoverableRate`;
the remainder is non-deductible and increases economic cost. Rates `0`, `1`, and
intermediate fractions represent none, full, and partial recovery. Deductible VAT
does not increase economic cost. Preserve the helper's legacy classification fallback
and treatment-dependent applicability; absent classification is not implicitly 0% recovery.

**Project VAT position = non-cancelled Client Invoice output VAT − deductible input VAT
from non-cancelled Orders and Project freight expenses**, in Project currency.
Positive means VAT payable; negative means VAT credit. Missing FX makes it incomplete.
Receipts and settlements do not affect this position.

Order OUTPUT VAT is planned commercial VAT, distinct from Invoice VAT in Project
reporting. Its AUTO base is total selling HT; a non-null base override is manual.
Preserve explicit VAT amount overrides and recomputation from the effective base
where automatic. Reuse VAT helpers; do not duplicate formulas in UI code.

## Currency, precision, and presentation

Currencies are relational `Currency` records; development seeds include EUR/USD/GBP/CHF,
not a closed supported-currency enum. Purchase, selling, and Project reporting currencies
are independent. Manual FX means **1 transaction-currency unit = X Project-reporting-currency units**.
Expected schedule FX and actual settlement/receipt FX are independent. Never fabricate
rates or substitute current/external FX. Missing required FX produces explicit
incompleteness, not a silently omitted amount. Company totals use comparable EUR
values under the centralized reporting configuration.

Use Decimal.js for authoritative financial arithmetic, never native floating point.
Persist amounts/quantities as `Decimal(19,4)`, rates as `Decimal(9,6)`, and FX as
`Decimal(20,10)`. Rates are fractions: `0.30` means 30%. Display rounding must not
reduce stored/domain precision.

Reuse shared formatters/parsers: money `9 999.99` with currency, dates `DD/MM/YYYY`,
percentages at most two displayed decimals. FX and quantities have separate display
precision. Numeric inputs accept decimal comma/point where supported. Business dates
remain PostgreSQL `Date`/ISO `YYYY-MM-DD`; business-day calculations use Europe/Paris.
CSV intentionally uses canonical decimals/ISO dates and protects user text against
spreadsheet formula execution.

## Authorization, actions, and audit

USER has read-focused operational access; ADMIN/MANAGER may perform authorized
operational mutations. Only ADMIN manages employees and Items Beta enablement.
Resolve the current active database employee with `requireUser()`; enforce mutation
roles server-side, not through navigation or session role claims. Preserve self-deletion
rejection and final-active-ADMIN safeguards, including deactivation/demotion.

Important mutations and audit snapshots share a transaction. Set actor attribution
server-side and retain immutable actor/entity snapshots when related records are deleted.
Preserve confirmed hierarchical deletion and employee-history safeguards.

Files marked `"use server"` export **async Server Actions only**. Put synchronous
helpers/constants and shared state elsewhere. The action-module tests enforce this
boundary. Validate inputs and preserve complete drafts on expected errors through
controlled state or `usePersistentActionState`.

## Intake and Items Beta

Order intake accepts Supplier Quote and Supplier Invoice PDFs/images;
Billing intake accepts PDFs; budget Item intake accepts XLSX. Uploads are
temporary/request-scoped, limited to 4 MiB, and validated by extension/content
signature (XLSX also undergoes workbook parsing). Do not persist source files, base64,
page images, or raw model output. Persist reviewed structured records and lightweight
import metadata only; logs contain bounded diagnostics/lifecycle metadata, not documents.

OpenAI Responses output uses strict structured schemas and server-side validation;
extraction is evidence, never authorization. Require employee review/confirmation
before persistence. Supplier intake's selected Project remains authoritative; Supplier
matching never silently creates a Supplier. Inline creation is a separate explicit action.
XLSX mapping is deterministic first, with at most one optional semantic mapping call.

Settings → AI processing stores independent Supplier, Item/mapping, and Client Billing
model choices (Terra, Luna, Sol). Saved choices override environment defaults for new
requests without process caching. ADMIN/MANAGER changes are validated and audited.
The additive `20260910000000_ai_processing_models` migration is required before rollout.
Import metadata retains the model used during extraction, not a later settings choice;
legacy Supplier review drafts without model metadata are recorded as unknown.

Aggregate Order review must work without Items Beta. A recognized optional
Item-provider failure becomes a warning; it must not discard successful aggregate
extraction. Billing allocation and reviewed payment-term proposals are optional.
Initialize Billing selection state before any dependent lookup in `QuoteReview`;
preserve its rendering regressions and draft-preserving confirmation flow.

Items (Beta) is optional and disabling it preserves data. Supplier intake, Billing,
profitability, cash, VAT, and Funding Coverage must remain usable without Items.
Do not introduce an Item dependency without explicit feature design.

## Lasting UX and compatibility rules

Keep planned versus actual terminology explicit. Payments has Supplier (default) and Client views plus a direct Record Payment header action; Supplier schedules remain supplier-side;
Client cash belongs to Billing/Receipts. Use progressive financial disclosure rather
than duplicate blocks or renamed copies of the same financial concept. Preserve shared
filtering, sorting, pagination, tables, and visible-page selection mechanics. Reports
must preserve filters across views/actions. Intake warnings remain visible and nonfatal
unless blocking; validation failures retain employee drafts.

Compatibility code is not a menu of new product concepts: retain old pricing enum/data
support, historical target-margin derivation until an explicit edit stores direct sell,
legacy Order Client schedules, and historical Items data/budget baselines. Items still
use their own `SELLING_PRICE`/`TARGET_MARGIN` modes. A Client Invoice can match a Quote
installment; preserve deduplication of expectations/receipts. `ClientReceipt` belongs
to Billing, with optional installment attribution. Do not casually delete these paths.

## Check these authorities before inventing logic

Paths below are relative to the repository root; inspect their companion tests too.

| Concern                 | Primary modules                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Order totals/pricing    | `src/lib/procurement/orders.ts`; `src/domain/finance/{calculations,component-markup,order-pricing}.ts`                    |
| Project targets/actuals | `src/domain/projects/targets.ts`                                                                                          |
| Billing/coverage        | `src/lib/billing/{billing,reporting}.ts`; `src/domain/billing/{calculations,funding-coverage}.ts`                         |
| Freight                 | `src/domain/freight/calculations.ts`; `src/lib/freight/expenses.ts`                                                       |
| VAT                     | `src/domain/vat/{recoverability,position}.ts`                                                                             |
| Cash                    | `src/domain/payments/calculations.ts`; `src/lib/reporting/{reports,global-reports}.ts`                                    |
| Presentation/input      | `src/domain/procurement/presentation.ts`; `src/domain/validation/{numeric,percentage}.ts`; `src/domain/payments/dates.ts` |

Active Project/portfolio Billing summaries use `src/lib/billing/reporting.ts`; duplicate
older summary exports remain in `billing.ts`. Inspect callers before changing either.

## Database and development workflow

Standing migration policy: avoid migrations unless schema changes are needed. Never
edit an applied migration; evolve deployed schemas with forward-only migrations.
Do not run destructive Prisma commands against production or use
`migrate resolve --applied` to bypass failure. For a failed unapplied migration,
inspect partial effects, correct the failure, and safely resolve as rolled back only
when appropriate before retrying. Every completion must state whether
`npm run db:deploy` is required; creating a migration is not permission to apply it.

Preserve LF text. `.gitattributes` normalizes text, and Prettier expects LF; this Windows
checkout uses repository-local `core.autocrlf=false` and `core.eol=lf`. The tracked
attributes do not force LF worktrees on every clone. Investigate mass formatting or
CRLF diffs before proceeding; do not normalize unrelated files as feature work.

For future features: inspect current helpers/tests and affected invariants, avoid
parallel domain logic, determine migration need, and use targeted tests while coding.
Run full quality gates once at completion: formatting, Prisma validation, typecheck,
lint, tests, and production build; include coverage for domain changes. Do not repeat
full suites without a reason. Documentation-only changes need focused Markdown/Git
checks. Report migration/deployment requirements explicitly.

## V2 product refinement

- Project Packages are explicit relational Order groupings, never cost or revenue authorities.
  One Order has zero or one same-Project Package. Preserve historical `packageName` text;
  the forward migration intentionally creates no inferred assignments. Archive retains
  existing assignments. Package mutations/reassignments use server authorization and audit.
- Allocation amount remains the authority. Fixed HT, percentage of Billing HT, and
  percentage of Order Sell HT are interchangeable UI inputs. Convert the Order basis
  into Billing currency with the existing manual-FX helper; incomplete FX disables that
  percentage. Revised Supplier intake previews use the same candidate/pricing helpers
  as confirmation and make no AI calls or writes.
- Payments shows Supplier installment settlements and Client Billing collections in
  their respective views, with Order/Billing detail links for individual actual records.
  Client cash authority remains Client Receipts, not legacy Order client settlements.
  Schedules, including planned Quotes, remain expectations rather than actual cash.
- Use `DateInput` for editable dates: European display/calendar, canonical ISO date-only
  submission (the legacy reviewed Supplier form retains its accepted European input contract).
  Monetary/percentage display uses shared formatters; storage, FX and quantity precision remain unchanged.
- Explicit full-detail editing uses `EditorDrawer`; preserve quick row edits and structured intake.
- Use shared `PageHeader` / `DetailPageHeader` and the shared tab treatment.
  URL-driven `NavigationTabs` and mounted `WorkspaceTabs` retain their distinct
  navigation/draft behavior. Clearing list filters must preserve the selected view/tab
  and page size while resetting pagination. Headers, filter actions and pagination
  wrap at narrow widths; financial table cells remain right-aligned and formatted.
- The Payments header’s Record Payment action is the central entry drawer for Supplier payments and Client
  receipts. Reuse `recordSettlement` and `recordClientReceipt`, including their
  transactional audit and overpayment checks. Central entry validates the selected
  Project/document within the write transaction. Supplier payments require an
  installment; the existing installment creator is available within the drawer.
  Client receipts may be Billing-level. Selecting an installment proposes its current
  outstanding amount; manual overrides survive unrelated edits. Contextual Order and
  Billing entry remains available. Overview and Transactions tabs are removed; legacy
  links redirect to Supplier or Client, and old Receipts links redirect to Record Payment.
- Rollout requires `20260909000000_project_order_packages` before the new application.
  Migration creation/generation does not authorize applying it to the configured database.

## Billing freight coverage

`freightCoverageHt` is a reviewed subset of Billing HT and of each Order allocation HT, never extra revenue. Order freight/non-freight allocations must fit the corresponding document portions; unassigned freight remains at Project level. Active Invoices provide actual freight coverage, Quotes planned coverage, and cancelled documents neither. Preserve manual FX incompleteness. AI freight extraction is a proposal requiring employee confirmation.

## Temporary onboarding previews

Client and Supplier onboarding may keep a browser-only object URL for a side-by-side PDF/image preview during review. Revoke it on replacement, successful save, or onboarding unmount/close. Do not persist sources in database, browser storage, or uploaded-file storage; server extraction inputs remain request-scoped and are still cleared after processing.

## Simplified workspaces

- Projects are hubs, not duplicate operational workspaces. Purchasing, Billing, Payments,
  and Reports links open the canonical lists with the Project filter applied. Purchase
  budgets and Order Packages remain Project configuration; they never replace Order totals.
- Project, Order (including those opened from Purchasing), and Billing records have exactly
  two mounted tabs: Details and Related. Details owns fields, financial breakdowns, dates,
  delivery and notes; Related owns linked records, allocations, schedules, payments,
  receipts and document history. Switching tabs must preserve drafts. Project Details includes
  planning, pricing defaults and financial reporting; Project Related links to scoped operational
  lists and owns Packages, Buildings/Rooms and freight-expense management. Settings retains its
  existing section layout.
- Purchasing is the record presentation reference: shared compact summaries, two-column financial
  label/value cards, and Related category headings with descriptions and adjacent actions. Use
  `record-presentation.tsx` and `RecordWorkspace` to keep Project, Order and Billing views aligned.
- Billing Edit exposes Active/Cancelled through the existing cancellation field and audited
  action; receipt/cancellation safeguards remain unchanged. Collection status stays derived
  from receipts and dates, never a manual Paid/Overdue override.
- Billing Details displays unallocated Billing HT, total included freight HT, freight allocated
  to Orders HT and freight remaining at Project level HT using existing Decimal helpers.
  These are commercial allocation amounts, not uncollected or unallocated cash.
- Purchasing and Items use a standard operational table with secondary column-set selectors;
  Billing combines commercial amounts and collection status in one table. Do not create a
  second record list for each column set. Shared filters, sorting, pagination and exports
  preserve the current scope.
- Reports use one report selector, optional portfolio columns, and one applied-filter summary.
  Supplier directory pages link to the canonical scoped Purchasing and Payments lists.
- Record Payment is available directly in either Payments view; the current Project and
  cash direction prefill the drawer. Legacy entry URLs still open the drawer. No entry
  action is shown to USER employees; server authorization remains authoritative.
- Billing and Order allocation changes use BillingAllocationEditor and the existing
  audited action, preserving the freight subset and manual-FX percentage behavior.
- Existing Project/Order/Billing tab/hash links select Details or Related and locate the original
  subsection. Settings disclosure links remain supported. Legacy Project tab
  links for Orders/Billing/Items open scoped workspaces; Cash opens the scoped cash report.
  Historical Order Client schedules are displayed only when installments exist; no historical
  records are deleted.
- This presentation cleanup introduces no schema changes or new migration.
