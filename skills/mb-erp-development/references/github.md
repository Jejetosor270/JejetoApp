# GitHub — MB ERP

- Use local Git for branch/worktree/diffs/history; connector for remote revision, regression correlation and CI. Not unrelated-repository archaeology.
- Verified 2026-09-23: `Jejetosor270/JejetoApp`, default `main`; connector reports read/push/admin permissions, not authorization to write. Recheck origin if checkout changes.
- Narrow flow: status/diff → exact branch/SHA → changed paths → relevant patch/checks. Cached refs are not live sync evidence. No automatic fetch/checkout/reset/commit/push or PR writes during diagnosis.
- Report repo/branch/short SHA, affected paths and checked status; never tokens or credential-bearing URLs. Prefer one bounded comparison over broad search.
