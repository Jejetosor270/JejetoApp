import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const readId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let sequence = 0;
const nextId = () =>
  `cccccccc-cccc-4ccc-8ccc-${String(++sequence).padStart(12, "0")}`;

async function insertCashKey(approvalPublicKey: string | null = "public-key") {
  const id = nextId();
  await db.query(
    `INSERT INTO erp_connection_tokens (id,"userId","tokenHash",scope,"approvalPublicKey","createdAt","expiresAt") VALUES ($1,$2,$3,'CASH_WRITE',$4,'2026-10-31','2026-11-30')`,
    [id, ownerId, id.replaceAll("-", "").repeat(2), approvalPublicKey],
  );
  return id;
}

async function insertProposal(
  amount = "123.45",
  expiresAt = "2026-10-31 12:15:00",
) {
  const id = nextId();
  await db.query(
    `INSERT INTO erp_cash_change_proposals
      (id,"actorId","tokenId",action,"targetId","documentId","projectId","projectName","partyName","recordReference",amount,"currencyCode","reportingCurrencyCode","cashDate","remainingBefore","remainingAfter","stateHash",digest,nonce,"createdAt","expiresAt")
      VALUES ($1,$2,$3,'RECORD_SUPPLIER_PAYMENT',$3,$3,$3,'Project','Supplier','Order',$4,'EUR','EUR','2026-10-31',200,76.55,$5,$5,$1,'2026-10-31 12:00:00',$6)`,
    [id, ownerId, readId, amount, "a".repeat(64), expiresAt],
  );
  return id;
}

describe("cash connection migration (in-memory only)", () => {
  beforeAll(async () => {
    await db.exec(`CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE existing_cash (amount DECIMAL(19,4));
      INSERT INTO existing_cash VALUES (123.4500);`);
    await db.query("INSERT INTO users VALUES ($1)", [ownerId]);
    await db.exec(
      readFileSync(
        "prisma/migrations/20261031000000_erp_read_connection/migration.sql",
        "utf8",
      ),
    );
    await db.query(
      `INSERT INTO erp_connection_tokens (id,"userId","tokenHash","createdAt","expiresAt") VALUES ($1,$2,$3,'2026-10-31','2026-11-30')`,
      [readId, ownerId, "b".repeat(64)],
    );
    await db.exec(
      readFileSync(
        "prisma/migrations/20261031010000_erp_cash_connection/migration.sql",
        "utf8",
      ),
    );
  });
  afterAll(async () => db.close());

  it("preserves existing read keys and cash without granting writes", async () => {
    expect(
      (
        await db.query(
          `SELECT scope,"approvalPublicKey","revokedAt" FROM erp_connection_tokens WHERE id=$1`,
          [readId],
        )
      ).rows,
    ).toEqual([
      { scope: "READ_ONLY", approvalPublicKey: null, revokedAt: null },
    ]);
    expect(
      (await db.query("SELECT amount::text FROM existing_cash")).rows,
    ).toEqual([{ amount: "123.4500" }]);
  });

  it("permits independent cash access but only one unrevoked key per scope", async () => {
    const first = await insertCashKey();
    await expect(insertCashKey()).rejects.toMatchObject({ code: "23505" });
    await db.query(
      `UPDATE erp_connection_tokens SET "revokedAt"='2026-11-01' WHERE id=$1`,
      [first],
    );
    await expect(insertCashKey()).resolves.toBeTypeOf("string");
    expect(
      (
        await db.query(
          `SELECT "revokedAt" FROM erp_connection_tokens WHERE id=$1`,
          [readId],
        )
      ).rows,
    ).toEqual([{ revokedAt: null }]);
  });

  it("requires an approval public key only for cash credentials", async () => {
    await expect(insertCashKey(null)).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `UPDATE erp_connection_tokens SET "approvalPublicKey"='unexpected' WHERE id=$1`,
        [readId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces valid proposals and atomic approval/result metadata", async () => {
    await expect(insertProposal("0")).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertProposal("10", "2026-10-31 12:00:00"),
    ).rejects.toMatchObject({ code: "23514" });
    const id = await insertProposal();
    await expect(
      db.query(
        `UPDATE erp_cash_change_proposals SET "executedAt"='2026-10-31 12:01:00' WHERE id=$1`,
        [id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `UPDATE erp_cash_change_proposals SET "approvedAt"='2026-10-31 12:01:00',"approvalSignature"=$2,"executedAt"='2026-10-31 12:01:00',"resultId"=$1 WHERE id=$1`,
        [id, "s".repeat(86)],
      ),
    ).resolves.toBeDefined();
    await db.query("DELETE FROM users WHERE id=$1", [ownerId]);
    expect(
      (
        await db.query(
          `SELECT "actorId","resultId" FROM erp_cash_change_proposals WHERE id=$1`,
          [id],
        )
      ).rows,
    ).toEqual([{ actorId: ownerId, resultId: id }]);
    expect(
      (
        await db.query<{ userId: string | null }>(
          `SELECT "userId" FROM erp_connection_tokens`,
        )
      ).rows.every((row) => row.userId === null),
    ).toBe(true);
  });
});
