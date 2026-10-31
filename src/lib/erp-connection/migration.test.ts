import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let sequence = 0;
const nextId = () =>
  `bbbbbbbb-bbbb-4bbb-8bbb-${String(++sequence).padStart(12, "0")}`;

async function insertToken(userId: string | null, expiresAt = "2026-11-30") {
  const id = nextId();
  await db.query(
    `INSERT INTO erp_connection_tokens (id,"userId","tokenHash","createdAt","expiresAt") VALUES ($1,$2,$3,'2026-10-31',$4)`,
    [id, userId, id.replaceAll("-", "").repeat(2), expiresAt],
  );
  return id;
}

describe("prepared read-only ERP connection migration (in-memory only)", () => {
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
  });
  afterAll(async () => db.close());

  it("stores only credential hashes without changing financial records", async () => {
    const columns = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='erp_connection_tokens'",
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "revokedAt",
      "tokenHash",
      "userId",
    ]);
    expect(
      (await db.query("SELECT amount::text FROM existing_cash")).rows,
    ).toEqual([{ amount: "123.4500" }]);
  });

  it("prevents two active keys per employee and permits explicit rotation", async () => {
    const first = await insertToken(ownerId);
    await expect(insertToken(ownerId)).rejects.toMatchObject({ code: "23505" });
    await db.query(
      `UPDATE erp_connection_tokens SET "revokedAt"='2026-11-01' WHERE id=$1`,
      [first],
    );
    await expect(insertToken(ownerId)).resolves.toBeTypeOf("string");
  });

  it("invalidates deleted employees without deleting credential history", async () => {
    await db.query("DELETE FROM users WHERE id=$1", [ownerId]);
    const rows = await db.query<{ userId: string | null }>(
      `SELECT "userId" FROM erp_connection_tokens`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.userId === null)).toBe(true);
  });

  it("rejects impossible expiry and nonexistent employee links", async () => {
    await expect(insertToken(null, "2026-10-30")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insertToken(ownerId)).rejects.toMatchObject({ code: "23503" });
  });
});
