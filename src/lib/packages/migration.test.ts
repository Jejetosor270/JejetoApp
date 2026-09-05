import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("preserves historical text, rejects cross-Project assignment and protects populated Packages", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE projects (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE procurement_orders (id uuid PRIMARY KEY, "projectId" uuid NOT NULL, "packageName" text NOT NULL);
      INSERT INTO projects VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
      INSERT INTO procurement_orders VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Legacy reference');`);
    await db.exec(
      readFileSync(
        "prisma/migrations/20260909000000_project_order_packages/migration.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          'SELECT "packageName", "packageId" FROM procurement_orders',
        )
      ).rows,
    ).toEqual([{ packageName: "Legacy reference", packageId: null }]);
    await db.exec(
      `INSERT INTO order_packages (id, "projectId", name, "updatedAt") VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Other Project', now());`,
    );
    await expect(
      db.exec(
        `UPDATE procurement_orders SET "packageId" = '00000000-0000-4000-8000-000000000004'`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `UPDATE order_packages SET "projectId" = '00000000-0000-4000-8000-000000000001'; UPDATE procurement_orders SET "packageId" = '00000000-0000-4000-8000-000000000004'; UPDATE order_packages SET "isActive" = false;`,
    );
    await expect(db.exec("DELETE FROM order_packages")).rejects.toThrow();
    expect(
      (await db.query('SELECT "packageId" FROM procurement_orders')).rows,
    ).toEqual([{ packageId: "00000000-0000-4000-8000-000000000004" }]);
  } finally {
    await db.close();
  }
});
