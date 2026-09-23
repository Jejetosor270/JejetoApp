---
name: mb-ui-review
description: Review or implement requested MB ERP UI consistency changes across Projects, Purchasing and Billing, including tables, drawers, Details/Related, click-to-edit and financial formatting.
---

# MB UI review

Read repository invariants and the [shared safety contract](../mb-erp-development/SKILL.md). Start with requested screens and changed files; no full-app crawl unless requested.

Use [GitHub](../mb-erp-development/references/github.md) for remote diff context; [Vercel](../mb-erp-development/references/vercel.md) when preview/production revision matters. Record reviewed SHA/environment. Prefer available preview/browser access; screenshots plus focused code review are valid fallback evidence. Do not depend on localhost or install browser tooling to proceed. Distinguish visual from code-only findings.

Compare against Purchasing and shared components:

- Exactly Details / Related on Project, Order and Billing; consistent headers, financial label/value groups, related tables, empty states and navigation.
- Compact tables, responsive wrapping, accessible links/focus, sorting/filter scope, pagination and visible-page selection.
- Shared drawers/date inputs and click-to-edit semantics; tab switching and failed/stale saves retain drafts. Hidden controls never replace server authorization.
- Shared money/currency, percentage, FX, quantity and date formatting; keep financial bases distinct and derived fields linked to their authoritative editor. Avoid repeated metrics, competing statuses and duplicate destinations.

For UI failures, inspect scoped [Sentry](../mb-erp-development/references/sentry.md)/Vercel errors before speculative fixes. Review-only requests return findings with screen/component evidence and suggestions; implement only when requested. Test changed behavior and final gates once. Never submit real payments or modify production records for smoke tests; no secrets/raw commercial content in reports.
