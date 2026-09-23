---
name: mb-erp-development
description: Develop or resume MB ERP (JejetoApp) features using repository invariants, focused diffs, relevant diagnostics and scoped verification. Use for development and context recovery in this repository.
---

# MB ERP development

1. Read repository-root `docs/development-invariants.md` and `AGENTS.md`; do not re-derive documented architecture. Resolve contradictions from affected code/tests and report stale documentation.
2. Check Git branch/worktree/upstream before edits. Preserve other-machine work on Mac/Windows and LF. Cached remote refs are not live sync evidence. Start with local history/diff, use GitHub for remote context; no automatic fetch/checkout/commit/push during inspection.
3. Choose only relevant external diagnostics below; load only that reference. Verify callable tools and the exact project, not just installed skills. Report missing access without repeated retries or unsolicited installation.
4. Inspect affected helpers/callers/tests. Implement requested scope only; preserve Decimal/VAT/FX, cash, authorization, audit, Trash and draft rules. Read installed Next.js guidance before framework edits.
5. Use focused regressions during implementation. Run required final quality gates once on the completed diff; reuse green evidence only for the same unchanged revision/environment. Rerun failed or invalidated checks, not all suites repeatedly. Documentation-only work uses focused skill/Markdown/Git checks per invariants.

## Progressive routing

- Branch/history/diff/CI: [GitHub](references/github.md).
- Deployment/build/runtime: [Vercel](references/vercel.md).
- Production exception: `mb-production-debug`, starting with [Sentry](references/sentry.md), then Vercel/GitHub.
- Migration/schema/query issue: [Neon](references/neon.md) and Git history.
- New High/Critical/security or affected maintainability finding: [Sonar](references/sonar.md).
- UI review: `mb-ui-review`. Release readiness/authorized rollout: `mb-release`.

Simple features need Git/code/tests, not every connector. UI cleanup needs deployment context only when relevant. Use bounded IDs/time windows; never load all references, dump datasets or crawl the whole repo without a task-specific need.

## Shared safety contract

Diagnosis is read-only. Never print secrets, tokens, DB URLs, raw uploads or unnecessary customer data; use safe correlation IDs. No production data changes, Vercel env edits, Sentry resolve/delete actions, GitHub writes or deployments without explicit task authorization. Do not auto-install tools or provision resources to repair missing access. Prepared migrations are not applied evidence; execution remains separately authorized `npm run db:deploy`.

Report scope, evidence, checks, migration need and real blockers. Local build success is not production verification; installed skills are not authenticated connections.
