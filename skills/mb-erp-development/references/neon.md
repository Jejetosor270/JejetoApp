# Neon — MB ERP

- Use for migration state, schema/constraints, safe data-shape and query-performance questions. Not unsolicited Auth/storage/infrastructure setup.
- Prisma 7 PostgreSQL: `prisma.config.ts` prefers `DIRECT_URL` over `DATABASE_URL`; schema/history in `prisma/`. Never print URLs. On 2026-09-23 plugin is installed/enabled but no callable Neon MCP, CLI or shell `NEON_API_KEY` was found; project/branch/database access is unverified.
- Once accessible: identify exact project/branch/database/environment from metadata. Prefer schema and bounded `_prisma_migrations` metadata over business rows. SQL diagnosis uses an explicit read-only transaction and timeout; avoid procedures, unbounded scans, `SELECT *` and `EXPLAIN ANALYZE` for metadata checks.
- No branch creation/reset/deletion, env pulling, connection-string retrieval/display, constraint changes or DDL/DML during diagnosis. Prepared migrations deploy only via separately authorized `npm run db:deploy`; inspect partial failure evidence before recovery proposals.
- Report safe project/branch IDs, migration names/state, constraint/query evidence and uncertainty; no credentials/customer records. Stop if target/read-only safety is uncertain.
