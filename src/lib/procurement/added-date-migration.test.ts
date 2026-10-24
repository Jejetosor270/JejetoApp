import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("backfills the Paris creation day, preserves history and defaults new rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      SET TIME ZONE 'America/Los_Angeles';
      CREATE TABLE procurement_orders (
        id TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL,
        "invoiceDate" DATE, "trashedAt" TIMESTAMP(3)
      );
      INSERT INTO procurement_orders VALUES
        ('summer', '2026-07-01 22:30:00', '2026-06-01', NULL),
        ('winter', '2026-01-01 22:30:00', NULL, NULL),
        ('trashed', '2026-01-01 23:30:00', '2025-12-01', '2026-02-01');
    `);
    await db.exec(
      readFileSync(
        "prisma/migrations/20261024000000_purchasing_added_date/migration.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(`SELECT id, "addedDate"::text AS added, "createdAt"::text AS created,
      "invoiceDate"::text AS invoice FROM procurement_orders ORDER BY id`)
      ).rows,
    ).toEqual([
      {
        id: "summer",
        added: "2026-07-02",
        created: "2026-07-01 22:30:00",
        invoice: "2026-06-01",
      },
      {
        id: "trashed",
        added: "2026-01-02",
        created: "2026-01-01 23:30:00",
        invoice: "2025-12-01",
      },
      {
        id: "winter",
        added: "2026-01-01",
        created: "2026-01-01 22:30:00",
        invoice: null,
      },
    ]);
    await db.exec(
      `INSERT INTO procurement_orders (id, "createdAt") VALUES ('new', CURRENT_TIMESTAMP);`,
    );
    expect(
      (
        await db.query(`SELECT "addedDate" = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Paris')::date AS correct
      FROM procurement_orders WHERE id = 'new'`)
      ).rows,
    ).toEqual([{ correct: true }]);
    await expect(
      db.exec(
        `UPDATE procurement_orders SET "addedDate" = NULL WHERE id = 'new'`,
      ),
    ).rejects.toMatchObject({ code: "23502" });
  } finally {
    await db.close();
  }
}, 30000);
