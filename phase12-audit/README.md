# Phase 12 product audit

This is a standalone, local review tool. It is not an ERP route, does not connect to Neon, and does not change application data.

## Open the review app

From the repository root, run:

```text
python3 -m http.server 8765 -d phase12-audit
```

Then open:

```text
http://localhost:8765
```

Opening `index.html` directly is not supported because browsers normally block local JSON loading. No package installation is required.

## Review workflow

1. Start with **Top issues**.
2. Open each finding and choose **Accept recommendation**, **Keep as-is**, **Modify recommendation**, or **Defer**.
3. Add a reviewer note, exact replacement text, or a custom requested change where useful.
4. Review the dedicated **Terminology** and **Financial sources** views.
5. Use **Coverage** to see which states were runtime-verified and which were code-reviewed.
6. Use **Batches** only as a proposed implementation sequence.

Choices are saved only in this browser's `localStorage` under `mb-phase12-audit-decisions-v1`.

## Export

Use **Export JSON** or **Export Markdown** at the top of the page. They download:

- `phase12-decisions.md` — ready to use as the next implementation brief
- `phase12-decisions.json` — structured decisions for machine-assisted processing

Both exports include every finding, including unreviewed findings, plus terminology decisions. Keep the downloaded file outside the repository unless you intentionally want to version the review outcome.

## Audit method and boundaries

- All accessible desktop routes were inspected through a read-only local runtime sweep where safe.
- Existing records were opened, but no form was saved, no destructive action was confirmed, and no upload was submitted.
- Unsafe or unavailable states—validation failures, destructive confirmations, semantic upload reviews, and some role variants—were inspected through implementation and tests and are marked accordingly in the coverage matrix.
- Runtime screenshots were kept only in the operating system temporary directory because they contained production-like commercial information. They are intentionally not part of this artifact.
- A temporary process-only local authentication secret was used to start the development server; no environment file was created or changed.

## Files

- `issues.json` — 44 structured findings
- `terminology.json` — proposed canonical vocabulary
- `authorities.json` — financial single-source-of-truth map
- `coverage.json` — route/state coverage matrix
- `index.html`, `styles.css`, `app.js` — standalone review interface
