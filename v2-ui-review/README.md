# V2 UI review and redesign proposal

Review only · 5 September 2026 · MB Procurement ERP

**Recommendation:** a quiet, Project-centered workspace with six primary destinations, task-specific tables, one contextual action area, and financial detail revealed where employees need it. Keep the current business model and Phase 12 distinctions intact.

This is a proposal, not an implemented redesign. The separate [interactive specimen](./index.html) uses fictional data and demonstrates Home, a Supplier Orders table, a Project detail layout, navigation, filters, and bottom utilities. It has no application or database connection.

Baseline: branch `V2.0`, commit `82b499b9e831e5e6e767ba3de0aa0f9562cce2e9`, tracking `origin/V2.0`; initially clean. Reviewed `docs/development-invariants.md`, current route/component source, relevant domain/presentation rules, and Phase 12 history. Following explicit read-only authorization, inspected the signed-in V2 deployment: Home; Projects list/detail; Clients and Suppliers lists/details; Orders list/detail and import entry; Billing list/detail; Supplier Payments; Calendar; all five Reports views; Settings; Employees; Activity; Search; and the disabled Items route. No production records are reproduced here. Enabled Items, post-extraction review, destructive/validation failures and alternative-role states were source-reviewed, not exercised against production. Deployment commit identity was not independently verified; local source findings refer to the baseline SHA above.

## A. Current-state diagnosis

The foundation is sound: owned shadcn primitives, Geist typography, restrained tokens, server rendering, meaningful loading/error boundaries, Decimal-safe presentation, URL filters, server pagination, and reviewed document intake. Phase 12 already removed the full portfolio table from Home, made Payments supplier-only, placed actual Client cash in Billing, and introduced progressive detail. Build on those decisions.

The main problem is composition and hierarchy, not an unsuitable framework or a need for a new brand.

| Finding                                              | Current evidence                                                                                                                    | Priority / recommendation                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Every sidebar destination looks selected             | Desktop and mobile navigation set `aria-current="page"` unconditionally and apply the same active style                             | High: one actual destination active; parent section active for detail routes, Home exact-match only      |
| Projects are demoted below Settings and Activity     | `src/config/navigation.ts` puts Projects under Directory                                                                            | High: Projects become the second primary destination                                                     |
| Persistent chrome repeats context                    | 240 px sidebar, 64 px top bar, static “Workspace / Procurement finance,” static “Operational” badge, brand subtitle and ERP footer  | Remove uninformative layers; put search in sidebar and utilities at bottom                               |
| Filters dominate the first screen                    | Orders has 11 filter/sort fields plus page size; Items has 13 plus page size; most lists use large grids                            | Two or three visible controls; advanced filters in an anchored panel; sorting in headers where supported |
| Wide tables force scanning across unrelated tasks    | Orders financial view has 14 data columns; Billing has 12 including actions, with a 78 rem minimum width                            | Keep views, reduce each view to a coherent question; move secondary detail to the record                 |
| Detail pages still feel like stacked forms           | Bordered detail header, financial cards, nested cards, supplementary forms                                                          | One header and subnavigation, open sections with rules only where useful                                 |
| Repetition obscures meaning                          | Dashboard has two links to Reports; expanded freight repeats its heading; Billing row has row navigation, reference, View and Edit  | Remove duplicate entry points, not authoritative financial distinctions                                  |
| Financial warnings use emergency styling             | Some incomplete summaries use destructive badges; Items contains bespoke amber classes                                              | Separate incomplete/missing data from errors and overdue/action-needed                                   |
| Confirmation and editing are inconsistent            | Bulk deletion uses Radix AlertDialog; Billing removal uses `window.confirm`; freight expense delete submits immediately             | Standardize confirmation surfaces with existing scopes and service safeguards                            |
| Calendar can hide events                             | Daily rendering uses `.slice(0, 4)` without a “more” affordance; summary lists also cap results                                     | Show counts and a day agenda containing every already-loaded event                                       |
| Keyboard visibility has gaps                         | Global CSS removes button/link outlines; some raw filter, pagination and detail links provide no replacement                        | Shared visible focus treatment; audit actual focus paths during implementation                           |
| Draft retention does not imply navigation protection | Persistent-action forms retain failed submissions; shared detail cancel unmounts the editor; no common dirty-navigation guard found | Preserve existing retained drafts; add explicit discard handling as a later UX change                    |

Daily-use ranking is a design hypothesis based on the business flow, not measured usage: **Projects → Supplier Orders → Client Billing → Supplier Payments → Home → Reports → Suppliers/Calendar → Clients → Items when enabled → administration.** Home remains first as the orientation destination. Validate Suppliers versus Calendar prominence with employees before final rollout; do not add analytics to answer this review.

## B. Exact navigation and shell

```text
MB Procurement                         [Collapse]
Search records…                        → existing /search

Home                                   /
Projects                               /projects
Supplier Orders                        /orders
Client Billing                         /billing
Supplier Payments                      /payments
Reports                                /reports

More                                   disclosure, not a new route
  Clients                              /clients
  Suppliers                            /suppliers
  Calendar                             /calendar
  Items · Beta                         /items, only when enabled

──────────────── bottom utilities ────────────────
Settings                               /settings, ADMIN / MANAGER only
Avatar · employee name · role          [Sign out]
```

Settings contains local navigation to Company, Optional modules, Logistics Locations and Extraction diagnostics within `/settings`, plus Employees (`/admin/users`, ADMIN only) and Activity (`/admin/activity`, ADMIN/MANAGER). This groups access without moving routes or broadening permissions. USER sees their identity and sign out, not a Settings link that redirects them. Keep the Beta switch inside Optional modules with an explicit save; no persistent sidebar toggle and no invented Help area.

Expanded sidebar: **224 px**, softly tinted neutral surface, 36 px navigation rows, 18 px Lucide icons. One selected row has a pale accent fill and stronger text; hover stays neutral. More automatically opens when one of its children is current. An explicitly collapsed **60 px** rail may be remembered locally; provide labels/tooltips and keyboard access. No automatic collapse during an active edit.

At 1024–1279 px offer collapse and reduce content gutters to 24 px. Below 1024 px retain the existing Sheet-based navigation with labelled open/close controls and a small mobile header; below 768 px use 16 px gutters and single-column forms. Tables scroll in their own containers. Do not build a separate mobile ERP.

Remove the desktop global top bar. Page headers own context and actions. Keep search accessible at every width: sidebar input expanded, labelled search control in the collapsed rail or mobile header. Use the existing submitted global search; a new command palette is unnecessary. Global search currently covers Project, Building, Client, Supplier and Supplier Order; do not promise Billing/Items search without a separate scope decision.

## C. Page-by-page recommendation and coverage

All paths below are existing application paths. Proposed tabs can use validated query parameters/anchors on those paths; route migrations are not a prerequisite. The table combines source inspection with the read-only deployment coverage above. No upload, extraction, save, delete or permission change was used to reach a state.

| Area / route                       | Current surface and workflow                                                                                             | Proposed presentation                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home `/`                           | Exceptions, Billing totals, upcoming cash and supplier overdue; no portfolio table                                       | Three modules: attention, active Project health, upcoming scheduled cash; remove nested metric boxes and duplicate Reports links                                                |
| Projects `/projects`               | Filter grid, creation disclosure, inline general editing, funding summary, bulk deletion, pagination                     | Search + status + Client; identity/Client, manager, status, funding and completion columns; advanced filters; one New Project action                                            |
| Project `/projects/[projectId]`    | Header/editor, targets/actuals, funding, expandable freight/plan/VAT/cash, orders, freight expense form, Buildings/Rooms | Project workspace described in E; no permanent page-wide edit form                                                                                                              |
| Clients `/clients`                 | Create disclosure, filters, inline and full editor, table and bulk actions                                               | Secondary destination; compact party table, contacts as supporting text; create/edit in one drawer pattern                                                                      |
| Client `/clients/[clientId]`       | Details editor, Projects, Billing-based collection summary, recent Billing, audit                                        | Overview with contact block and Projects; Billing activity below; full audit collapsed; receipts remain in Billing                                                              |
| Suppliers `/suppliers`             | Party defaults, filters, inline and full editor, bulk deletion                                                           | Same party-table layout as Clients; keep supplier-only lead time/payment defaults in drawer                                                                                     |
| Supplier `/suppliers/[supplierId]` | Details editor, linked Orders, payment summaries and audit                                                               | Overview / Supplier Orders / Payments, contextual links to authoritative Order schedules; no standalone cash edits here                                                         |
| Orders `/orders`                   | General, financial, supplier-payment and delivery views; filters; manual creation disclosure; import link                | Retain four task views with quieter navigation; default operational columns; one New Supplier Order split action for manual/import                                              |
| Order `/orders/[orderId]`          | Read mode with financial blocks, reconciliation, timing, schedules, history; full editor replaces content                | Overview / Commercial / Payments / Delivery; import history as collapsed secondary detail; explicit full commercial editor                                                      |
| Supplier intake `/orders/import`   | Project/file → extraction facts and review → explicit save; optional Items and Billing reconciliation                    | Dedicated page with context summary, review sections, visible warning list and final confirmation; Supplier Quote and Supplier Invoice share it                                 |
| Client Billing `/billing`          | Inline intake disclosure, filters, wide document table; row click plus View/Edit links                                   | All / Invoices / Quotes as existing document-type filter presets; one Import Client document action; coherent table views; no row receipt forms                                 |
| Billing `/billing/[billingId]`     | Header/edit mode, general/financial data, allocations, installments, receipts, notes and metadata                        | Overview / Schedule & receipts / Allocations; import metadata collapsed; collection action only in schedule section                                                             |
| Client intake within `/billing`    | PDF extraction proposes Client/Project/type/values; duplicate and matching review                                        | Open focused intake panel on the same route, retain draft on validation, explicit match-versus-new-schedule choice; see H                                                       |
| Supplier Payments `/payments`      | Supplier-only installment list; extensive filters; inline due/label/amount; bulk deletion                                | Due/Overdue/Upcoming/Paid filter shortcuts, Supplier/Project, due date, outstanding TTC and derived status; details link to Order payments; amount changes in controlled editor |
| Calendar `/calendar`               | Month grid, next/previous month, capped events and three agenda summaries                                                | Compact month header; “+N events” opens day agenda; simplify event cards to type, reference and amount; retain exact source dates and links                                     |
| Reports `/reports`                 | Five URL-based views; preserved filters; company overview and wide portfolio table                                       | Common report shell; Portfolio / Cash / VAT / Freight, with Forecast and Transactions inside Cash; existing URL compatibility retained                                          |
| Settings `/settings`               | Company, Beta, Locations, reporting policy and three separated extraction blocks                                         | Company first, Optional modules, Locations, one collapsed Extraction diagnostics section; reporting currency remains read-only                                                  |
| Employees `/admin/users`           | ADMIN-only creation, inline roles/active fields, full edit/password panel, bulk deletion                                 | Settings navigation; one Add employee action and contextual Edit/Set password; sensitive edits in explicit modal, safeguards visible                                            |
| Activity `/admin/activity`         | Employee/action/entity/date filters, immutable snapshot table and pagination                                             | Settings navigation; timestamp, actor, action, entity/reference and summary; compact filter panel; never hide deleted-actor attribution                                         |
| Items `/items`                     | Beta-gated general/financial/status/tracking views, many filters and extensive inline editing                            | Secondary global shortcut plus Project-local access; preserve distinct views; scope visible Project/Building, advanced filters for the rest                                     |
| Item `/items/[itemId]`             | Header, small financial summary, edit shell, source/audit footer                                                         | Identity/location hierarchy, separate commercial/logistics statuses, financial details and variance explanation; no Order sum replacement                                       |
| New Item `/items/new`              | Beta-gated full Item form                                                                                                | Focused page using shared sections and save bar; preserve optional planning relationships                                                                                       |
| Budget import `/items/import`      | XLSX parsing, optional mapping, review grid, explicit master-data creation and selected-row persistence                  | Dedicated review workspace with labelled context controls, mapped-column summary, visible row issues and confirmation counts                                                    |
| Rooms inside Project               | Nested Building table with per-Room inline controls and Add Room forms                                                   | Buildings & Rooms section; expand one Building, compact Room list; short metadata edits inline, move creation to drawer                                                         |
| Locations inside Settings          | Always-rendered operational reference list, create form and inline editor                                                | Locations subsection/drawer; preserve current access independently of Beta until an explicit decision says otherwise                                                            |
| Search `/search`                   | Submitted search, validation and grouped entity result links                                                             | One search input; quieter result rows with type as secondary text; distinct start/no-result/error states                                                                        |
| Login `/login`                     | Credentials-only entry                                                                                                   | Same type/control/focus tokens; concise errors, explicit pending state; no new sign-in methods or password-reset flow                                                           |
| Loading/error/not-found            | Shared workspace error, root error/404, list placeholders; specific Billing not-found                                    | Consistent state kit and return actions; preserve disclosure boundaries; do not falsely imply a disabled Beta module never had data                                             |

The visual Project health module must use existing status, completeness and funding signals. Do not invent a health score, predictions, notifications, or “recently opened” persistence.

## D. Menu simplification: 16 concrete changes

1. Move Projects from Directory to primary navigation.
2. Group Clients, Suppliers, Calendar and conditional Items under More.
3. Move Settings to bottom utilities; expose Employees and Activity through its local navigation.
4. Remove the static Workspace breadcrumb, Operational badge and ERP footer copy.
5. Move account identity/sign out out of the top bar; remove the separate top-bar employee icon.
6. Keep only one actual active destination on desktop and mobile.
7. Replace header + separate create disclosure buttons with one contextual creation entry point.
8. Keep import/manual choices together for Orders; avoid a generic global Create menu.
9. Remove Billing row “View”; the reference link and row convenience already open the detail. Move Edit to contextual action.
10. Replace repetitive Directory inline-edit plus Details control clusters with a primary record link and one Edit action.
11. Move rows-per-page to the pagination footer. Preserve page-size choices and server query state.
12. Move advanced filters into one panel and supported sort controls into headers; retain Apply for deliberate multi-filter changes.
13. Replace bordered view buttons with understated underline navigation.
14. Remove repeated headings inside already-labelled expandable sections.
15. Collapse verbose provenance/configuration/history into secondary sections; keep operational warnings visible.
16. Show bulk actions only after visible-page selection; keep deletion wording and affected-record scope explicit.

For rare actions use one overflow menu with an accessible label, not hover-only controls. Avoid submenus for one action. Do not add delete/archive/export options where the current domain does not support them.

## E. Project workspace

One header: **Project name**, then Client · code · reporting currency · operational status. One Edit action plus overflow only for implemented secondary actions. Use a single back link to Projects; the fake workspace breadcrumb disappears. Preserve the originating list query in a safe same-origin return link during future implementation.

Local navigation:

| Tab               | Contents                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Overview          | Target vs actual summary, Funding Coverage with breakdown entry, critical completeness warnings; restrained links to Billing/Orders |
| Supplier Orders   | Project-scoped existing Order views and creation/import context                                                                     |
| Client Billing    | Project-scoped Billing and collection summary; link to authoritative schedule/receipt editors                                       |
| Finance           | Performance, Funding Coverage, Freight, VAT as local sections; select one detailed section at a time                                |
| Cash              | Actual Client receipts and Supplier settlements; expected scheduled balances separately by due date                                 |
| Buildings & Rooms | Project hierarchy, Room detail and creation; keep existing availability independent of Items                                        |
| Items · Beta      | Only if enabled, Project-scoped optional detail                                                                                     |

At medium width this tab strip may scroll horizontally with clear overflow, never wrap into three rows. Keep a visible warning summary on Overview when a hidden financial section is incomplete. Explain missing target versus missing FX separately. Items count/purchase/sell summaries move to Items; they must not appear to be authoritative Project actuals.

Finance order: target and actual-to-date first, then commercial coverage, freight, VAT. Cash has its own tab. Show the current Project currency in the section heading; original-currency detail and manual FX remain available on the contributing record. The legacy Order commercial plan stays explicitly labelled **planned**.

## F. Home

Use three modules rather than eleven small metric boxes nested in panels:

1. **Needs attention:** supplier overdue, Client collection issues from Billing, funding gaps and incomplete reporting. Show concise issue rows linking to their existing destination. If the current query cannot isolate the exact affected rows, say “Review Projects” instead of pretending the link is filtered to gaps.
2. **Projects:** a short list of existing active Project/status/funding signals, with a link to Projects. No duplicated wide portfolio report. Use already-loaded data or an explicitly measured minimal read; no per-row database queries.
3. **Next 30 days:** scheduled cash in, scheduled cash out and expected net, clearly labelled expected/TTC. Link to Cash forecast. Keep overdue amounts distinct from the future window.

Put actual invoiced HT/collected TTC detail in Billing and Reports. A positive Funding Coverage amount must never look like a bank balance. No artificial all-clear if FX is incomplete. Remove the extra Reports link and generic explanatory paragraphs repeated in each module. Recent activity is not needed on the initial Home redesign.

## G. Supplier Orders

**List views:** retain General, Financial, Supplier Payments and Delivery; use the calmer labels Overview, Commercial, Payments and Delivery in the view strip while maintaining existing `view` values.

- Overview: reference + package together, Supplier, Project, operational status, expected delivery; ready date and Buildings available in Delivery/detail. Add no unsupported sort keys.
- Commercial: reference, Project/Supplier context, Purchase Cost HT, Economic Landed Cost HT, Supplier Order Sell HT, planned markup. Put breakdown costs and planned margin in detail. Actual Invoice allocations and allocated profit belong in a clearly named Billing allocation subview/detail, not an ambiguous second “profit” column beside the plan.
- Payments: supplier payable TTC, scheduled TTC, paid TTC, outstanding TTC, next due and **derived payment status**. Keep schedule-versus-payable difference available.
- Delivery: reference, Supplier/Project, operational status, ready and delivery dates, Building scope. Preserve the current query semantics.

**Detail:** Overview is operational identity, Supplier, Project, Buildings and timing. Commercial owns cost lines, pricing method, inherited/overridden Product/Freight/Other markup, direct selling price, VAT and manual FX. Payments owns supplier schedules and settlement history. Place Billing reconciliation beside commercial allocation information. Import history is supporting evidence, never another cost ledger.

**Legacy schedule:** the current Order detail also renders the old `CLIENT_RECEIPT` schedule with “Client Receipts” and “Cash in” labels. This conflicts with the current reporting authority even though the legacy records must survive. Keep its existing access in a clearly labelled **Legacy Order client schedule** disclosure, with a link to authoritative Billing receipts. Do not delete, migrate or disable its existing transactions in a presentation task. Any retirement of legacy write controls needs a separate product decision.

**Editor:** use sections Identity → Purchase costs → Selling method → VAT/FX → Timing → optional Billing attribution. Keep cost and pricing inputs together with the existing Decimal preview. Advanced overrides may collapse, but a non-default override needs a visible indicator; never conceal a retained value. Avoid a narrow drawer for this multi-currency editor. Short timing edits may remain inline.

**Intake:** preserve both Supplier Quote and Supplier Invoice entry into the same Order review. Group observed evidence beside proposed fields, not a repeated wall of facts followed by a second wall of inputs. On updates retain explicit apply-field selection and old/new values. Initialize Billing selection state before dependent reconciliation lookup; preserve the QuoteReview regression test.

## H. Client Billing and intake

**List:** type filters All / Invoices / Quotes keep scope explicit. Default columns: reference + type, Client/Project, due date, Total TTC, received TTC, outstanding TTC and derived collection status. Offer a Commercial view for document date, HT and VAT instead of putting every measure in one row. Document type/cancellation and collection state are separate concepts. Do not invent a server status filter that does not exist.

**Detail:** Overview owns document identity, reviewed totals, currency/FX and VAT. Schedule & receipts owns installments, their actual receipts and settlement history. Allocations shows Order attribution, available HT and the explicit Project-remainder approval. Quotes may match planned installments to confirmed Invoices without duplicating both expectations. No receipt management in list rows; it is already correctly absent there.

**Intake structure for all three paths:** retain three major steps—Context & upload, Review, Confirm—with six understandable milestones inside them: select context → upload → processing → review values → resolve warnings/matches → confirm. Do not force a new six-page wizard or reset controlled review state between sections.

| Path                           | Context and processing                                                                                                  | Review and commit boundary                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier document → Order      | Employee-selected Project required; PDF/JPEG/PNG, 4 MiB; one normal extraction request                                  | Supplier match, cost/VAT/FX proposals, optional payment and Billing allocation review; explicitly selected fields save only on confirmation             |
| Client PDF → Billing           | PDF, 4 MiB; current upload can precede Client/Project selection                                                         | AI proposals remain proposals; employee confirms Client, Project, Quote/Invoice, HT/VAT/TTC, duplicates, match-or-new schedule and optional allocations |
| Budget/supplier detail → Items | Beta-gated; XLSX deterministic parsing, max 500 rows/4 MiB, optional semantic mapping; supplier-document lines optional | Row-level warnings, explicit create/update selection and master-data actions; never auto-delete missing Items or replace Order totals                   |

The six milestones must reflect the current path: do not force a pre-upload Client selection or let AI change a Supplier import's employee-selected Project. During processing show status text, filename and limits; no fabricated progress percentage. After extraction, keep a persistent issue count with links to fields, distinguish blocking validation from review warnings, and retain all edited values after errors. Explicitly created Supplier/Building/Room master data may have its own persistence boundary; distinguish that action from the final Order/Item save.

On narrow screens evidence becomes a disclosure next to its field. Never hide unresolved issues in a closed tab. Source files and raw AI payloads remain request-scoped, provider secrets remain server-only, no automatic retry that triggers another billable call, and no browser storage of documents/extraction payloads. No uploads or live AI calls are part of this review.

## I. Reports

Use **Portfolio / Cash / VAT / Freight** as the top-level report categories. Cash contains **Forecast** (`view=cash-flow`, retaining its existing monthly expected-versus-actual comparison) and **Transactions** (`view=payments`, actual receipts/settlements). Preserve `view=projects`, `vat`, `freight` and all old deep links; label changes need not change URLs.

Portfolio contains operational scope, Supplier Order planned profitability, Funding Coverage and links to each Project's actual performance. Use local view presets to reduce columns, not a sixth copy of the same KPI wall. A separate actual portfolio Profitability report would be additional product work: current portfolio financial measures are primarily Order planned values and must not simply be relabelled actual.

One scope header: reporting currency, Project/Client/Supplier/status filters, applicable dates and completeness. Preserve validated URL state across tabs, horizon changes, reload, back/forward and pagination. Show only applicable filters; keep retained inactive parameters from falsely implying they affect the current result. “Reset all” clears the current scope deliberately. Active chips name what is filtered and have accessible remove labels.

Keep date meanings explicit: Actual cash uses settlement/receipt date; Expected cash uses due date and horizon. VAT is active Invoice output less deductible Order/freight input VAT; not statutory filing. Freight shows planning allowance, actual economic cost, recovery target and headroom. Funding Coverage is HT commercial coverage. Do not apply one generic time filter to reports that lack that meaning.

Report tables may remain wide where comparison requires it; use local scrolling, fixed identity and aligned values. Company EUR-only comparability and excluded Projects stay visible beside totals. Export only where current authenticated export endpoints exist; do not promise a new global Reports export.

## J. Shared table, filters and status system

| Property      | Specification                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Density       | 44 px minimum standard row; 56 px for two-line identity; 36 px dense report row. Do not force wrapped content into a fixed clipped height                 |
| Type          | 13–14 px body, 12 px medium-weight header; tabular numerals; 12 px secondary metadata                                                                     |
| Lines         | One subtle horizontal row separator; no vertical grid lines or striped/pill-filled rows                                                                   |
| Header        | 36–40 px, neutral surface; sticky within a single deliberate scroll region; test overflow ancestors before claiming stickiness                            |
| Alignment     | Text left; money/rates/quantities right; currency beside amount or unambiguously in header; never truncate monetary values                                |
| Identity      | Real reference/name link is the semantic primary action; optional row click ignores links, inputs, selection and menus; preserve open-in-new-tab          |
| Keyboard      | No tab stop on every inert cell. Reference links and controls are focusable; avoid duplicate row + link stops; no spreadsheet keyboard model without need |
| Sorting       | Only server-supported columns; preserve stable tie-breaks, URL sort and direction; announce sort state; retain a compact sort control for non-column keys |
| Selection     | Visible-page scope, indeterminate select-all, count plus Clear; never silently carry selection into another filter/page                                   |
| Bulk actions  | Appear after selection; confirm exact scope and related data loss; no new bulk financial edits                                                            |
| Pagination    | Footer range, total, page-size and previous/next; selection note when relevant; no infinite scroll                                                        |
| Empty results | Filter-aware empty message and Clear filters; true first-use state may offer an authorized creation action                                                |
| Mobile        | Container horizontal scroll with accessible name; retain financial columns via views, not silently hidden facts                                           |

Do not force every table into a schema-driven client DataTable. Share layout/toolbar/empty/footer primitives; domain-owned columns, rows and edit validation remain separate. Master data, Orders, Billing, Payments, report tables, audit, Items and Room/Location sublists use the same visual contract but different interactions.

**Status grammar:** restrained text with a dot or a small rectangular tint when needed. Neutral = draft/planning/inactive; information = in progress; green = completed/settled; amber = due/review/incomplete; red = destructive action, blocking validation or genuinely overdue. Cancelled/archived generally muted, not an emergency. Always include text.

Keep existing enums and precedence. Order operational `DEPOSIT_PAID`, `PAID` and similar historical statuses do **not** prove recorded settlement; label the adjacent derived balance **Payment status**. Supplier derived states remain Upcoming, Due, Overdue, Partially paid, Paid, Cancelled; a partially settled past-due installment can be Overdue under current rules. Billing type and cancellation stay distinct from receipt status. Item commercial and logistics statuses remain separate. Funding status and incomplete FX must never use a cash/paid badge.

## K. Form and inline-edit system

36 px inputs; 14 px labels; required marker plus accessible `required`; helper/error text connected through IDs and `aria-describedby`. Current shared `Field` wraps a label but has no consistent help/error IDs; fix that in the later primitive pass. No placeholder-only labels, particularly Budget import context selectors. Numeric controls use the existing parsers/formatters, explicit currency/percent suffixes and suitable decimal input mode; manual FX keeps its full precision.

Forms: 32 px between sections, 16 px between fields, max 720–880 px for ordinary editors. Complex Order/Intake editors may use a wider evidence/preview layout. At most two normal field columns; short adjacent amount/currency controls are allowed. Group optional addresses, notes and technical metadata; expand invalid sections automatically and focus the first invalid input. Do not hide overrides merely because they are advanced.

One save/cancel area per editor. A sticky footer is useful for long forms if it does not cover fields; show pending state without clearing the draft. Preserve server errors and complete input values. On successful save, return to the record and restore focus. Cancellation with changes should request discard; failed submissions must not erase values. This is in-memory draft continuity, not a promise of cross-session saved drafts. Do not introduce browser persistence of sensitive form content.

| Current editing area                                   | Classification                                   | Reason                                                                              |
| ------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Project list name/code/manager/status                  | MOVE TO DRAWER                                   | One coherent general edit; targets and markups remain full detail                   |
| Project targets, reporting currency, default markups   | MOVE TO DETAIL / keep full editor                | Financial consequences, inheritance and FX require explicit review                  |
| Client/Supplier row metadata and defaults              | MOVE TO DRAWER                                   | Removes duplicate inline/full edit paths; share party field layout                  |
| Building creation/edit, Room creation                  | MOVE TO DRAWER                                   | Short contextual form with Project/Building scope retained                          |
| Room name/code                                         | KEEP INLINE                                      | Low-risk small edits; explicit Save/Cancel and retained validation                  |
| Room/Location active state                             | MOVE TO DRAWER                                   | Keep state and consequences visible with related metadata                           |
| Order package label and ready/delivery dates           | KEEP INLINE in relevant operational view         | Frequent operational updates; no financial inputs in these cells                    |
| Order pricing, cost, VAT, FX and Billing attribution   | MOVE TO DETAIL / keep full editor                | Interdependent authoritative values                                                 |
| Supplier installment amount/basis/due date             | MOVE TO DRAWER                                   | Show scheduled, settled and remaining values together; retain server restrictions   |
| Supplier settlement and Client receipt entry/edit      | MOVE TO DRAWER                                   | Explicit dated transaction with currency/FX; existing owning detail remains context |
| Billing totals/type/VAT/allocations                    | MOVE TO DETAIL / keep full editor                | Must maintain schedule matching and allocation constraints                          |
| Item reference/name, simple status and tracking fields | KEEP INLINE selectively                          | Preserve separate operational views; identity/relationship changes belong in drawer |
| Item financial basis/quantity/cost/VAT/budget variance | MOVE TO DETAIL                                   | Current financial row contains interdependent budget/cost/VAT inputs                |
| Employee role/active/password changes                  | MOVE TO MODAL                                    | Explicit intent and current-account/final-ADMIN safeguards                          |
| Location creation/general edit                         | MOVE TO DRAWER                                   | Short administration task; no warehouse-management implication                      |
| Freight expense VAT and cost entry                     | MOVE TO DRAWER                                   | Current VAT form has 36 rem minimum width; clearer in a bounded editor              |
| Derived money, margin, paid status, FX completeness    | REMOVE editing affordances if any are introduced | Display-only; no recommendation to remove existing source data                      |

Use existing Radix Sheet/AlertDialog foundations for drawer/modal focus and dismissal. Confirm removals with entity name, irreversibility and affected records. Reuse the current deletion scopes rather than inventing softer “remove” behavior. Adopting a confirmation for freight expenses is an interaction change to approve in implementation, not a new deletion rule. No auto-save financial fields.

## L. Visual design system

The current palette is already restrained. Refine semantic tokens rather than scatter new colors. This is a light-theme proposal; existing dark tokens should not be broken, but a new theme-switch feature is outside scope.

| Token group     | Proposal                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Font            | Keep Geist sans; tabular numerals for money; Geist Mono only for references/technical IDs, not all financial values                                    |
| Scale           | Page title 26/32 px, weight 600; section 16/24, 600; body 14/21; table 13/20; helper 12/18; headline number 24/30. Avoid 10–11 px operational labels   |
| Spacing         | 4, 8, 12, 16, 24, 32, 40 px; page gutters 32 desktop / 24 laptop / 16 narrow                                                                           |
| Radius          | 6 px controls; 8 px panels/dialogs; round avatar only; no giant rounded cards                                                                          |
| Canvas/surfaces | Canvas and main content white; sidebar `#F7F8FA`; subtle header/hover `#F3F4F6`; popovers white                                                        |
| Text            | Main `#20242C`; secondary `#5B6472`; use secondary sparingly for labels, never financial values                                                        |
| Accent          | Muted blue `#315B85`; active fill `#EAF0F7`; one accent for primary action, selection and focused context                                              |
| Borders         | Subtle structure `#E5E7EB`; stronger input boundaries `#838D9C`; do not rely on faint structural borders to identify controls                          |
| Semantics       | Success `#24634A` on `#EAF4EF`; warning `#805500` on `#FFF4D9`; danger `#A63232` on `#FBECEC`; information `#315B85` on `#EAF0F7`                      |
| Shadow          | None on normal sections/tables; modest shadow only for floating menu/dialog/sidebar overlay                                                            |
| Buttons         | 36 px primary/secondary, 32 px compact; primary filled accent, secondary neutral/outline, tertiary quiet text; one primary action per context          |
| Status          | Text/dot or low-emphasis rectangular tint; badges for exceptions and type only where scanning benefits                                                 |
| Icons           | Existing Lucide only, 16 px actions / 18 px navigation, consistent stroke; decorative icons hidden from assistive technology                           |
| Focus           | Visible 2 px accent outline with 2 px offset; never remove without replacement; minimum 24 px pointer targets, prefer 32–36 px desktop and 44 px touch |
| Motion          | Short color/opacity transitions only; honor reduced motion; no animated rearrangement of financial data                                                |

Display remains `9 999.99 EUR`, percentages at most two displayed decimals, `DD/MM/YYYY` dates. Keep higher precision where manual FX or Item quantity needs it. Dot/comma input remains supported by existing parsers. Exports retain canonical Decimal strings and ISO dates. Truncated descriptive text needs an accessible full-text path; financial meaning cannot depend on hover tooltips. Verify actual contrast and zoom behavior during implementation rather than assuming a palette guarantees accessibility.

## M. Shared component plan

| Build from existing source                                      | Shared responsibility                                                          | Keep domain-owned                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `app-shell/*`, `config/navigation.ts`                           | AppShell, navigation item/disclosure, responsive rail, bottom utilities        | Role/module filtering and existing destinations                               |
| `layout/detail-page-header.tsx` plus repeated list headers      | PageHeader / DetailHeader with title, metadata, actions and optional back link | Entity metadata and business status mapping                                   |
| `listing/table-styles.ts`, `pagination.tsx`, `filter-field.tsx` | TableFrame, FilterBar, FilterPanel, pagination footer                          | Queries, column definitions, row state and validation                         |
| Repeated financial cards and definition lists                   | Section, MetricRow, CompletenessNotice                                         | Decimal calculations, authority labels, planned/actual scopes                 |
| `master-data/form-ui.tsx`                                       | FormSection, accessible Field, numeric controls and ActionFeedback             | Submission schemas and default/override interpretation                        |
| `inline-editing/*`                                              | Small InlineField action pattern and editor lifecycle                          | Domain-specific permitted fields and draft values                             |
| `bulk-actions/bulk-selection.tsx`, `ui/alert-dialog.tsx`        | ConfirmDialog and selected-row toolbar                                         | Transaction scopes, permissions and deletion safeguards                       |
| `ui/sheet.tsx`                                                  | EditorDrawer with title, error summary and save footer                         | Long commercial editors stay full-page                                        |
| `intake/intake-stage.tsx`                                       | IntakeProgress, ReviewIssueList and evidence/field layout                      | Three independent review schemas, matching rules and persistence boundaries   |
| Existing loading/not-found/error fragments                      | EmptyState, TableSkeleton, InlineError, AccessNotice                           | Safe authorization redirects and retry semantics                              |
| Shared labels and repeated Badge variants                       | StatusIndicator presentation API                                               | Distinct operational, settlement, Billing, Item and completeness vocabularies |

Share presentation, not a universal financial summary object. Do not build a large framework, introduce another icon library, or move whole server pages into client components to reuse a header.

## N. Duplication decisions

| Repetition                                                             | Decision               | Exact treatment                                                                        |
| ---------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Desktop/mobile navigation rendering                                    | STANDARDIZE            | One active-state policy and role-filtered data; retain responsive wrappers             |
| List header eyebrow/title/paragraph clusters                           | MERGE                  | Shared PageHeader; remove generic “Directory/Operations” eyebrows where title suffices |
| Detail header box and outer edit overlay                               | MERGE                  | Actions occupy the header slot, avoiding absolute overlay collisions                   |
| Dashboard Reports links                                                | REMOVE                 | One contextual analysis entry point                                                    |
| Dashboard vs full Reports KPI groups                                   | KEEP SEPARATE / reduce | Home action signals; Reports comparison. Remove repeated Home revenue analysis         |
| Project actuals vs Order plan                                          | KEEP SEPARATE          | Different financial authorities; never one ambiguous “revenue/profit” card             |
| Project collection vs Billing document collection                      | STANDARDIZE            | Same presentation labels; Project aggregate links to document management               |
| Freight summary/title repeated inside disclosure                       | REMOVE                 | One section title; preserve planning versus actual/recovery breakdown                  |
| Billing row reference/row click/View/Edit                              | REMOVE / contextualize | Keep semantic reference; optional row convenience; contextual Edit                     |
| Client/Supplier forms and table styling                                | MERGE presentation     | Share identity/contact field groups, keep supplier defaults and separate services      |
| Filter grids/sort/page-size controls                                   | STANDARDIZE            | FilterBar + advanced panel + footer size; retain route-specific validation             |
| Badge variants and bespoke amber warnings                              | STANDARDIZE            | Semantic tokens with vocabulary-specific mapping                                       |
| Billing browser confirms vs bulk dialogs vs immediate freight deletion | STANDARDIZE            | Existing accessible confirmation foundation, exact current scope                       |
| Settings extraction blocks                                             | MERGE                  | Single read-only diagnostic section with Supplier/Client/Items rows                    |
| Supplier and Client schedules                                          | KEEP SEPARATE          | Supplier settlements and Billing receipts have different ownership and FX              |
| Supplier, Client and Item intake                                       | STANDARDIZE shell only | Independent review data and commit boundaries remain separate                          |

## O. Risks, states and decisions requiring explicit scope

### Non-negotiable financial meaning

- Never relabel Supplier Order planned sell as invoiced revenue. Project actual performance uses active Invoice HT and authoritative economic cost, including Project freight once.
- Never call commercial Funding Coverage “cash available.” Its eligible Invoice allocations and explicitly approved remainder exclude Quotes; receipts and Supplier Payments do not change it. Allocations to cancelled Orders do not automatically become available remainder.
- Never merge Purchase Cost HT with Economic Landed Cost. Non-deductible input VAT affects economic cost. Keep markup and margin distinct and compute aggregate ratios from aggregate money.
- Freight estimate is expected Product Purchase Cost HT × Project estimate rate. Actual freight economic cost, recovery target and cash are distinct; recovery target is not proof of billed or collected freight.
- Manual FX and source currencies remain visible when needed; incomplete values are never replaced by zero. Company totals remain comparable EUR Projects only.
- Output VAT, input VAT, deductible input VAT and net payable/credit remain separately inspectable. No accounting/legal interpretation added by styling.

### Standard states

| State                        | Proposed behavior                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| First use                    | Clear noun-specific empty message and authorized Create/Import action; read-only users get guidance without a dead button                           |
| No filter matches            | Preserve search/filter context and offer Clear filters; do not say “No Orders yet”                                                                  |
| Loading                      | Page-shaped skeleton with `aria-busy`; keep shell and applied filter context stable; no fake monetary zeros                                         |
| Extraction processing        | Actual status text and disabled repeat submission; no made-up completion percentage; do not imply cancellation aborts the provider unless supported |
| Validation                   | Field error + linked summary, expand hidden invalid sections and retain full draft                                                                  |
| Server error                 | Calm retry/return action without raw errors; do not assert “nothing changed” if a post-mutation refresh failed                                      |
| Permission denied            | Preserve server authorization and existing safe redirect; improving redirect feedback requires deliberate auth-UX review, not a new permission      |
| Inactive/archived            | Muted status and concise context; keep permitted historical data and existing editing rules                                                         |
| Incomplete FX/reporting      | Visible amber notice beside affected totals, specific missing input and record link; distinguish missing plan from conversion failure               |
| Destructive action           | Scoped confirmation with entity count/name, related records and irreversible result; server remains authoritative                                   |
| Missing record/Beta disabled | Safe not-found/return behavior; optional disabled-module explanation only when it does not leak protected record existence                          |

### Product decisions, not cosmetic fixes

1. **Receipt eligibility:** durable invariants document that receipt services do not enforce Invoice-only/non-cancelled eligibility, and current queries differ in filtering. Do not silently remove Quote receipts, change balances, or add an Invoice-only action gate as part of the skin. Decide separately with financial tests.
2. **Actual portfolio profitability:** existing company/portfolio financial views use Order plan values. A new actual revenue/profitability report requires explicit reporting work; this proposal preserves labels and current outputs.
3. **Dirty navigation/discard:** confirmation on dismiss/navigation is recommended, but needs a scoped UX implementation and tests, especially when switching Project sections or intake steps.
4. **Freight delete confirmation:** recommended interaction improvement; no change to what deletion does. Verify exact server safeguards before implementation.
5. **Rooms/Locations and Beta:** current Project Room controls and Settings Locations are not hidden by the Items gate. Preserve access; do not infer a new module restriction from their proximity to Items.
6. **Calendar overflow:** reveal already-loaded events; do not invent editable calendar events, a synchronized calendar table or new scheduling rules.
7. **Global search expansion / user-configured columns / saved views:** not included. Existing search, URL filters and fixed task views suffice for V2 presentation.

### Rendering and verification risks

Keep Server Components and existing parallel server reads. Client boundaries should cover only navigation state, filters, editors and the existing row interactions. Server-rendered content can remain children of a small client shell; do not serialize Prisma or duplicate financial calculations for tabs. Do not fetch every tab separately and then also fetch the whole Project again. Profile before changing query partitioning. Phase 12's granular streaming and bundle optimization remain deferred until measurements justify them.

Test desktop 1440 and 1280, laptop 1024, narrow 768 and 390, plus 200% zoom. Tables may scroll but the whole page should not. Test keyboard navigation, visible focus, row links, sort announcement, dialog focus return, Escape, invalid-field focus and reduced motion. No sticky header/footer should obscure focused inputs. Large Items/import tables stay bounded and paginated/review-limited, not loaded into a new all-client grid.

## P–Q. Implementation sequence, effort and risk

Effort is relative to this repository: LOW = small contained surface, MEDIUM = several shared consumers, HIGH = a large interdependent editor/workspace. These are not calendar estimates. Risk refers to regression risk, even when underlying services remain unchanged.

| Stage | Deliverable                                                      | Effort | Risk   | Acceptance evidence                                                                                                           |
| ----- | ---------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1     | Shell, tokens, correct active navigation, bottom utilities       | MEDIUM | MEDIUM | One active link on all routes; ADMIN/MANAGER/USER and Beta visibility; keyboard and width checks                              |
| 2     | Headers, sections, table frame, filters/footer, states and focus | HIGH   | MEDIUM | Representative list/detail at laptop widths; URL/filter/sort/page behavior unchanged                                          |
| 3     | Shared form feedback, drawer/modal and confirmation patterns     | MEDIUM | HIGH   | Draft retention, cancel/discard, pending, field errors, focus return; destructive scopes unchanged                            |
| 4     | Clients/Suppliers directory and detail surfaces                  | MEDIUM | MEDIUM | Create/edit/archive/delete flow coverage; defaults and audit preserved                                                        |
| 5     | Project workspace and scoped links                               | HIGH   | HIGH   | Target/actual/funding/freight/VAT/cash parity; warning visibility; Buildings/Rooms/Beta access                                |
| 6     | Supplier Orders views, detail and commercial editor              | HIGH   | HIGH   | Pricing modes/inheritance, cost lines, FX/VAT, payment schedules, legacy compatibility                                        |
| 7     | Client Billing views, detail, schedules/receipts/allocations     | HIGH   | HIGH   | Amount/FX parity, matched Quote installment deduplication, allocations, draft retention; no eligibility changes               |
| 8     | Supplier Payments and Calendar                                   | MEDIUM | HIGH   | Derived status, partial settlements, visible-page selection; all calendar overflow accessible                                 |
| 9     | Reports shell, preserved filters, contextual column groups       | MEDIUM | HIGH   | Every view/URL/date scope and incomplete/EUR exclusion state; planned vs actual labels                                        |
| 10    | Home composition and action links                                | MEDIUM | MEDIUM | Same source totals/scopes, no fake filtered destination or invented health score                                              |
| 11    | Settings, Employees, Activity, Locations                         | MEDIUM | HIGH   | Role matrix, final ADMIN/self deletion guards, attribution and existing module access                                         |
| 12    | Optional Items views, editor and Room polish                     | MEDIUM | HIGH   | Module isolation, relationship constraints, quantity/variance precision, status separation                                    |
| 13    | Supplier/Client/Items intake presentation                        | HIGH   | HIGH   | Fixture-based review journeys; warnings/drafts/matching; QuoteReview initialization regression; no automatic persistence      |
| 14    | Full consistency, accessibility and performance pass             | MEDIUM | MEDIUM | Representative end-to-end read/write tests only in approved isolated environment, width/keyboard review, measured regressions |

Deliver in small reviewable stages, with a before/after capture and explicit behavior-parity checklist per stage. Reuse current financial, action-module and structure tests; update structure assertions for approved layouts, never delete them simply to pass. Targeted tests during implementation; one full gate pass at completion of each agreed task. No live AI calls or production write tests. Any future schema requirement is a separate proposal; none is needed for this plan.

## R. No-change guarantees and this review's verification

Application routes, production UI source, domain calculations, Prisma schema, migrations, package manifests/lockfile and environment files remain untouched by this review. No database command, upload, extraction request, seed, migration, settlement, receipt, administration mutation, commit, merge or push is performed. The only artifacts are under `v2-ui-review/`.

Preserve Decimal precision and parsers, monetary/date/export conventions, current financial authorities, manual FX and incompleteness, permission checks, active-user resolution, audit snapshots, deletion safeguards, legacy Order pricing/client schedules, reviewed intake, draft retention, and Items isolation. `"use server"` modules continue to export async Server Actions only. No new dependencies or universal client grid are proposed.

This review does not rerun database validation or claim a new production build baseline. Artifact formatting/link checks and local mockup checks are appropriate; application gates belong to implementation. **No schema change. No migration. Do not run `npm run db:deploy`.**

### Artifact verification

- Repository formatting check: passed.
- Embedded prototype JavaScript syntax and local artifact links: checked. All icons are embedded from the installed Lucide package; no external assets are required.
- Local browser: checked Orders/Project layouts at 1280 px, the Project layout and navigation at 390 px, search/no-results recovery, Project filtering, visible-row selection/clear, Commercial view, Project sections, Settings dialog and active navigation. No prototype console errors or warnings were observed.
- Existing Billing layout: measured at 1280 px; table overflow stayed in its scroll container.
- Production save/delete/intake processing, alternative employee roles, enabled Items and financial calculations were not exercised. These remain source-reviewed and require controlled implementation validation.
- No application tests/build or database commands were rerun for these review-only artifacts. Both tracked and staged diffs are empty.

### Evidence index

Source paths are relative to the repository root at the recorded commit; no production data or screenshots are embedded in the artifacts.

| Evidence                       | Source                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative constraints      | `docs/development-invariants.md`, `AGENTS.md`                                                                                                                                                                          |
| Navigation/chrome/focus        | `src/config/navigation.ts`; `src/components/app-shell/{app-shell,sidebar-navigation,mobile-navigation,top-bar,account-control}.tsx`; `src/app/globals.css`                                                             |
| Header/filter/table primitives | `src/components/layout/detail-page-header.tsx`; `src/components/listing/{filter-field,pagination}.tsx`, `table-styles.ts`                                                                                              |
| Dashboard/Reports composition  | `src/app/(app)/page.tsx`; `src/app/(app)/reports/page.tsx`; `src/components/reporting/{portfolio-report,global-report-tables,cash-flow-panel,overdue-items}.tsx`                                                       |
| Project composition/hierarchy  | `src/app/(app)/projects/[projectId]/{page,project-detail}.tsx`; `src/components/reporting/project-financial-dashboard.tsx`                                                                                             |
| Directory lists/details        | `src/app/(app)/{projects,clients,suppliers}/page.tsx`; their `*-management.tsx` components and detail `page.tsx` files                                                                                                 |
| Orders                         | `src/app/(app)/orders/{page,import/page,[orderId]/page}.tsx`; `src/components/procurement/{order-table,order-form,order-detail-shell}.tsx`                                                                             |
| Billing                        | `src/app/(app)/billing/{page,[billingId]/page}.tsx`; `src/components/billing/{billing-table,billing-detail,billing-schedule-manager,billing-installment-editor,billing-receipt-editor}.tsx`                            |
| Payments/Calendar              | `src/app/(app)/{payments,calendar}/page.tsx`; `src/components/payments/{payment-installment-table,payment-schedule,payment-forms}.tsx`                                                                                 |
| Intake                         | `src/components/quote-intake/quote-intake.tsx`; `src/components/billing/client-document-intake.tsx`; `src/components/items/budget-import.tsx`; `src/components/intake/intake-stage.tsx`                                |
| Items/Rooms/Locations          | `src/app/(app)/items/{page,new/page,import/page,[itemId]/page}.tsx`; `src/components/items/{item-table,item-form,location-list,location-form}.tsx`; Project detail                                                     |
| Settings/admin                 | `src/app/(app)/settings/page.tsx`; `src/app/(app)/admin/{users/page,users/user-management,activity/page}.tsx`                                                                                                          |
| Drafts/confirmations           | `src/components/inline-editing/{detail-edit-shell,inline-edit}.tsx`; `src/components/master-data/form-ui.tsx`; `src/components/bulk-actions/bulk-selection.tsx`; `src/components/freight/project-freight-expenses.tsx` |
| Status/authorization           | `prisma/schema.prisma`; `src/domain/payments/calculations.ts`; `src/domain/presentation/labels.ts`; `src/lib/auth/current-user.ts`                                                                                     |
| Search and boundary states     | `src/app/(app)/search/page.tsx`; `src/app/login/page.tsx`; `src/app/{not-found,global-error}.tsx`; workspace/list `loading.tsx`, `error.tsx`, Billing not-found                                                        |

### Additional findings verified in the deployment

- At a 1280 px viewport the Billing table measured 1248 px inside approximately 974 px of available width. Horizontal overflow stayed inside the table, but received/outstanding/status/actions required scrolling. Source review also confirms that the existing mobile navigation and search access need deliberate preservation in the new shell.
- Client and Supplier detail pages open with a full edit form already visible to ADMIN/MANAGER. Default read mode plus one contextual Edit drawer is a significant simplification, not merely a visual restyle.
- Billing currently shows the footer message “Selection applies to this page only” despite having no row selection controls. Remove that message only on tables without selection; preserve it for real bulk workflows.
- Legacy Order Client schedules still use actual-cash language on the detail page. Keep historical access but clarify their non-authoritative role, as described in G.
- Items was disabled in the inspected deployment; `/items` produced the existing not-found page. No setting was changed to inspect the enabled module.

The local specimen uses system fonts so it works offline; production should retain Geist. It embeds the installed Lucide icons, requires no packages or external assets, and can be opened directly as `index.html`. Its financial numbers are fixed fictional examples, never application calculations. The review covers source/interaction/layout evidence; it is not a full accessibility certification or a financial acceptance test.

The next prompt can select a stage directly. The recommended first implementation is **Stage 1: shell, tokens, active navigation and bottom utilities**, with the existing routes and domain behavior held constant.
