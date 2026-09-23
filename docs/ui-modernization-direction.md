# MB ERP — graphite workspace direction

Presentation-only continuation of UI batches 1–4, based on commit `2c60c7f`.
No financial, permission, route, status, filtering or database contract changes.

## Design workspace

[MB ERP Figma](https://www.figma.com/design/KSOpjdP9Kp79uxPiAEafRF)

- 01 Foundations: primitives, semantic colors, Geist typography, geometry and effects.
- 02 Components: controls, navigation, financial summaries, fields and Related tables.
- 03 Screens: Home and Purchasing explorations; four reserved record/editor frames.

Figma's Starter-plan MCP limit interrupted further editing. Project Financials,
Billing detail, Related and editor examples remain unfinished in Figma. Home's
sample attention table also needs its column text reassigned and active navigation
corrected. These are design-file limitations, not application data changes.

## Shared system

- Graphite navigation distinguishes the persistent workspace from record content.
- Cool neutral canvas, white working surfaces, crisp blue accent; no gradients.
- Geist 24px page titles, 14px section titles, compact labels and tabular money.
- Six/eight-pixel control/surface radii, subtle borders and restrained shadows.
- Semantic status badges retain text and existing state derivation.
- Bounded filter widths, compact table headings and quiet editable-cell affordances.
- Details/Related use the same segmented navigation and consistent record surfaces.
- Drawer headers and sticky actions stay distinct; draft protection remains intact.
- Financial figures keep currencies, HT/TTC labels and incomplete-FX warnings.
- Narrow tables scroll within their own container rather than compressing money.

The source of truth for implementation is `src/app/globals.css` and shared
components under `app-shell`, `layout`, `listing`, `forms` and `ui`. Domain helpers
and Server Actions remain unchanged. No new packages or exported image UI assets.

## Verification handoff

- Latest preview: `https://jejeto-eus81b8cj-jejetosor270s-projects.vercel.app`
  (`dpl_BUycWSk2Dk6wYikNcfDYKNrnXBKH`, READY).
- Formatting, Prisma validation, standalone typecheck, lint and production webpack
  build passed. Final full suite: 883 tests; focused visual-fix regression tests: 24.
- Final Vercel build also passed, using managed environment variables only.
- Public sign-in has no horizontal overflow at 1920, 1280, 1024 or 390 pixels.
- Authenticated review on the preceding preview covered Home, Projects,
  Purchasing, Billing, Details/Related, embedded supplier/client payment terms,
  Settings, and compact/standard/wide drawers at 1920, 1280, 1024 and 390 pixels.
  Navigation, expanded filters, table scroll containment, financial alignment,
  status badges, field wrapping and keyboard focus were checked. No browser
  console warnings/errors were observed during the review.
- Unsaved drafts were retained by Keep editing in compact snooze, standard
  Project and wide Billing editors, then deliberately discarded. Billing Escape
  also opened the discard guard. No business records or payments were saved.
- Three presentation fixes followed: narrow page headers stack actions below the
  title; Billing allocation cards shrink to the viewport with table-only scroll;
  the Purchasing Edit order button is inset from the record card edge.
- The latest preview requires a separate sign-in before the three fixes can be
  rechecked in the authenticated browser. Automated checks above cover the fixes.
- Sentry returned no issues in the last 24 hours, but this repository has no
  Sentry SDK/instrumentation, so that is not proof of runtime coverage.
- Scoped Sonar advanced analysis was skipped by the service: Vortex is not
  available on this connection. Local secret scans passed.
- Production was not promoted. Implementation remains uncommitted for review.
