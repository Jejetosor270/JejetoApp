---
name: mb-production-debug
description: Diagnose MB ERP production exceptions, failing routes and release regressions with scoped Sentry, Vercel and Git evidence. Use for production incidents, not general feature work.
---

# MB production debug

Read repository invariants and the [shared safety contract](../mb-erp-development/SKILL.md). Check Git/worktree and preserve other-machine changes.

Symptom → Sentry event → release/deployment → Git diff → exact code path → authorized fix → focused test → authorized deploy → confirm.

- Start with support reference, route, time and environment. Read [Sentry](../mb-erp-development/references/sentry.md) for the exact exception/trace; if unavailable/uninstrumented, disclose the gap and use [Vercel](../mb-erp-development/references/vercel.md). Missing telemetry does not prove no error.
- Correlate release SHA using [GitHub](../mb-erp-development/references/github.md). Inspect changed paths and necessary helpers only; separate observed facts from hypotheses. Check diagnostics before guessing.
- Read [Neon](../mb-erp-development/references/neon.md) only for DB/schema/query evidence and [Sonar](../mb-erp-development/references/sonar.md) only for relevant quality/security evidence.
- Diagnosis-only requests end with findings. Authorized fixes retain financial authority, authorization, audit and drafts; add focused regression coverage, then required final gates once.
- Deploy only with explicit authorization using `mb-release`, then confirm the same route/error and release/time window. Never mutate production data, edit env vars or resolve/delete Sentry issues during diagnosis. Stop when access/new authority is needed; do not loop.

Report safe IDs/time/environment/SHA, cause/uncertainty, requested fix, checks and unperformed production confirmation. No secrets, raw documents or customer payload dumps.
