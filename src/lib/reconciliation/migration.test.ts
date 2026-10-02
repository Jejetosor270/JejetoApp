import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261002000000_financial_followups_reconciliation/migration.sql",
  ),
  "utf8",
);
const db = new PGlite();
let sequence = 0;
const id = () =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}`;
const fingerprint = "a".repeat(64);

async function statementImport(account = id(), actor: string | null = null) {
  const importId = id();
  await db.query(
    `INSERT INTO bank_statement_imports (id, "accountLabel", "accountKey", "currencyCode", fingerprint, "createdById") VALUES ($1,'Test account',$2,'EUR',$3,$4)`,
    [importId, account, fingerprint, actor],
  );
  return importId;
}

async function line(importId: string, rowNumber = 1) {
  const lineId = id();
  await db.query(
    `INSERT INTO bank_statement_lines (id, "importId", "rowNumber", "bookedAt", direction, amount, "updatedAt") VALUES ($1,$2,$3,'2026-10-02','CLIENT_RECEIPT',100.2500,CURRENT_TIMESTAMP)`,
    [lineId, importId, rowNumber],
  );
  return lineId;
}

describe("prepared follow-up / reconciliation migration (in-memory PostgreSQL only)", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE TYPE "PaymentDirection" AS ENUM ('SUPPLIER_PAYMENT','CLIENT_RECEIPT');
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE currencies (code CHAR(3) PRIMARY KEY);
      INSERT INTO currencies VALUES ('EUR');
      CREATE TABLE existing_cash (id INTEGER PRIMARY KEY, amount DECIMAL(19,4));
      INSERT INTO existing_cash VALUES (1,123.4500);
    `);
    await db.exec(migration);
  });
  afterAll(async () => {
    await db.close();
  });

  it("creates only coordination/evidence tables and required indexes without rewriting cash", async () => {
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "financial_follow_ups",
        "bank_statement_imports",
        "bank_statement_lines",
        "bank_reconciliation_matches",
      ]),
    );
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public'`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "financial_follow_ups_issueKey_key",
        "financial_follow_ups_assigneeId_nextFollowUpDate_idx",
        "bank_statement_imports_accountKey_currencyCode_fingerprint_key",
        "bank_statement_lines_importId_rowNumber_key",
        "bank_statement_lines_bookedAt_idx",
        "bank_reconciliation_matches_cashKind_cashRecordId_key",
        "bank_reconciliation_matches_lineId_idx",
      ]),
    );
    expect(
      (
        await db.query<{ amount: string }>(
          `SELECT amount::text FROM existing_cash`,
        )
      ).rows,
    ).toEqual([{ amount: "123.4500" }]);
    expect(migration).not.toMatch(
      /^\s*(?:UPDATE|DELETE FROM|DROP TABLE|ALTER TABLE)\b/im,
    );
  });

  it("enforces positive amounts and row numbers with the existing cash direction enum", async () => {
    const importId = await statementImport();
    for (const amount of ["0", "-1"]) {
      await expect(
        db.query(
          `INSERT INTO bank_statement_lines (id,"importId","rowNumber","bookedAt",direction,amount,"updatedAt") VALUES ($1,$2,1,'2026-10-02','CLIENT_RECEIPT',$3,CURRENT_TIMESTAMP)`,
          [id(), importId, amount],
        ),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      db.query(
        `INSERT INTO bank_statement_lines (id,"importId","rowNumber","bookedAt",direction,amount,"updatedAt") VALUES ($1,$2,0,'2026-10-02','CLIENT_RECEIPT',1,CURRENT_TIMESTAMP)`,
        [id(), importId],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `INSERT INTO bank_statement_lines (id,"importId","rowNumber","bookedAt",direction,amount,"updatedAt") VALUES ($1,$2,1,'2026-10-02','UNKNOWN',1,CURRENT_TIMESTAMP)`,
        [id(), importId],
      ),
    ).rejects.toThrow(/enum/);
    await line(importId);
  });

  it("prevents duplicate import identities and row positions", async () => {
    const account = id();
    const importId = await statementImport(account);
    await expect(statementImport(account)).rejects.toThrow(/duplicate key/);
    await statementImport();
    await line(importId);
    await expect(line(importId)).rejects.toThrow(/duplicate key/);
    await line(importId, 2);
  });

  it("enforces one match per cash record while allowing grouped cash on one bank line", async () => {
    const lineId = await line(await statementImport());
    const otherLine = await line(await statementImport());
    const cashId = id();
    const insert = (recordId: string, bankLine: string) =>
      db.query(
        `INSERT INTO bank_reconciliation_matches (id,"lineId","cashKind","cashRecordId","cashFingerprint") VALUES ($1,$2,'CLIENT_RECEIPT',$3,$4)`,
        [id(), bankLine, recordId, fingerprint],
      );
    await insert(cashId, lineId);
    await expect(insert(cashId, otherLine)).rejects.toThrow(/duplicate key/);
    await insert(id(), lineId);
    await expect(
      db.query(`DELETE FROM bank_statement_lines WHERE id=$1`, [lineId]),
    ).rejects.toThrow(/foreign key/);
  });

  it("retains import and follow-up evidence after employee deletion", async () => {
    const actor = id();
    await db.query(`INSERT INTO users VALUES ($1)`, [actor]);
    const followUpId = id();
    await db.query(
      `INSERT INTO financial_follow_ups (id,"issueKey","assigneeId","createdById","updatedById","updatedAt") VALUES ($1,$2,$3,$3,$3,CURRENT_TIMESTAMP)`,
      [followUpId, id(), actor],
    );
    const importId = await statementImport(undefined, actor);
    const lineId = await line(importId);
    const matchId = id();
    await db.query(
      `INSERT INTO bank_reconciliation_matches (id,"lineId","cashKind","cashRecordId","cashFingerprint","createdById") VALUES ($1,$2,'CLIENT_RECEIPT',$3,$4,$5)`,
      [matchId, lineId, id(), fingerprint, actor],
    );
    await db.query(`DELETE FROM users WHERE id=$1`, [actor]);
    expect(
      (
        await db.query(
          `SELECT "assigneeId","createdById","updatedById" FROM financial_follow_ups WHERE id=$1`,
          [followUpId],
        )
      ).rows,
    ).toEqual([{ assigneeId: null, createdById: null, updatedById: null }]);
    expect(
      (
        await db.query(
          `SELECT "createdById" FROM bank_statement_imports WHERE id=$1`,
          [importId],
        )
      ).rows,
    ).toEqual([{ createdById: null }]);
    expect(
      (
        await db.query(
          `SELECT "createdById" FROM bank_reconciliation_matches WHERE id=$1`,
          [matchId],
        )
      ).rows,
    ).toEqual([{ createdById: null }]);
  });

  it("restricts parent deletion and requires unique follow-ups with positive versions", async () => {
    const importId = await statementImport();
    await line(importId);
    await expect(
      db.query(`DELETE FROM bank_statement_imports WHERE id=$1`, [importId]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.query(`DELETE FROM currencies WHERE code='EUR'`),
    ).rejects.toThrow(/foreign key/);
    const issueKey = id();
    const insert = (version: number) =>
      db.query(
        `INSERT INTO financial_follow_ups (id,"issueKey",version,"updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
        [id(), issueKey, version],
      );
    await expect(insert(0)).rejects.toThrow(/check constraint/);
    await insert(1);
    await expect(insert(1)).rejects.toThrow(/duplicate key/);
  });

  it("rejects unknown match kinds and malformed fingerprints", async () => {
    const lineId = await line(await statementImport());
    for (const [kind, hash] of [
      ["UNKNOWN", fingerprint],
      ["SUPPLIER_PAYMENT", "not-a-fingerprint"],
    ]) {
      await expect(
        db.query(
          `INSERT INTO bank_reconciliation_matches (id,"lineId","cashKind","cashRecordId","cashFingerprint") VALUES ($1,$2,$3,$4,$5)`,
          [id(), lineId, kind, id(), hash],
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });
});
