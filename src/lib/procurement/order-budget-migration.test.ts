import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("adds nullable tracking and budget without rewriting historical Orders", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE procurement_orders (id TEXT PRIMARY KEY); INSERT INTO procurement_orders (id) VALUES ('existing');",
    );
    await db.exec(
      readFileSync(
        "prisma/migrations/20260911000000_order_tracking_budget/migration.sql",
        "utf8",
      ),
    );
    expect((await db.query("SELECT * FROM procurement_orders")).rows).toEqual([
      {
        id: "existing",
        carrierCode: null,
        carrierOtherName: null,
        trackingReference: null,
        budgetPurchaseAmountHt: null,
      },
    ]);
    await expect(
      db.exec('UPDATE procurement_orders SET "budgetPurchaseAmountHt" = -1'),
    ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await db.close();
  }
}, 30000);
