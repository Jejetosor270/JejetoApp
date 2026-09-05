import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VatTreatment } from "@/generated/prisma/client";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
import {
  insertTestVat,
  orderVatDatabase,
  vatConstraintMigration,
} from "@/test/order-vat-database";

describe("Order VAT PostgreSQL constraint compatibility", () => {
  let database: Awaited<ReturnType<typeof orderVatDatabase>>;
  beforeAll(async () => {
    database = await orderVatDatabase();
    await database.exec(vatConstraintMigration);
  }, 30000);
  afterAll(async () => {
    await database?.close();
  });

  it("reproduces the production violation and applies the actual corrective SQL without changing historical rows", async () => {
    const database = await orderVatDatabase();
    try {
      const entry = {
        direction: "INPUT",
        treatment: "EXEMPT",
        recoverability: null,
        recoverableRate: null,
        vatAmount: "0.0000",
      };
      await expect(insertTestVat(database, entry)).rejects.toMatchObject({
        code: "23514",
        constraint: "order_vat_entries_recoverability_check",
      });
      await insertTestVat(database, {
        ...entry,
        recoverability: "RECOVERABLE",
        recoverableRate: "1.000000",
      });
      const before = await database.query(
        'SELECT * FROM "procurement_order_vat_entries"',
      );
      await database.exec(vatConstraintMigration);
      expect(
        (await database.query('SELECT * FROM "procurement_order_vat_entries"'))
          .rows,
      ).toEqual(before.rows);
      await expect(insertTestVat(database, entry)).resolves.toBeUndefined();
    } finally {
      await database.close();
    }
  });

  it.each(Object.values(VatTreatment))(
    "keeps %s aligned with application recoverability rules",
    async (treatment) => {
      const entry = {
        direction: "INPUT",
        treatment,
        recoverability: null,
        recoverableRate: null,
        vatAmount: "0.0000",
      };
      if (inputVatRecoverabilityApplies(treatment)) {
        await expect(insertTestVat(database, entry)).rejects.toMatchObject({
          code: "23514",
        });
      } else {
        await expect(insertTestVat(database, entry)).resolves.toBeUndefined();
      }
      await expect(
        insertTestVat(database, { ...entry, direction: "OUTPUT" }),
      ).resolves.toBeUndefined();
    },
  );

  it("retains full, partial, non-recoverable, output, range and status/rate safeguards", async () => {
    const entry = {
      direction: "INPUT",
      treatment: "DOMESTIC",
      recoverability: "RECOVERABLE",
      recoverableRate: "1.000000",
      vatAmount: "20.0000",
    };
    for (const [recoverability, recoverableRate] of [
      ["RECOVERABLE", "1"],
      ["NON_RECOVERABLE", "0"],
      ["PARTIALLY_RECOVERABLE", "0.35"],
    ]) {
      await expect(
        insertTestVat(database, {
          ...entry,
          recoverability: recoverability ?? null,
          recoverableRate: recoverableRate ?? null,
        }),
      ).resolves.toBeUndefined();
    }
    for (const change of [
      { direction: "OUTPUT" },
      { recoverableRate: "1.1" },
      { recoverableRate: "0.4" },
      { recoverability: "PARTIALLY_RECOVERABLE", recoverableRate: "0" },
    ]) {
      await expect(
        insertTestVat(database, { ...entry, ...change }),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });
});
