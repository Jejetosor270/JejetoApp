# V2 UI implementation

Implemented locally on `V2.0`, based on commit `82b499b9e831e5e6e767ba3de0aa0f9562cce2e9`. This records the implementation of the approved review in `README.md`; it does not replace the development invariants.

## Delivered

- A quieter white canvas, shared color and spacing tokens, compact typography, visible focus, and restrained badges. The desktop sidebar has six primary destinations, secondary navigation, bottom account/settings controls, and a remembered collapse preference. Mobile navigation and search remain available.
- Consistent page/detail headers, contextual creation, URL filters and view shortcuts, active-filter removal, sortable supported columns, pagination with page size, filter-aware empty states, and visible-page bulk selection. Main operational tables use bounded scrolling and sticky headers. Returning from a record preserves the previous list scope in session memory.
- Shared editing drawers, discard confirmation, unsaved-change guards, accessible field errors, and persistent validation drafts. Complex Order and Billing editing retains the existing controlled workflows. Business drafts are not stored in browser storage.
- Compact Clients/Suppliers lists with a single Edit drawer; read-first contact details; Supplier Overview/Orders/Payments tabs; collapsed directory activity. Client collection summaries explicitly identify their existing latest-100-document scope.
- Project Overview, Finance, Cash, Orders, Billing, optional Items, and Buildings/Rooms workspaces. Target/actual, Funding Coverage, VAT, freight, and cash retain their distinct meanings. Scoped Billing and Item lists remain accessible through links.
- Supplier Order Overview/Commercial/Payments/Delivery views, focused financial columns, contextual manual/import creation, and a tabbed detail workspace. Legacy Order client schedules retain access under an explicit historical-planning label.
- Billing Collection and Commercial lists, separate document and collection context, Overview/Schedule & receipts/Allocations tabs, and focused installment/receipt editors. Existing receipt eligibility is unchanged.
- Supplier Payment shortcuts and focused schedule edits; Calendar overflow agendas; simpler Home attention/Projects/upcoming-cash modules; Portfolio/Cash/VAT/Freight reporting with Commercial/Funding/Cash portfolio columns and retained URL scope.
- Settings sections and administration navigation, focused employee editors, location creation, Item financial drawers, and preserved Beta gating. Supplier and Client document review place evidence beside reviewed fields; all three intake paths retain staged progress, warnings, explicit confirmation, and temporary-file behavior.

## Verification

| Check                    | Result                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| Formatting               | Passed                                                             |
| Prisma schema validation | Passed; no database connection or migration                        |
| TypeScript               | Passed                                                             |
| ESLint                   | Passed with zero warnings                                          |
| Tests                    | 105 files, 528 tests passed                                        |
| Domain coverage          | Statements 87.01%; branches 77.26%; functions 92.96%; lines 90.06% |
| Production build         | Passed with the normal Next.js 16.3.2 Turbopack build              |

The test configuration now includes `.test.tsx` so the new component tests run in the normal suite. New checks cover navigation, tab draft retention, accessible validation, filters, sorting, and empty states. Existing structural assertions were updated for the approved layout and labels. Financial, authorization, intake, and Server Action invariant tests remain in the suite.

Browser verification used actual UI components with fictional fixtures and mocked services, without a database or AI calls. Checks covered desktop and narrow layouts, sidebar persistence, mobile navigation, tab URLs and Back navigation, validation retention, receipt draft keep/discard/reset, report view switching, Settings organization, and browser errors. Widths included 1920, 1280, and 390 pixels. Live save/extraction integration against production was not exercised.

## Boundaries and repository state

No changes to `src/domain`, `src/lib`, Server Actions, Prisma schema/migrations, dependencies, or the lockfile. No financial formulas, FX rules, VAT treatments, permissions, or audit services changed. Existing receipt eligibility differences and the lack of an actual portfolio profitability report remain separate product decisions.

All implementation edits remain uncommitted. The pre-existing `v2-ui-review` proposal remains untracked, with this implementation note added beside it. Build, coverage, and temporary verification artifacts are ignored. Nothing was pushed, merged, deployed, or written to production data.

**`npm run db:deploy` is not required.**
