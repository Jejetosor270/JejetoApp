import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("preserves legacy totals and constrains freight portions", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE TABLE client_billing_documents (id TEXT PRIMARY KEY, "totalHt" DECIMAL(19,4)); CREATE TABLE client_billing_allocations (id TEXT PRIMARY KEY, "allocatedAmount" DECIMAL(19,4)); INSERT INTO client_billing_documents VALUES ('old',100); INSERT INTO client_billing_allocations VALUES ('old',80);`,
    );
    await db.exec(
      readFileSync(
        "prisma/migrations/20260912000000_billing_freight_coverage/migration.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          'SELECT "totalHt", "freightCoverageHt" FROM client_billing_documents',
        )
      ).rows,
    ).toEqual([{ totalHt: "100.0000", freightCoverageHt: "0.0000" }]);
    await expect(
      db.exec('UPDATE client_billing_documents SET "freightCoverageHt"=101'),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.exec('UPDATE client_billing_allocations SET "freightCoverageHt"=-1'),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.exec('UPDATE client_billing_allocations SET "freightCoverageHt"=81'),
    ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await db.close();
  }
}, 30000);
