# Development invariants

## Private ERP connection — Phase 1

- `/api/mcp` is a separate, owner-only read connection for Codex desktop, not a
  replacement for JejetoBot. Strict allowlisted tools reuse canonical search,
  lists, Project financials, payment terms, forecasts and attention. Selected
  result data enters the external conversation; never claim JejetoBot's
  planner-only privacy boundary for this connector.
- `ERP_MCP_OWNER_ID` pins one active credentialed ADMIN; `ERP_MCP_ORIGIN` is the
  canonical HTTPS origin. Settings → AI connection issues a random read-only key
  once, expires it after 30 days, and provides audited replacement/revocation.
  Only its hash persists. Every request/tool and slow-result return rechecks
  access. Cookie sessions, query credentials and model-supplied actor IDs never
  authorize external tools. No write tool, OAuth server or financial approval
  mechanism exists in Phase 1, and these keys must never silently gain writes.
- Stateless MCP uses the official SDK, bounded arguments/results and per-instance
  burst guards. Decimal strings, currency, completeness, bounded evidence and
  source links remain explicit. Record content is untrusted data. No financial
  formulas, sources, schemas or workflows are replaced.
- Migration `20261031000000_erp_read_connection` adds only hashed connection-key
  metadata, expiry/revocation, an employee link and one-active-key protection.
  It is prepared, not applied; rollout and owner configuration are separate.
  Live desktop connection/approval verification requires deployment and cannot
  be inferred from local SDK tests. See `docs/erp-ai-connection.md`.

## Billing allocation profitability

- Billing Details retains Merchandise, Freight and Other/services and adds Total. Agreed markup uses current Project category defaults. Expected profit is the portion embedded in net Billing HT: category HT minus category HT / (1 + category markup). It is distinct from allocated profit; the Total rate is derived from summed implied costs and profit, never averaged rates.
- Allocated cost attributes the linked Order's full economic cost (including freight, other costs, Supplier credits and non-recoverable VAT) in proportion to this Billing allocation / authoritative Order selling HT. Each Billing category receives its share of this proportional whole-Order cost, not a separate component-cost reconstruction. Allocated profit is allocation HT minus attributed cost; Actual markup is that profit / attributed cost. Related Order rows use this same Billing-specific ratio, not combined allocations from other Invoices.
- Client credits reduce Invoice categories and only their explicitly credited allocations using the shared credit helpers. Missing linked costs/FX, cancelled sources, zero selling bases and Order overcoverage remain incomplete; zero-cost markup is undefined. Calculations use Decimal in `src/domain/finance/billing-profitability.ts` and preserve original currencies through comparable reporting bases.
- The residual is labelled **Unallocated HT**, without a refund note. It is excluded from allocated profit and creates no credit/refund, cash, schedule or allocation change. No migration is required.

## JejetoBot — Phases 1–3

- The shared side JejetoBot is a read-only name/reference finder and list assistant for Projects,
  Orders, Billing, Clients and Suppliers. All active employees have the same
  operational read scope as the existing ERP search; no new tenancy or record-level
  permission model is implied. Each request resolves the active database user,
  validates bounded input, and rechecks the employee after AI planning before reading records.
- GPT-6 Luna only proposes a strict search/list/help/financial intent. The server validates the plan,
  runs allowlisted, bounded queries through the shared Trash-aware database client,
  and supplies fixed response text and internal links. No SQL, write tools, web
  browsing, model-generated financial calculations, or raw model prose is exposed.
  Ambiguous related names require employee selection; limited search results are not
  presented as exhaustive.
- Workflow help is curated in `src/domain/assistant/help.ts`, not model-authored.
  It covers payments, issuing/marking paid, allocations, pricing, VAT/FX, Project
  financials, credits/refunds and document intake. USER guidance directs record
  changes to ADMIN/MANAGER; JejetoBot never performs those changes for any role.
- Financial explanations use `getProjectControl().dashboard`, exactly as Project
  Details. The adapter in `src/lib/assistant/financial.ts` only selects, formats and
  explains existing costs/profit/markup, Billing coverage, cash, VAT and freight.
  No independent sums, rates or financial engine are introduced. Empty activity is
  zero; missing money remains Incomplete; undefined zero-cost markup is Not applicable.
  Explanations distinguish pricing profit from earned/final profit, coverage from cash,
  markup from margin and management VAT from tax filing. No arbitrary subsets,
  hypothetical amounts or historical financial snapshots are supported.
- Financial scope is one visible Project, resolved from its name, an explicit current
  Project context or a validated previous financial selection. Ambiguity requires
  selection; unavailable/unsupported scope never silently becomes another Project.
  Successful non-financial or unresolved replies clear the prior financial scope.
  Unresolved financial name lookups retain only their allowlisted topic, not a prior
  Project ID. A short corrected name resumes that topic. Explicit new questions win;
  success, unrelated answers and New chat clear the pending topic. This small enum
  reaches the planner, not candidate names/IDs, response prose or financial amounts.
  Answers include a Project link, up to eight unique supporting source links (missing
  amounts first), full source count and Paris as-of time. Links do not imply that a
  bounded evidence list was used to calculate the whole-Project totals.
- Project name matching prioritizes literal exact matches, then combines partials with bounded server-side
  normalization (case, accents, punctuation, token order and common plurals) and
  conservative minor spelling suggestions. Numeric identifiers are not typo-corrected
  or reordered; code token order is preserved.
  Unique complete normalized matches can resolve; fuzzy suggestions and multiple
  matches require selection. An incomplete candidate scan must never prove uniqueness
  or claim a Project does not exist. This applies to Project search, financial scope
  and Project relation filters; it does not change global ERP search or stored names.
- Lists reuse canonical list services and statuses, with exact counts and 25-row pages.
  Derived status/due-date filters are limited to 500 source records; broader or unstable
  scopes request narrowing/retry instead of claiming complete results. Delivery and
  payment status remain separate. Issued Billing includes paid/partial/overdue Invoices;
  unpaid means a positive authoritative outstanding amount, including partial/overdue.
  Missing payable values prevent a complete unpaid list. Unsupported filters are explicit,
  never silently dropped. Open-list links must preserve the complete filter scope.
- Follow-ups carry validated criteria, not result rows. The browser supplies a recognized
  record path; the server verifies its visible record and resolves requested Project,
  Supplier or Client context. An unavailable context must never become a global list.
  Explicitly global requests do not inherit page scope. Paging and ambiguity selections
  are authenticated Server Actions without another AI call; selected IDs are revalidated.
- Chat is held only in React memory, survives close/navigation, and clears on
  reload, sign-out or employee change. Only the current and up to four previous
  employee questions, user-entered prior filters, scope-presence flags, page number,
  current record kind, previous financial topic/scope-presence flag and Paris business date reach OpenAI, never database results or
  resolved IDs/labels. Requests use the existing
  server-only OPENAI_API_KEY, fixed gpt-6-luna, store:false, one provider call, a
  25-second timeout and a 1,000-token output cap. This does not claim zero provider
  retention beyond the API's configured policy. Safe failure logs omit questions,
  records, raw responses and error text.
- Limits are per server instance: eight requests/minute/employee, one concurrent
  request/employee, four overall, and a bounded/pruned guard map. They are pragmatic
  burst protection, not a distributed usage or spending guarantee. Business drafts
  retain their existing navigation guard; failed chat submissions preserve the prompt.
  This phase adds no schema, migration, package or environment-variable requirement.

## Decision-focused Project financials

- Project Details prioritizes Costs & profit, Client Billing and Cash, with visual
  comparisons and collapsed VAT/Freight breakdowns. Short labels use shared UI and
  numeric formatting. Every monetary figure opens its signed source contributions;
  missing amounts identify records to review rather than becoming zero. Project info,
  budget editing, Details/Related navigation and draft protection remain available.
- Recorded cost includes active Order and separate Project freight economic cost once,
  including non-deductible VAT. Pricing profit is agreed Order sell less those costs;
  it is a recorded pricing position, not final or earned Project profit. Project-only
  expenses do not invent additional selling prices. Markup uses aggregate profit/cost.
- Billing plan is issued plus To be invoiced net Invoice HT; To invoice contains only
  the latter. Quotes, Drafts, cancelled and trashed documents remain excluded. Order
  coverage HT uses total issued Client Invoice HT after active credits minus active
  Order sell, both on Details and the Projects list. Allocation and Project remainder
  approval do not limit this figure. Planned invoices never fund it; allocation gaps
  appear separately as review warnings. Existing allocation-based Funding Coverage in
  other reports remains a distinct attribution measure, not this Project headline.
- Expected profit, under Budget estimate, uses full planned Billing less the complete
  approved full-Project HT budget and known non-deductible VAT. Recorded HT costs are
  not added again. Missing category budgets (including Other/services) keep the estimate
  incomplete; zero must be explicit. This is a budget-based estimate, not cost-to-complete
  forecasting. An exceeded budget or plan below the approved selling target is flagged.
- Net cash remains net Client receipts less net Supplier/freight payments, including
  actual refunds and each cash record's independent FX. To collect uses authoritative
  issued Invoice outstanding; To pay includes remaining Supplier/freight obligations
  and Client refunds due. Neither is a bank balance. Supplier payable includes all
  Order cost lines; separate Project freight expenses remain distinct obligations.
- Freight cash attribution groups recognized cash by issued Invoice, including an
  explicitly matched Quote once. Net freight and TTC account for active credits;
  attributable net cash is capped by the net Invoice freight portion. Contributions
  retain each receipt/refund's actual FX. Actual refunds remain separate cash records;
  credits alone never create cash. Missing contributing FX remains incomplete.
- Project Related tables show authoritative cost/sell, payment status, descriptions,
  dates and remaining cash. Collapsed payment groups expose their balance, due date and
  planned/issued status. No source values, payment terms or historical data are rewritten.
  No schema change or migration is required. Earlier expanded overview descriptions below
  are historical and superseded for this presentation.

## Reviewed amount autofill

- The full Order editor proposes the sum of reviewed Product, Freight,
  Customs/duties and Other HT costs as the Purchase VAT taxable base. Employees can
  exclude non-taxable components; selected cost edits update the suggestion once.
  Saved/manual bases, including explicit zero, are retained; Use selected costs
  explicitly resumes autofill. Changes to costs flag a manual base for review.
  Suggested bases do not submit VAT data while treatment remains Not recorded.
  No VAT treatment, rate, recoverability or amount override is inferred or changed.
- New Billing allocation drawers propose the selected Order's existing Sell HT basis
  in Billing currency, capped at available Billing HT. Missing manual FX leaves the
  proposal blank. Explicitly choosing another Order proposes its amount; unrelated
  edits and failed saves preserve the draft. Existing allocations are never replaced
  by defaults, and saving remains an explicit, validated action. No migration needed.

## Financial reliability — Batch 1

- Billing term remaining balances are capped by the authoritative Invoice balance,
  including Invoice-level receipts. Only receipts actually assigned to a term count
  as that term's received cash. Invoice-level coverage and credit adjustments remain
  distinguishable from Paid; partial coverage is shown without inventing a receipt.
  Unlike-currency or ambiguous matched terms require review rather than a zero balance.
- ADMIN/MANAGER can assign an existing Invoice-level receipt to one eligible term
  through Assign to term. Amount, receipt date, FX and history remain unchanged, with
  ownership, currency, cancellation, term capacity and Invoice limits rechecked in an
  audited transaction. One receipt is not split across terms; it can remain Invoice-level.
- Supplier/Billing term and actual cash corrections require the opening record version.
  Stale or concurrent saves fail safely and preserve the draft. Refreshing data does
  not silently update an open draft's version; closing/reopening loads the latest values.
  Financial reads and dependent writes share serializable transactions.
- New or increased Supplier schedules cannot exceed the current payable. Add payment
  term proposes the comparable unscheduled balance; presets do not append a duplicate
  full schedule. Historical terms are not silently rescheduled after cost changes.
- Project freight recovery uses the same effective source markups and economic freight
  cost as Reports. Raw freight HT and non-deductible expense VAT remain distinguishable;
  the Project planning allowance is unchanged. Source details reconcile to the headline.
- Related Billing lists show Document date, Next payment due or Paid. Actual and baseline
  forecast chart links retain business filters and narrow to the clicked month, clipped
  to the chart period. Timing scenarios retain the original scheduled-source context.
- Attention shows actionable source warnings instead of redundant aggregate warnings.
  Invoice-level receipts do not generate false unpaid-date or schedule-gap alerts;
  genuine saved schedule excess remains a review item. No schema/migration is required.

## Financial reliability — Batch 2

- Actual Supplier payments and Client receipts expose a protected **Move payment** /
  **Move receipt** drawer from their existing cash editor. A move preserves UUID,
  amount, transaction date, currency, actual FX and creation history. It changes only
  the owning payment term or Invoice, with explicit confirmation/reason, server role
  checks, opening source/destination versions and a serializable audited transaction.
  Source and destination must share transaction/reporting currencies. Destination
  balances, cancellation, Trash, ambiguous matches and active-credit guards apply.
  Client moves land at Invoice level; Assign to term remains a separate same-Invoice
  action. Bank reconciliation fingerprints flag a changed assignment for review.
- Project freight expenses share one full create/edit drawer: amount, Supplier,
  currency/FX, expense/due dates, markup, VAT/recoverability, reference and notes.
  Updates retain opening versions/drafts, reject outdated or concurrent changes and
  cannot reduce payable below existing payments. Supplier/currency are locked once
  payments exist. Actual cash and its independent FX are never rewritten.
- Supplier credits support Product, Freight and Other HT; Other covers customs and
  miscellaneous together without inventing a split. Each reduction is capped by its
  original category. Total economic cost/payable and VAT reduce once; the agreed
  Client selling price does not change. Project and Reports freight costs/targets
  use net freight after credits. Separate Project freight-expense credits remain
  outside this scope. Client allocation reductions stay explicitly selected.
- Each credit may have one reviewed expected refund date and independent manual
  expected FX. These are optional and editable with the same stale-save safeguards;
  no historical dates/rates are inferred. Forecasts cap credit expectations to the
  source's actual refundable cash balance, oldest credit date/ID first, subtracting
  each credit's actual refunds. This is read-only forecast attribution, not a cash
  reassignment. Project/Reports, attention and calendar use the resulting balance;
  missing dates/FX remain incomplete. Actual refunds retain separate date/FX records.
- Migration `20261022000000_credit_categories_refund_expectations` permits Supplier
  category credits and adds nullable expected-refund date/FX plus validation/index.
  It is prepared and tested in isolated in-memory PostgreSQL only, **not applied**
  to any configured database. Apply with `npm run db:deploy` separately before
  deploying this application version. No dependency change is needed.

## Financial reliability — Batch 3

- Supplier intake keeps aggregate Order extraction and optional Item extraction in
  parallel. Optional Items have a hard 30-second budget, including configuration
  and response-body reads; timeout/failure preserves successful aggregate review
  with a warning. Aggregate failure cancels the optional request immediately.
  There are no automatic retries or extra model calls. Standalone Item extraction
  and spreadsheet mapping retain their existing 90-second provider budget.
- Item diagnostics record bounded stage/category, duration, provider/model and
  request/response correlation metadata. Raw provider errors, model output, quote
  text, file names, spreadsheet samples, binaries and credentials are not logged.
  Existing models, strict schemas, review/approval and temporary-file rules remain
  authoritative. Tests use mocked providers and consume no API credits.
- Dependency security uses targeted compatible patches, with Next and its ESLint
  configuration updated together and Vitest paired with its coverage package.
  shadcn is a development/build dependency; its existing stylesheet import remains.
  Weekly Dependabot proposals cover npm and GitHub Actions, with bounded open PRs
  and manual review; no automatic merge or deployment is introduced.
- The dependency-security workflow audits the lockfile without installing/running
  package scripts or using application credentials. It blocks High/Critical
  production findings and Critical findings across all dependencies, and reports
  all development findings. The unpatched development-only `braces` advisory
  `GHSA-vfj7-8cjw-p6xm` remains visible; do not downgrade protected framework/tooling
  versions or force incompatible overrides just to clear its report.
- No Batch 3 schema change or migration is required. Earlier prepared migrations
  remain separate rollout requirements; no database/deployment action is implied.

## Operational financial control — Phase 3

- Home's shared follow-ups add an active employee owner, next follow-up date and
  note. ADMIN/MANAGER saves are audited and version-checked; failed saves retain
  drafts. USER can read. Ownership survives balance and horizon changes; personal
  snoozes remain separate. Possible duplicate groups have no shared owner because
  their group identity can change. A hidden/disappearing issue is not marked resolved.
- The same attention list offers All/Mine/Unassigned ownership and Payments & invoices,
  Payment setup, Data checks and All alerts views. Data checks also exposes unassigned financial records and archived Projects with
  open issued-document balances. These original-currency review rows never enter
  active-Project totals or forecasts. Direct receipts can settle an Invoice without
  settling each term; the authoritative document balance decides closure. Ambiguous
  or unlike-currency balances remain incomplete rather than fabricated totals.
- Reports → Bank reconciliation accepts reviewed UTF-8 CSV rows with explicit column,
  date and decimal-format mapping, account label and one currency. Only normalized
  reviewed lines persist; the source CSV is not uploaded or stored. Matching links a
  bank line to existing Supplier payments, recognized Client Invoice receipts,
  Project freight payments or recorded credit refunds, never creates cash, changes
  schedules or supplies FX. Client refunds are money out; Supplier refunds are money in.
  Same-currency/direction amounts must sum exactly using Decimal. A cash record may
  belong to only one bank match; grouped matches are supported, splitting one cash
  record across bank lines is not. Imports and match/unmatch operations are audited.
- Identical imports for the same normalized account label/currency are idempotent;
  overlapping bank rows are review warnings, not auto-matches. A changed, removed,
  trashed, unassigned or no-longer-recognized cash source makes its match Needs review.
  Reconciliation identity links deliberately survive source removal without preventing
  existing Trash/unassignment behavior. They are evidence, never financial authority.
- Migration `20261002000000_financial_followups_reconciliation` adds only follow-up
  and bank-import/line/match tables. It is prepared, not applied, and must be deployed
  separately before this version's Home or reconciliation workspace is used.
- Billing and Purchasing Related expose Credits & refunds. ADMIN/MANAGER records
  reviewed credits and actual refunds; USER can read. Credits retain the original
  Invoice/Order, payment terms and cash history. Every mutation is audited,
  transactionally authorized and checked against the original editor version.
- Supplier credits reduce reviewed Product/Freight/Other cost and explicitly linked payable input
  VAT, preserving recoverability and the agreed Client selling price in every pricing
  mode. Ambiguous multiple input-VAT entries require review rather than averaging.
  Credits against separate Project freight expenses remain outside this slice.
- Client credits reduce Invoice HT/VAT and only explicitly selected linked Order
  allocations. Category reductions are bounded by remaining Invoice and allocation
  merchandise/freight/other balances; unassigned credit remains at Project level.
  Original commercial FX and reporting currency are snapshotted, never invented.
- A credit reduces net payable/receivable, not actual cash. A fully credited unpaid
  record is not falsely marked Paid. Already-paid documents can have refund due;
  actual refunds are separate dated transactions with independent actual FX.
  Project/portfolio revenue, costs, VAT and cash include credits/refunds once. Missing
  FX remains incomplete. Undated refund obligations/receivables remain visible in
  attention and make cash forecasts incomplete rather than being assigned a fake date.
- While credits are active, incompatible source financial/currency/linkage changes
  and cash corrections are guarded. Correct actual refunds first, then cancel the
  credit if the original needs financial correction. Credit/refund cancellation
  preserves history. Records and ancestors linked to any credit history cannot yet
  be moved to Trash; ordinary unrelated Trash remains unchanged. Unassignment is
  blocked while related credits are active. Mixed-currency/ambiguous payment sources
  block credit/refund creation.
- Migration `20261002010000_financial_credits_refunds` adds normalized credit,
  allocation and refund tables, restrictive source relationships, immutable snapshots
  and validation checks, and permits refund reconciliation matches. It is prepared,
  not applied. Both Phase 3 migrations are required before deploying this version;
  apply them separately with the existing deployment workflow, never during build.
- Optional expected-final-profit forecasting remains deferred.

## Consistent daily workflow — Phase 2

- Projects, Purchasing Orders and Billing use the same Details / Related workspace
  with selectable Related sections. Editors remain mounted across sections, preserving
  drafts and existing section/tab/fragment links. Optional Items never creates an empty
  default work area when its Beta module is disabled.
- Payment terms expose Edit and Mark as paid directly on eligible outstanding rows.
  Edit opens the same full form as creation; partial payments and cancellation/reactivation
  remain inside that editor. Mark as paid confirms the remaining TTC, actual date and
  any required actual FX before recording cash. Payment history remains directly accessible. Paid terms offer no further
  payment or cancellation. The issued-Invoice prerequisite and authoritative cash
  transactions are unchanged.
- Purchasing header/list payment badges are read-only. Mark as paid opens a term-selection
  drawer, including on fully paid Orders; several terms require an explicit choice and a
  single term is preselected. This shortcut never pays the whole Order or invents a term.
  Mark as unpaid confirms undoing all reviewed payments on the selected term, with a reason;
  it does not cancel the term or record a refund. An active ADMIN/MANAGER may reverse cash
  in one serializable, audited transaction only when its exact reviewed versions still match.
  Cash remains recoverable in Trash, credit-history guards remain enforced, and retained
  bank matches require review when their cash source is removed.
- Purchasing and Reports keep presentation selectors inside their filter form with
  one Apply action. Billing's standard drawer keeps linked Order allocations collapsed
  but mounted, opening them for validation errors. Lists show Next payment due
  or Paid; payment dates remain in expandable cash history. Billing Details links
  its next due date to the authoritative Payment terms section.
- Financial labels distinguish Order pricing plans, allocated Billing recovery,
  full-Project invoiced results and cash. Presentation changes never turn Order
  sell coverage or partial allocation recovery into realized Project profit.
- ADMIN/MANAGER can open exact-record History from Project, Order and Billing Related.
  It reads the latest 20 existing parent-record audit events and links to Activity
  filtered by entity type and ID. Before/after values are allowlisted safe scalar
  fields only; old events without those snapshots show their existing summary.
  Child-record payment history remains with payment terms rather than being guessed
  from unrelated audit metadata. USER receives no activity data. No migration required.

## Financial trust — Phase 1

- Main expected Client cash uses issued Invoices only. Quotes and To be invoiced
  Invoices are separate planned receipts, never primary forecast income. Project,
  Reports and Financial attention use the shared cash-expectation rules; term
  balances are capped by the document balance, including unassigned receipts.
  Explicit Quote/Invoice matches are attributed once. Actual and expected FX remain
  independent; missing FX, overdue and undated balances stay visible.
  Matched-term currency mismatches or ambiguous multiple-Invoice links are explicit
  read-side review issues, never cross-currency numeric caps or arbitrarily selected
  forecast owners. These guards do not rewrite historical links or receipts.
- Existing Draft or To be invoiced Invoices must be explicitly saved as Invoiced
  before recording a receipt or selecting a cash status. The server rejects bypasses;
  issuing creates no cash. Issued-Invoice payment shortcuts and explicitly reviewed
  Paid-at-create historical intake remain supported.
- The focused Project budget/pricing editor carries a financial snapshot version.
  A conflicting save is rejected transactionally and preserves the open draft,
  including its original version across server refreshes. Reopening loads current
  values. Audit metadata records exact before/after values and changed fields.
  This protection is scoped to the focused budget/pricing editor.
- Related navigation resolves the first valid section query, legacy tab or fragment.
  Generic `tab=related` links do not mask a specific fragment; explicit Details and
  draft-preserving mounted work areas remain supported.

## Simplified Project financial overview

- Phase 3 keeps Details / Related, with mounted Related work areas for Billing, Purchasing,
  payment terms, freight, buildings/rooms, Client and enabled Beta Items. Switching work areas
  preserves drafts; the `section` query parameter retains selection and existing subsection
  links still work. Package management is retired from the UI. Shared related tables
  retain visible-page selection, inline editing and relationship-only removal.
- Project rendering reuses React request-scoped reads for Orders, Supplier terms, Billing and
  freight summaries; these are not persistent caches. Related omits unused legacy cash-table
  queries. Resolve the active user and Project before financial reads; missing/trashed Projects
  use not-found, while load failures show retry guidance rather than fabricated financial zeros.

- Phase 2 adds Project-scoped attention (overdue plus a 30-day funding horizon), with upcoming
  reminders separate. Overview figures open source-record drawers: recognized receipts use actual
  FX, commitments reuse capped cash-outlook entries, and planned/overdue/undated amounts stay distinct.
  The focused budget/pricing drawer writes only financial target/default fields with role checks and
  transactional audit; unrelated Project details and existing payment terms are never resubmitted.

- Project Details leads with the full-Project commercial position (issued Invoice HT, recorded
  economic cost and Billing less cost), then actual TTC cash, all-date outstanding commitments,
  upcoming cash and approved budget comparison. Billing less cost is not a final-profit headline.
  All-date commitments reuse capped outstanding terms and unscheduled balances, keep expected FX
  incompleteness, and separate planned client receipts. Missing budget inputs are named explicitly;
  zero is an approved value, never a replacement for missing information. Allocation coverage,
  category/freight breakdowns, VAT, purchase-budget allocation and planning fields remain in
  collapsed sections; Details/Related, editing and underlying records are unchanged.
- Actual cash is recognized Client Invoice receipts plus Supplier refunds, less Supplier
  and Project-freight payments and Client refunds, using each transaction's actual FX.
  It is net tracked Project cash, not a bank balance or freely available funds.
- The Project overview offers 7/30/90-day cash windows (30 by default), from today through day N−1.
  Financial attention uses the same inclusive end date through the shared cashWindowEnd helper;
  overdue amounts remain visible separately from the Project's future window.
  Issued Invoice unpaid terms are primary receipts; Quotes and To be invoiced documents are separate
  plans and never enter projected net cash. Matched Quote terms count once under their Invoice.
  Draft/cancelled/trashed documents are excluded. Reports separates planned receipts
  from primary cash totals; Calendar preserves planning context and Issue invoice reminders.
- Expected amounts use term FX and remaining balances capped by the document balance, including
  receipts without term assignment. Unscheduled and undated balances remain visible. Overdue
  balances are shown separately, not silently moved to today. Missing required values/FX,
  undated commitments or overdue balances make projected cash incomplete pending review.
- Provisional profitability reuses issued Invoice HT less all recorded Order and Project-freight
  economic costs. Expected profitability uses the approved full-Project budget, not an invented
  estimate-to-complete. Effective markup/margin use monetary totals; no averaging or cash basis.
  Missing budgets remain incomplete; zero budgets are explicit. No schema change or migration.

## Unified Billing status and Project coverage

Billing has one workflow status: Draft, To be invoiced, Invoiced, Partially paid, Paid,
Overdue or Cancelled. Overdue is derived solely from unpaid-term dates (with the
existing document-date fallback), never a persistent manual override. Moving due
dates forward clears Overdue; legacy stored OVERDUE values follow the same rule.
Draft/To be invoiced Invoices are excluded from actual
revenue, VAT, allocation coverage and cash forecasts; Quotes remain planning
documents. Paid is derived from actual receipts, including matched Quote-term
receipts once. Confirming Paid records the remaining cash against open terms
with the employee's actual date and FX, transactionally. Payment corrections
reopen the balance; unpaid issued Invoices become Overdue from term dates.
Pre-invoice and cancelled states do not automatically advance. Billing no longer
uses the legacy display-only payment override; Purchasing also derives payment status from actual cash.

To be invoiced Invoices appear in the calendar as one Issue invoice reminder on
their document date. This is not a cash event and never creates a receipt or
primary forecast balance. Their terms can contribute to separately labelled planned
receipts, not expected issued-Invoice income. Changing the date moves the reminder; issuing, cancelling or
trashing the Invoice removes it. Draft documents and Quotes have no such reminder.

Purchasing and Billing have an optional 240-character short description, edited
with the audited cell editor beneath the list reference. It replaces the list's
Invoice/Quote sublabel, not the authoritative document type. Empty historical
descriptions remain null. Requires migration `20260921000000_document_short_descriptions`;
preparing it does not authorize applying it to a database.

Project Overall Coverage compares full-Project active Client Invoice HT with
all recorded Purchasing economic costs and Project freight, whether allocated
or unallocated. It is a billing/cost position, not a gross-profit headline.
The allocation-based invoiced coverage and actual cash coverage remain separate.

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

Supplier payable uses total Order cost HT (purchase + freight + customs/duties +
miscellaneous) plus input VAT payable under the helper's `DOMESTIC`/`CUSTOM`
treatments. This applies consistently to Order balances, new terms, intake and
reporting; recoverable VAT is still cash payable, never added twice through economic
cost. Separate Project freight expenses must not duplicate an Order cost. Existing
terms retain their saved amounts; any uncovered difference is unscheduled until an
employee edits/adds a term or explicitly records the full remaining Order payment.
Actual payments and credits are preserved. Supplier credit HT is capped by the
reviewed Product/Freight/Other categories; cash limits use the full Order payable.
Actual cash uses receipt/settlement dates and their own FX. Forecasts use outstanding
Billing/Supplier installments, due dates, and expected FX. Cash position is Client
cash received minus Supplier cash paid. Cash timing never determines profitability.
Legacy Order `CLIENT_RECEIPT` schedules must not become actual Client cash truth.

**Receipt eligibility:** New Client receipts require an active Invoice. Historical receipts remain editable and are never silently deleted. Project cash reporting recognizes active Invoice receipts, including receipts on an explicitly matched Quote installment once. Unmatched Quote/cancelled-context receipts are retained for review and flagged in Project financial control. Actual receipt FX remains independent of Invoice FX.

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
model choices (GPT-6 Luna, GPT-6.1 Sol), with GPT-6 Luna as the default for all three.
Retired GPT-5.6 Terra/Luna/Sol settings and environment defaults resolve to GPT-6 Luna
on read, without rewriting database settings or historical import metadata.
Migration `20261005000000_ai_processing_gpt6_models` expands the database model
constraints and must be deployed before saving the new choices. It is prepared,
not applied. Saved choices override environment defaults for new
requests without process caching. ADMIN/MANAGER changes are validated and audited.
The additive `20260910000000_ai_processing_models` migration is required before rollout.
Import metadata retains the model used during extraction, not a later settings choice;
legacy Supplier review drafts without model metadata are recorded as unknown.

Aggregate Order review must work without Items Beta. A recognized optional
Item-provider failure becomes a warning; it must not discard successful aggregate
extraction. Billing allocation and reviewed payment-term proposals are optional.
Manual Order creation and Supplier intake support multiple reviewed Billing allocations
through the same Add/Remove editor. Each Billing document appears at most once, belongs
to the selected Project, and retains its own currency, allocation amount and category
subsets. Amounts stay blank until entered; adding a row never repeats the full Order
selling amount automatically. Allocation percentages reuse the authoritative Order sell
basis and manual FX. Update-intake previews are independent for each Billing document.
Intake and manual creation with Billing allocations use a bounded 30-second
serializable transaction; the saved Order financial context is read once for the
allocation batch. A failed batch rolls back together and preserves the review.
The Order and all submitted allocations save atomically using existing allocation
validation/auditing. An invalid row preserves the complete draft. Intake adds links;
an existing allocation must be changed in its dedicated editor, never overwritten by
another import. Source files remain temporary. No schema or migration is required.

Items (Beta) is optional and disabling it preserves data. Supplier intake, Billing,
profitability, cash, VAT, and Funding Coverage must remain usable without Items.
Do not introduce an Item dependency without explicit feature design.

## Lasting UX and compatibility rules

Keep planned versus actual terminology explicit. More contains separate Payments and Receipts lists for actual cash, and Installments with Supplier/Client tabs for schedules;
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

- Project Package grouping is retired from all visible workspaces, filters, selectors,
  Related tables and CSV columns. Preserve historical grouping rows/links and `packageName`
  compatibility fields; they remain neither cost nor revenue authorities. Ordinary edits
  preserve these fields. Moving an Order to another Project clears its old grouping.
- Allocation amount remains the authority. Fixed HT, percentage of Billing HT, and
  percentage of Order Sell HT are interchangeable UI inputs. Convert the Order basis
  into Billing currency with the existing manual-FX helper; incomplete FX disables that
  percentage. Revised Supplier intake previews use the same candidate/pricing helpers
  as confirmation and make no AI calls or writes.
- Payments shows actual Supplier settlements; Receipts shows actual Client Billing collections.
  Both link to individual Details/Related pages with local Edit drawers.
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
- The Payments and Receipts headers open the shared entry drawer for Supplier payments and Client
  receipts respectively. Reuse `recordSettlement` and `recordClientReceipt`, including their
  transactional audit and overpayment checks. Central entry validates the selected
  Project/document within the write transaction. Supplier payments require an
  installment; the existing installment creator is available within the drawer.
  Client receipts may be Billing-level. Selecting an installment proposes its current
  outstanding amount; manual overrides survive unrelated edits. Contextual Order and
  Billing entry remains available. Overview and Transactions tabs are removed; legacy
  links redirect to the appropriate cash workspace, preserving their scope.
- Rollout requires `20260909000000_project_order_packages` before the new application.
  Migration creation/generation does not authorize applying it to the configured database.

## Billing freight coverage

`freightCoverageHt` is a reviewed subset of Billing HT and of each Order allocation HT, never extra revenue. Order freight/non-freight allocations must fit the corresponding document portions; unassigned freight remains at Project level. Active Invoices provide actual freight coverage, Quotes planned coverage, and cancelled documents neither. Preserve manual FX incompleteness. AI freight extraction is a proposal requiring employee confirmation.

## Temporary onboarding previews

Client and Supplier onboarding may keep a browser-only object URL for a side-by-side PDF/image preview during review. Revoke it on replacement, successful save, or onboarding unmount/close. Do not persist sources in database, browser storage, or uploaded-file storage; server extraction inputs remain request-scoped and are still cleared after processing.

## Simplified workspaces

- Project Related contains scoped record tables for Orders, Billing, Supplier payments,
  Client receipts and both installment types, plus Buildings, Rooms and optional Items.
  Canonical operational lists remain the filtering/export workspaces. Purchase budgets
  never replace Order financial authority.
- Project, Order (including those opened from Purchasing), and Billing records have exactly
  two mounted tabs: Details and Related. Details owns fields, financial breakdowns, dates,
  delivery and notes; Related owns linked records, allocations, schedules, payments,
  receipts and document history. Switching tabs must preserve drafts. Project Details includes
  planning, pricing defaults and financial reporting; Project Related lists connected records
  and owns Buildings/Rooms and freight-expense management. Settings retains its
  existing section layout.
- Purchasing is the record presentation reference: shared compact summaries, two-column financial
  label/value cards, and Related category headings with descriptions and adjacent actions. Use
  `record-presentation.tsx` and `RecordWorkspace` to keep Project, Order and Billing views aligned.
- Billing and Order details use a confirmed Cancel button instead of Active/Cancelled selection.
  Existing cancellation/receipt safeguards remain unchanged. Fulfilment statuses remain a separate
  Order concern. Payment status follows actual cash and due dates; legacy display-only overrides are ignored.
  Paid records the full remaining balance. Partially paid opens an amount/date/FX entry.
- Billing Details displays unallocated Billing HT, total included freight HT, freight allocated
  to Orders HT and freight remaining at Project level HT using existing Decimal helpers.
  These are commercial allocation amounts, not uncollected or unallocated cash.
- Purchasing and Items use a standard operational table with secondary column-set selectors;
  Billing combines commercial amounts and collection status in one table. Do not create a
  second record list for each column set. Shared filters, sorting, pagination and exports
  preserve the current scope.
- Reports use one report selector, optional portfolio columns, and one applied-filter summary.
  Supplier directory pages link to the canonical scoped Purchasing and Payments lists.
- Record Payment and Record receipt are available in their respective cash lists; the current Project and
  cash direction prefill the drawer. Legacy entry URLs still open the drawer. No entry
  action is shown to USER employees; server authorization remains authoritative.
- Billing and Order allocation changes use BillingAllocationEditor and the existing
  audited action, preserving the freight subset and manual-FX percentage behavior.
- Existing Project/Order/Billing tab/hash links select Details or Related and locate the original
  subsection. Settings disclosure links remain supported. Legacy Project tab
  links for Orders/Billing/Items open scoped workspaces; Cash opens the scoped cash report.
  Historical Order Client schedules are displayed only when installments exist; no historical
  records are deleted.
- `RelatedRecordTable` is the shared table presentation: record counts, explicit empty states,
  independent 10-row paging, currency-labelled amounts and accessible record links. It pages
  scoped data in the browser, not at the database; large-Project server paging remains a known
  performance follow-up. History metadata has no source-file link because binaries are not retained.
- Project, Order and Billing links from these tables open `?tab=related`. Supplier payments,
  Client receipts and Supplier/Client installments have their own Details/Related pages under
  `/payments/[paymentId]`, `/receipts/[receiptId]`, and `/installments/{supplier,client}/[installmentId]`.
  Their readers resolve the active user and validate IDs. Local Edit drawers
  reuse the authorized Order/Billing mutation services and preserve failed drafts. Buildings and Rooms remain managed within
  their Project; Items open their existing record pages.
- An Order has one Project. Order Related includes Supplier payments/installments and linked Billing,
  but deliberately does not project Billing receipts or Client installments onto the Order. Open
  Billing to inspect Client cash. Billing receipts have one owning document and optional installment;
  a matched Quote installment and its receipts are included once through OR-scoped queries, not
  concatenated cash totals. Receipt pages link the owning document, installment source Quote and
  matching Invoices without duplicating those documents.
- This presentation cleanup introduces no schema changes or new migration.

## Cash workspaces and recoverable Trash

- Payment terms are edited within Billing, Purchasing and Projects; Payments, Receipts and Installments are no longer separate navigation destinations. Historical record URLs remain compatible. Actual dated cash history stays normalized beneath each term and is expandable for corrections.
- Billing and cash tables share visible-page checkbox selection and confirmed deletion. Business deletion now moves records and their dependents to Settings → Trash, retaining original normalized data, links, rates and dates. Employee deletion remains the existing separate permanent ADMIN workflow.
- The Prisma visibility policy excludes trashed roots, nested lists/counts, supporting records and financial aggregates, and rejects mutations targeting trashed records. Raw SQL is reserved for transactional Trash operations, restoration checks and sequence reservations. Keep model-map.ts aligned with schema.prisma.
- A deletion group restores together; previously trashed children retain their own group. Restoration verifies external parent fingerprints and rejects overpayments, duplicate collection schedules and excessive allocations. It never rewrites intervening business edits. Reserved installment sequences and identifiers are retained while in Trash.
- Trashing an Invoice hides its owned receipts while preserving its Quote installment link, allowing the Quote forecast to resume. Restore recovers the original match without duplicate cash.
- Requires migration 20260913000000_recoverable_business_trash before running this application version. Preparing the migration does not authorize applying it to a configured database.

## Related removal and unassigned cash

- Related removal clears a relationship; main-list deletion continues to use recoverable Trash. Cash removal transfers the same UUID atomically into normalized UnassignedCashRecord storage, preserving original amount, date, currency, reporting-currency FX and creation attribution. Exactly one cash authority exists after commit. Former schedules and document/Project balances no longer include that cash. Historical Order client planning settlements cannot become actual cash.
- Unassigned cash records retains its separate review route with inline reference/date/amount editing and recoverable Trash, but is no longer shown under More. Retain currency and FX context rather than inferring it from a new parent.
- Related controls include optional parent assignments, direct link removal, and inline cash/installment/allocation edits. Unassigned business records retain their existing routes but are no longer listed under More.
- Confirmed behavior for Project–Order unassignment: retain the last effective Product, Freight and Other markup rates as explicit Order overrides, switch inherited Project markup to Order markup, and retain the effective freight allowance as a manual Order amount. Preserve direct selling prices, original currencies and FX context; never substitute zero for an incomplete value. Capture these values atomically when removing the assignment so later Project edits cannot change the detached Order's economics.
- Migration 20260914000000_unassigned_cash is prepared for this change; creation does not authorize applying it.

## Unassigned relationships

Removing from Related clears assignments and retains the original business record; main-list deletion still uses recoverable Trash. Detached Orders freeze their last effective component markup rates and freight allowance, retain currencies/FX, and stop contributing to the former Project. The freight allowance override uses Decimal(38,20) to retain the calculated allowance without introducing rounding when freezing it. Detached installments retain their scheduled amount, date and reporting currency; removed cash assignments transfer the same cash identity to Unassigned cash records. No reassignment is required.

Migration `20260915000000_unassigned_relationships` must be applied separately before running these workflows; it is prepared only.

## Project financial control

- Billing HT and each Order allocation contain Freight and Other/services subsets; Merchandise is the remainder. All three portions must reconcile without changing Invoice HT, VAT or cash. Existing non-freight data remains merchandise until reviewed. Funding Coverage retains its existing eligibility and Order-sell formula.
- Project control shows budget versus recorded-category cost and marked-up recovery targets separately, with Invoice versus Quote recovery, Order attribution and Project-level amounts. Category balances never move revenue or cash automatically. Order non-deductible VAT remains an explicit Project economic-cost adjustment rather than an invented category allocation. Invoiced profit/markup is provisional; current editable Project component defaults remain the agreed comparison.
- Freight expense payments are normalized actual outflows with independent dates/FX, overpayment protection and audit. Expense due dates drive derived forecasts; missing due dates remain undated commitments. Overdue plus 30 days is the primary cash funding horizon; all remaining scheduled Supplier and freight commitments are also shown. Unscheduled Order balances stay distinct.
- Freight payments affect Project/portfolio actual cash and cash-flow forecasts once, never freight economic cost. Expense deletion carries dependent payments into recoverable Trash; restoration checks overpayment. Related unlinking transfers the same payment UUID, amount, currency, FX and date to Unassigned cash.
- Requires migration `20260916000000_project_financial_control`. Preparing/generating this migration does not authorize applying it to the configured database.

## Simplified payment terms

- New Billing/Order records create reviewed terms, otherwise one 100% term when the payable is positive. Billing's creation-time Payment due seeds that default term only; explicit split terms retain their own dates. Absent dates remain null and display Date needed. Existing records are never silently rescheduled. Quote/Invoice matches retain one forecast.
- Terms use one full creation/edit form across Purchasing, Billing, Projects, Related tables and individual term pages; reduced inline term editors are no longer exposed in those views. Embedded terms use individual cancellation rather than bulk unlinking. Full/partial payment recording preserves actual cash history and existing edit drafts. Status derives from cash and dates; overdue partial payments show both facts. Actual cash dates, currency and independent FX remain authoritative. Cancelling a term removes its remaining forecast while retaining cash history.
- Project and parent collection status use unpaid term dates. Overdue Client amounts include only overdue term balances, capped by Invoice outstanding. Payment terms are the sole due-date authority for reporting, calendar, status and cash forecasts; no runtime fallback to the historical Billing document date is permitted. Undated terms remain in all-remaining commitments without a calendar event.
- Settings Empty Trash is an ADMIN-only explicit permanent deletion, with typed confirmation and audit retention. It deletes only trashed business rows and dependent supporting data transactionally, rejecting active dependencies. Normal deletion remains recoverable Trash. Never invoke Empty Trash as part of development or verification against live data.
- Requires `20260917000000_optional_payment_term_dates`, prepared only; applying it is a separate controlled step.
- Before deploying the date simplification, apply the controlled `20261015000000_payment_term_due_dates` migration. It preserves legacy effective dates on terms without overwriting explicit dates, retains the historical document fields and protects Trash restoration. Conflicting dates on a shared Quote/Invoice term stop the migration for review. Preparing or testing it does not authorize running it against the configured database.

## Project coverage and Financials presentation

- Project Details groups Billing/Purchasing Invoiced Coverage, Cash Coverage and Freight Coverage together. The renamed invoiced coverage retains the existing eligible Invoice coverage minus all non-cancelled Order Sell HT calculation; no new Supplier-invoice-only filter is implied.
- Cash Coverage is actual recognized Client Invoice receipts minus Supplier settlements and Project-freight payments (TTC), using each cash record's manual FX once. Unassigned, trashed and ineligible Client cash remain excluded. This replaces the separate Project cash position panel, not the cash reporting model.
- Freight Coverage uses Order freight HT plus Project freight-expense HT, excluding all input VAT. The Project default freight markup determines the displayed markup amount and Supplier Freight Sell HT. Existing economic-cost and Order-specific pricing calculations remain unchanged.
- Client Freight paid HT is reporting-only proportional attribution: receipt TTC × active Invoice freight HT ÷ Invoice TTC, converted with the receipt's actual FX. An active owning Invoice takes precedence; a Quote receipt uses its single active matched Invoice once. Ambiguous Invoice attribution or missing required FX remains incomplete. Coverage compares Client freight invoiced/paid HT separately against Supplier Freight Sell HT; no revenue, receipt or allocation records are rewritten.
- Financials retains Merchandise, Freight and Other/services with a Total money column. Missing category values keep the total incomplete; markup defaults are neither summed nor averaged. Budgeted Sell HT, Target Revenue HT, Allocated Client Invoice Amount HT and Unallocated Invoice HT name the measures without changing their financial authority. Unallocated Invoice HT in this table means Invoice HT outside active Order allocations, not the separate funding-coverage formula.
- This presentation and derived-reporting change requires no new migration.

## Payment-status and Billing-entry refinement

- ADMIN/MANAGER Paid actions record actual remaining cash transactionally; the Purchasing
  header/list requires selection of the payment term rather than settling the whole Order.
  They preserve earlier partial payments and default the new actual date to today. Foreign-currency cash
  requires employee-entered actual FX. Purchasing partial payments use the term editor. Status corrections
  use the underlying cash records; legacy display-only override columns remain but no longer drive the UI.
- Billing's New Billing menu exposes Import Client document and Enter manually. Manual creation
  opens the existing reviewed form and authenticated confirmation service without upload or AI calls.
- Budgeted Project freight HT is now automatically expected Product Purchase Cost HT × Project
  freight estimate rate. This applies to Financials, target calculations, Project details and exports;
  Project saves derive the legacy estimatedFreightCostHt column rather than trusting manual input.
  Existing Projects calculate it on read without backfill. Missing planning inputs remain incomplete.
  Actual freight expenses and Order AUTO allocation remain separate and unchanged.
- Financials omits Recovery less recorded-cost selling target. Freight coverage uses the concise
  Invoiced Freight Coverage HT and Paid Freight Coverage HT labels; both still subtract Supplier
  Freight Sell HT from the corresponding Client value.

## Purchasing dates and list simplification

- Purchasing labels the operational/fulfilment column Delivery status; Payment status remains
  separate. Its standard table includes Added date, Next payment due and Expected delivery.
  Added date is an editable business date, automatically set when first creating/confirming
  an Order in Purchasing, independent of Supplier dates and the immutable creation timestamp.
  Later imports and unrelated edits preserve it. Newest-added is the default list/export sort;
  date-range filters also use Added date. Supplier document dates stay in Details/editors only.
  Migration `20261024000000_purchasing_added_date` backfills existing rows using the Paris
  calendar date of `createdAt`, then requires a non-null date with a Paris-business-date default.
  Prepare and validate this migration locally; deployment requires its controlled application.
  Next payment due is the earliest outstanding non-cancelled Supplier term date.
- Everyday Purchasing entry shows one selected Supplier document date and Expected delivery.
  Additional details preserve Order/older document dates and historical ready/lead-time values.
  Ready dates are no longer recalculated or emitted on the calendar. Marking Delivered proposes
  an actual delivery date for employee confirmation; expected and actual delivery history stay separate.
- Supplier invoiceDate is a separate optional business date, edited in the Order form. Never infer
  it from Order or Quote dates or overwrite it when an intake omits it. Historical values stay null.
  Requires migration `20260919000000_supplier_invoice_date`, prepared but not applied.
- All Purchasing data columns have URL-driven server sorting before pagination, including the
  secondary column sets. Derived money/payment sorts use existing Order summaries over the full
  filtered scope; native fields retain database paging. Money sorts group by currency before
  Decimal comparison, missing derived values sort last, and ties use immutable IDs.
  Derived sorting loads the filtered scope on the server; very large scopes may require
  optimization without introducing duplicate persisted financial totals.
- Billing labels document dates by context: Quote date, Planned invoice date or Invoice date.
  Received and Outstanding retain their authoritative TTC cash values. Planned invoice dates
  remain Issue invoice reminders and never become payment deadlines.
- Project Details no longer renders the redundant Full-Project target vs actual table.
  Financials, coverage, VAT and underlying reporting calculations remain unchanged.
- More omits Unassigned cash records and Unassigned records. This is navigation-only removal;
  original records, unassignment workflows and historical direct URLs are preserved.

## Purchasing and Billing cell editing

- ADMIN/MANAGER can click editable list cells; Enter or the checkmark saves and Escape cancels.
  One cell editor is open at a time. Blur does not discard a draft, failed saves retain it, and
  duplicate submissions are blocked. References remain record links with a separate edit pencil.
- Single-field changes validate permissions, current stored values and relationships server-side
  inside an audited transaction. Stale cell values are rejected rather than overwriting newer edits.
  Purchasing and Billing Paid actions both record actual cash; neither uses a display-only override.
- Calculated financial and cash cells open the authoritative Details or Related editor instead of
  overwriting derived totals. Purchase HT uses the existing Order pricing/VAT service. Billing HT
  preserves entered VAT, recalculates TTC and percentage allocations, and checks payment limits.
  Existing payment terms are never silently rescheduled by a cell edit.
- Billing Client/Project changes select the Project and its Client together. Linked allocations,
  payment activity and currency/FX safeguards remain authoritative. Cancelled records are read-only.
  This change introduces no schema migration.

## Approved consistency review (September 2026)

- Financials category costs and cost-plus targets are strictly HT. The separate economic bridge adds Order and Project-freight non-deductible VAT once. Existing economic profit/VAT calculations remain authoritative.
- Project budget requires explicit Merchandise, calculated Freight and Other/services amounts. Nullable `estimatedOtherCostHt` is unknown until reviewed; an entered zero is an explicit zero budget. No historical backfill. Migration `20260922000000_project_other_budget` is prepared; deployment is a separate action.
- Overall Budgeted Sell follows `targetMode`: EXPECTED_SELL uses the approved overall value with category targets marked Not allocated; MARKUP uses complete approved category budgets and component rates.
- Distinct names identify different bases: Billing less cost, Billing less Order sell, Unallocated Invoice HT, Cash balance and Freight recovery surplus. Project and Reports use one effective freight recovery target: applicable Order freight markup plus Project-expense markup on economic freight cost. The breakdown distinguishes raw HT, non-deductible expense VAT and markup. The Project planning allowance and allocated Billing less freight cost remain distinct.
- Full Order/Billing financial editors and Billing allocation drawers carry a version of the record and financial dependencies. Stale saves are rejected with changed field/group names while retaining drafts. Transactions are serializable. Closing/reopening refreshes the edit snapshot; a refreshed page must not silently bless a stale draft.
- Simple text/date cells remain inline; money and relationship choices use contextual drawers. Derived totals link to their authoritative source editor. Billing has one status control in its header; Reference is primary and short description is secondary. Legacy Order titles and Project Package grouping are no longer displayed.
- Due-date display uses the earliest unpaid term, with no Client document fallback. Date edits affect that term only, never the whole schedule. Cash calendars use remaining TTC, show original scheduled TTC separately, identify Quote planning and Invoice expectations, and list Issue invoice reminders separately.
- Billing and Purchasing list date columns show Next payment due, or Paid when settled. Sorting uses unpaid term dates only, with undated/paid rows last; settlement dates remain in expandable history. Payment corrections that reopen the balance restore the unpaid due-date display. No receipt/settlement date is invented when cash history is absent.
- Supplier-scoped actual cash filters outflows at transaction level, includes freight-only Supplier relationships and suppresses Client inflows rather than inventing Supplier attribution.
- Billing filters include derived status. Monetary/status sorting occurs before pagination and exports share the same validated filter/sort scope. Unlike currencies are grouped, never summed or compared as if equivalent.
- Allocation presentation distinguishes Merchandise, Freight and Other/services, with total/allocated/Project remainder. Payment term labels remain unchanged, with percentage/fixed basis in a separate column.
- Missing states are contextual: Not set, Not applicable, Missing FX, Not budgeted or Budget incomplete; zero remains a numeric value. Percentage-point differences use pp and FX keeps higher precision.

## Financial attention list

- Home defaults to Payments & invoices: Supplier/Freight payments, Client collections,
  invoices to send and refunds. Next 7/30/90 days controls upcoming events; overdue
  remains visible in every window. Payment setup contains missing dates, schedule
  differences and receipt-matching checks. Data checks contains reporting/payment FX,
  provisional profitability, duplicates, funding comparisons and unassigned/archived
  records. Counts and direct links keep these supporting checks discoverable without
  crowding the daily action list. All alerts remains available; filtering resolves nothing.
- Home consolidates a redundant document-level missing-date warning when that same
  document already has a schedule warning, unless the date warning holds a shared
  follow-up or personal snooze. Source keys, fingerprints, financial calculations,
  Project attention and incomplete-forecast flags remain unchanged. Unknown issue
  kinds stay visible in Data checks/All. Active-Project totals still exclude archived
  and unassigned records. No schema, migration or data backfill is required.
- Checks cover Supplier and Client outstanding terms, issue-invoice reminders, missing dates/FX, incomplete schedules, provisional invoiced markup below target, possible duplicate invoices and scheduled cash shortfalls. Duplicate detection is advisory, using party, side, currency, invoice date and TTC amount; it never merges records.
- Actual cash, remaining terms, matched Quote/Invoice receipts and profitability reuse authoritative financial helpers. Cash outlook excludes opening bank balances and becomes incomplete when required dates, schedules or FX are missing. Unlike currencies are never combined without valid conversion.
- Attention actions open existing records. Personal snoozes require a reason and a future date, expire on that business date, and stop hiding an issue when its displayed financial details or urgency change. Snoozing never changes financial records or hides issues from other employees.
- Migration `20260923000000_financial_attention_snoozes` adds personal snooze preferences only; it must be deployed separately before this Home implementation is used. Financial issues and totals are not persisted.

## Reports dashboard — Phase 1 foundation

- Reports and Project Details share `projectPricingRows` / `summarizeProjectPricing` and `buildCashOutlookDocuments` / `projectCashOutlook`. Project pricing includes active Order economic cost after Supplier credits plus separate Project freight economic cost once. Agreed Order selling HT stays authoritative; pricing profit is not actual earned profit. Company rates derive from aggregated comparable amounts, never averaged percentages.
- Reports Billing coverage is total issued Client Invoice HT after credits minus active Order selling HT, matching Project Details. Allocation eligibility remains a separate commercial attribution measure and no longer gates this headline.
- Supplier outstanding is capped in original currency before conversion: scheduled remaining uses each term's expected FX, unscheduled remaining uses Order FX. Actual settlements/refunds use their own dates and FX independently. Equal-date Supplier terms use immutable ID order; unlike-currency terms require review rather than numerical netting.
- Reports cash expectations use the same capped Invoice, Supplier, separate freight and refund obligations as Project Details. Quotes and To be invoiced stay separate. Overdue, undated, unscheduled and missing-FX/source-review balances are exposed through Forecast gaps; dates and FX are never invented to complete a forecast. Cancelled Orders contribute no expected obligations or pricing, while recorded Supplier cash remains actual cash.
- A Supplier filter scopes purchasing, freight and Supplier refunds only; it does not attribute whole-Project Client receipts, expectations or Billing coverage to that Supplier. VAT/freight reconciliation views explicitly describe their full-Project scope when filtered to Projects using a Supplier. Non-company-currency Projects remain separate from company totals.
- This foundation changes no schema, schedules or stored financial records.

## Reports dashboard — Phase 2 presentation

- `/reports` defaults to Financial dashboard; the existing Report selector retains all detailed reports and their CSV exports. Project, Client, Supplier and Project-status filters carry through dashboard drill-downs.
- Cash trend uses actual receipts, settlements and refunds over 3/6/12 calendar months through today (six by default). Cash received, Cash paid and Net movement cover that period; current Project pricing profit is separate, not historical earned profit.
- Upcoming cash groups the shared capped obligations by recorded due month, defaulting to 90 days. Planned receipts remain separate from issued expectations and expected net. Overdue, undated, unscheduled and missing-FX/source-review obligations remain visible; an unresolved timing/FX gap makes expected net incomplete. No opening bank balance, estimated payment date or predictive cash is invented.
- Project pricing and issued-Invoice coverage comparisons use comparable company-currency Projects, showing incomplete and lowest values first. Supplier scope excludes Client attribution. Excluded currencies and missing figures remain explicit rather than zero.
- Charts use existing UI tokens and server-rendered, accessible links with exact monthly tables. There are no new chart packages, stored metrics or schema changes.

## Reports dashboard — Phase 3 exports and scenarios

- Reports offers authenticated CSV downloads for dashboard summary, monthly actual cash, forecast, forecast sources, Project comparisons, cash transactions, VAT and freight. Downloads use shared reporting services and applied business filters, not visible-page pagination. Transaction dates may be open-ended; forecast exports retain their selected period. CSV rows identify metric, currency, source, date/period, filters and completeness; amounts remain exact Decimal strings, rates are fractions, and untrusted text is spreadsheet-formula protected. Null never becomes zero. Unlike currencies remain separate; exclusions are explicit. VAT net is signed (positive payable, negative credit).
- Cash-in delay offers on time / 15 / 30 / 60 days late. It shifts only future issued cash-in (including dated Supplier refunds), keeps scheduled cash-out unchanged, and never moves planned, overdue, undated or source-review balances. It is a read-only timing illustration, not a prediction, opening bank balance or change to source records. Plans stay separate; unresolved timing/FX gaps keep net and scenario impact incomplete. Downloaded forecast shows baseline and scenario separately; forecast source records retain original dates.
- Scenarios are query-string presentation state, not stored financial assumptions. No schema, migrations or new dependencies are introduced.
