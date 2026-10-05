import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("permits GPT-6 model selections without rewriting legacy or unset settings", async () => {
  const database = new PGlite();
  try {
    await database.exec(
      `CREATE TABLE application_settings (id TEXT PRIMARY KEY, "companyName" TEXT);`,
    );
    await database.exec(
      readFileSync(
        "prisma/migrations/20260910000000_ai_processing_models/migration.sql",
        "utf8",
      ),
    );
    await database.exec(`
      INSERT INTO application_settings (id, "companyName")
      VALUES ('unset', 'Unset company');
      INSERT INTO application_settings (
        id, "companyName", "quoteExtractionModel", "itemExtractionModel", "clientDocumentExtractionModel"
      ) VALUES ('legacy', 'Legacy company', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol');
    `);
    const before = await database.query(
      "SELECT * FROM application_settings ORDER BY id",
    );

    await database.exec(
      readFileSync(
        "prisma/migrations/20261005000000_ai_processing_gpt6_models/migration.sql",
        "utf8",
      ),
    );

    expect(
      (await database.query("SELECT * FROM application_settings ORDER BY id"))
        .rows,
    ).toEqual(before.rows);

    for (const field of [
      "quoteExtractionModel",
      "itemExtractionModel",
      "clientDocumentExtractionModel",
    ]) {
      for (const model of [
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.6-sol",
        "gpt-6-luna",
        "gpt-6.1-sol",
      ]) {
        await database.query(
          `UPDATE application_settings SET "${field}" = $1 WHERE id = 'unset'`,
          [model],
        );
        expect(
          (
            await database.query(
              `SELECT "${field}" FROM application_settings WHERE id = 'unset'`,
            )
          ).rows,
        ).toEqual([{ [field]: model }]);
      }
      await expect(
        database.query(
          `UPDATE application_settings SET "${field}" = $1 WHERE id = 'unset'`,
          ["unsupported"],
        ),
      ).rejects.toThrow();
    }
  } finally {
    await database.close();
  }
});
