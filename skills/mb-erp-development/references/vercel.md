# Vercel — MB ERP

- Use for deployment/build/runtime evidence, not code archaeology. Read available tool schemas/vendor guidance when invoking; access varies by session.
- On 2026-09-23 team `jejetosor270s-projects` / `team_CPwKhO0JaOyHlC555SwdEgGP` authenticates but project listing returned zero. GitHub status for `ff9533a` links a successful `jejeto-app` deployment. Direct project lookup failed with an adapter error (`idOrName` missing despite exposed `projectId`); lookup using the deployment identifier from that status link returned 404. Project/log access remains unverified; empty listing does not prove no deployment.
- Narrow flow: exact deployment/GitHub status URL → verify project/environment/SHA → bounded error window. Correlate Sentry time. If adapter remains broken, report the gap; GitHub status alone does not prove runtime health.
- Read-only first. No deploy/promote/rollback, protection/share-token/env changes without authorization. No secrets/full request bodies. Report deployment link/ID, SHA, state/environment and safe error category/time; avoid broad logs and unchanged polling.
