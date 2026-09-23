---
name: mb-release
description: Check MB ERP release readiness or execute an explicitly authorized rollout using Git revision, migration requirements, quality gates, Vercel deployment and focused post-release evidence.
---

# MB release

Read repository invariants and the [shared safety contract](../mb-erp-development/SKILL.md). Readiness review is read-only; this skill grants no push/deploy/migration/env/data-write authority.

1. Check branch/worktree and live [GitHub](../mb-erp-development/references/github.md) revision when available. Preserve other-machine changes; cached refs are not live sync evidence. Identify release SHA.
2. Inspect relevant schema/migration diffs. Use [Neon](../mb-erp-development/references/neon.md) for migration state when needed. Distinguish prepared/applied/failed/unknown; neither Git nor build success proves application. Execution is separately authorized `npm run db:deploy`; no reset/schema push/bypass.
3. Confirm formatting, Prisma validation, typecheck, lint, full tests and production build for that revision; domain changes require coverage. Reuse matching green CI/local checks, rerun missing/invalidated ones only. Documentation-only work follows lighter invariant checks. [Sonar](../mb-erp-development/references/sonar.md) is for relevant new High/Critical/security findings, not backlog cleanup.
4. Authorized rollout uses the agreed GitHub → automatic Vercel workflow, not a duplicate direct deploy. Confirm target/environment and migration sequencing before writes. Readiness-only requests stop with the plan.
5. Confirm SHA/build/deployment via [Vercel](../mb-erp-development/references/vercel.md), narrow post-release errors via [Sentry](../mb-erp-development/references/sentry.md), and focused read-only smoke checks. Missing telemetry/no matching events does not prove all workflows work.

Stop on failed gates, unknown required migration state, wrong target or missing authority. Report SHA/environment, deployment link/status, migration evidence, reused/new checks, smoke evidence and gaps. Do not resolve Sentry issues or edit Vercel settings during release checks.
