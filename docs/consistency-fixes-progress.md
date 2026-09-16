# Approved consistency review implementation

Source: review `mb-erp-consistency-2026-09-15-db76993`, user decisions and subsequent payment/date confirmations.

No production data changes, migration application, commits or deployment are authorized by this implementation.

## Checklist

- [ ] A01 Diagnose Project rendering failure; safe diagnostics and regression.
- [x] A02 Supplier-scoped cash filtering.
- [x] A03 Stale full-editor protection, preserving drafts.
- [x] A04 Explicit freight formula labels.
- [x] A05 Strict HT Financials and economic reconciliation.
- [x] A06 Explicit Other/services budget, complete approved totals.
- [x] A07 Distinct coverage terminology.
- [x] A08 Paid settles remaining actual cash; Partially paid opens entry.
- [x] A09 Earliest unpaid term date with document fallback; edit that term only.
- [x] A10 One Billing status control.
- [x] A11 Remove repeated Order sell/markup facts.
- [x] A12 Reference-first record identity.
- [x] A13 Description in forms, details and search.
- [x] A14 Contextual drawers for complex cell edits.
- [x] A15 Shared Related date picker.
- [x] A16 Formatted readonly money and percentage points.
- [x] A17 Shared human-facing document/payment labels.
- [x] A18 Consistent three-category allocations.
- [x] A19 Billing status filtering and deterministic sorts/export.
- [x] A20 Calendar invoicing agenda and remaining/planned distinctions.
- [x] A21 Comparable economic markup bases.
- [x] A22 Meaningful empty states.
- [x] A23 Separate term label and percentage basis.
- [x] A24 Authoritative target-mode Budgeted Sell.

## Verification

- Passed: format check, Prisma validation, strict typecheck, lint, full suite with coverage (845 tests), production webpack build and Git whitespace check.
- Domain coverage: 91.31% lines, 89.06% statements. Integration tests use disposable in-memory PostgreSQL; no production database writes or live AI calls.
- Added regression coverage for Supplier-scoped cash, explicit Other budget and direct Project targets, the HT/economic VAT bridge, full/partial cash settlement and actual FX, effective term dates, stale Order/Billing/allocation edits, Billing filters/sorts, description search, and safe Project diagnostics.
- Local component tests cover drawers, draft retention, primary identity, allocation categories and payment actions. No new live production visual verification is claimed.

## A01 — runtime timeout identified; deployment recheck pending

The connected Vercel account exposed no accessible project, so the original Project-detail production exception could not be traced to a confirmed cause. Added safe read-stage diagnostics (stage, error type, safe code/digest only) and a user-visible support reference. A nullable Related Client input was guarded, but this is not claimed as the production root cause. The Project visual re-review remains pending after obtaining its runtime trace.

The supplied September 16 runtime export subsequently identified Prisma P2028 during `clientBillingDocument.findUnique`: the read's transaction exceeded 5 seconds. Project payment terms were launching one full Billing read per document and one full Order/payment read per Order concurrently. These now use Project-scoped batch reads and the same authoritative serializers/calculators, with safe diagnostics for both payment-term stages. Regression coverage checks batch query counts and equality with single-record results. No transaction timeout, financial rule, database data or schema was changed. Production re-verification after deployment remains required.

## Migration and handoff

Prepared `20260922000000_project_other_budget`: nullable Decimal Other/services planning budget and non-negative constraint. Existing values remain NULL, not silently zero. The application now depends on this column; review pending migrations and run `npm run db:deploy` against the intended environment before deploying this version. No migration was applied, no previous migration was modified, and no production data was rewritten.

A02–A24 are implemented locally. A01 remains explicitly incomplete pending the production trace. No commits, pushes or deployments were made.
