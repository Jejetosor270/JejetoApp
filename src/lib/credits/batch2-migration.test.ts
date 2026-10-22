import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const previous = readFileSync(
  "prisma/migrations/20261002010000_financial_credits_refunds/migration.sql",
  "utf8",
);
const migration = readFileSync(
  "prisma/migrations/20261022000000_credit_categories_refund_expectations/migration.sql",
  "utf8",
);
const db = new PGlite();
const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const creditId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("category credits and refund timing migration (isolated PostgreSQL)", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE currencies (code CHAR(3) PRIMARY KEY);
      CREATE TABLE client_billing_documents (id UUID PRIMARY KEY);
      CREATE TABLE procurement_orders (id UUID PRIMARY KEY);
      CREATE TABLE procurement_order_vat_entries (id UUID PRIMARY KEY);
      CREATE TABLE bank_reconciliation_matches ("cashKind" TEXT CONSTRAINT "bank_reconciliation_matches_cashKind_check" CHECK ("cashKind"='SUPPLIER_PAYMENT'));
      INSERT INTO currencies VALUES ('EUR');
      INSERT INTO procurement_orders VALUES ('${orderId}');
    `);
    await db.exec(previous);
    await db.query(
      `INSERT INTO financial_credits (id,side,"orderId",reference,"creditDate",reason,"totalHt","vatAmount","currencyCode","reportingCurrencyCode","updatedAt") VALUES ($1,'SUPPLIER',$2,'CN-1','2026-10-01','Reviewed',100,0,'EUR','EUR',CURRENT_TIMESTAMP)`,
      [creditId, orderId],
    );
    await db.exec(migration);
  });
  afterAll(async () => db.close());

  it("retains existing credit amounts and leaves historical timing and FX unknown", async () => {
    expect(
      (
        await db.query(
          `SELECT "totalHt"::text,"freightCoverageHt"::text,"otherCoverageHt"::text,"expectedRefundDate","expectedRefundFxRateToReporting" FROM financial_credits WHERE id=$1`,
          [creditId],
        )
      ).rows,
    ).toEqual([
      {
        totalHt: "100.0000",
        freightCoverageHt: "0.0000",
        otherCoverageHt: "0.0000",
        expectedRefundDate: null,
        expectedRefundFxRateToReporting: null,
      },
    ]);
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/im);
  });

  it("permits Supplier category attribution while preserving category, source and VAT constraints", async () => {
    await db.query(
      `UPDATE financial_credits SET "freightCoverageHt"=30,"otherCoverageHt"=20 WHERE id=$1`,
      [creditId],
    );
    await expect(
      db.query(
        `UPDATE financial_credits SET "freightCoverageHt"=81 WHERE id=$1`,
        [creditId],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `UPDATE financial_credits SET "otherCoverageHt"=-1 WHERE id=$1`,
        [creditId],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`UPDATE financial_credits SET side='CLIENT' WHERE id=$1`, [
        creditId,
      ]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`UPDATE financial_credits SET "vatAmount"=10 WHERE id=$1`, [
        creditId,
      ]),
    ).rejects.toThrow(/check constraint/);
  });

  it("requires positive expected FX and retains its precision and date-only storage", async () => {
    for (const rate of ["0", "-1"])
      await expect(
        db.query(
          `UPDATE financial_credits SET "expectedRefundFxRateToReporting"=$2 WHERE id=$1`,
          [creditId, rate],
        ),
      ).rejects.toThrow(/check constraint/);
    await db.query(
      `UPDATE financial_credits SET "expectedRefundDate"='2026-11-12',"expectedRefundFxRateToReporting"=0.9123456789 WHERE id=$1`,
      [creditId],
    );
    expect(
      (
        await db.query(
          `SELECT "expectedRefundDate"::text,"expectedRefundFxRateToReporting"::text FROM financial_credits WHERE id=$1`,
          [creditId],
        )
      ).rows,
    ).toEqual([
      {
        expectedRefundDate: "2026-11-12",
        expectedRefundFxRateToReporting: "0.9123456789",
      },
    ]);
    expect(
      (
        await db.query<{ indexname: string }>(
          `SELECT indexname FROM pg_indexes WHERE tablename='financial_credits'`,
        )
      ).rows.map((row) => row.indexname),
    ).toContain("financial_credits_isCancelled_expectedRefundDate_idx");
  });
});
