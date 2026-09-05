import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const vatConstraintMigration = readFileSync(
  "prisma/migrations/20260908000000_order_vat_optional_recoverability/migration.sql",
  "utf8",
);

/** Disposable PostgreSQL engine; never reads connection strings or application data. */
export async function orderVatDatabase() {
  const database = new PGlite();
  await database.exec(`CREATE TABLE "procurement_order_vat_entries" (
    "direction" text NOT NULL, "treatment" text NOT NULL,
    "recoverability" text, "recoverableRate" numeric(9,6), "vatAmount" numeric(19,4)
  );`);
  const phase5 = readFileSync(
    "prisma/migrations/20260825000000_phase5_vat_multi_currency/migration.sql",
    "utf8",
  );
  await database.exec(
    'ALTER TABLE "procurement_order_vat_entries" ' +
      phase5.slice(
        phase5.indexOf(
          'ADD CONSTRAINT "order_vat_entries_recoverability_check"',
        ),
      ),
  );
  const phase11 = readFileSync(
    "prisma/migrations/20260906000000_phase11_11a_vat_recoverability/migration.sql",
    "utf8",
  );
  await database.exec(
    'ALTER TABLE "procurement_order_vat_entries" ' +
      phase11.slice(
        phase11.indexOf(
          'ADD CONSTRAINT "order_vat_entries_recoverable_rate_check"',
        ),
        phase11.indexOf('ALTER TABLE "project_freight_expenses"'),
      ),
  );
  return database;
}

export interface TestVatEntry {
  direction: string;
  treatment: string;
  recoverability: string | null;
  recoverableRate: string | null;
  vatAmount: string;
}

export async function insertTestVat(database: PGlite, entry: TestVatEntry) {
  await database.query(
    `INSERT INTO "procurement_order_vat_entries"
    ("direction", "treatment", "recoverability", "recoverableRate", "vatAmount")
    VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.direction,
      entry.treatment,
      entry.recoverability,
      entry.recoverableRate,
      entry.vatAmount,
    ],
  );
}
