# Sonar — MB ERP

- Use for new Critical/High/security findings or directly affected maintainability issues. Not backlog cleanup, score chasing or broad refactors.
- On 2026-09-23 vendor skills exist, but no callable Sonar MCP or `sonar` CLI was found. No project key/config/scan step appeared in minimal repo/CI review. CI generates LCOV; ingestion/green Sonar gate is not proven. External GitHub-side analysis may exist; project/findings access is unverified.
- Once accessible: resolve project key/branch/PR/revision → small filtered finding set or exact issue → affected code. Read only matching vendor skill. Missing authentication/integration needs setup approval, not automatic hook installation or secret changes.
- Read-only first; no dismiss/resolve, rule/gate edits or analysis uploads unless requested. Never print tokens. Report project/revision, finding/rule IDs, severity, paths and actual gate conditions checked; label unverified status.
