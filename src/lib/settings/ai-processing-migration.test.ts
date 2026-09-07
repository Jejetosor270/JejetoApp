import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("adds nullable model choices without rewriting existing settings and enforces the model allowlist", async () => {
  const database = new PGlite();
  try {
    await database.exec(
      `CREATE TABLE application_settings (id TEXT PRIMARY KEY, "companyName" TEXT); INSERT INTO application_settings VALUES ('company', 'Existing company');`,
    );
    await database.exec(
      readFileSync(
        "prisma/migrations/20260910000000_ai_processing_models/migration.sql",
        "utf8",
      ),
    );
    expect(
      (await database.query("SELECT * FROM application_settings")).rows,
    ).toEqual([
      {
        id: "company",
        companyName: "Existing company",
        quoteExtractionModel: null,
        itemExtractionModel: null,
        clientDocumentExtractionModel: null,
      },
    ]);
    await database.exec(
      `UPDATE application_settings SET "quoteExtractionModel" = 'gpt-5.6-terra', "itemExtractionModel" = 'gpt-5.6-luna', "clientDocumentExtractionModel" = 'gpt-5.6-sol'`,
    );
    for (const field of [
      "quoteExtractionModel",
      "itemExtractionModel",
      "clientDocumentExtractionModel",
    ]) {
      await expect(
        database.exec(
          `UPDATE application_settings SET "${field}" = 'unsupported'`,
        ),
      ).rejects.toThrow();
    }
  } finally {
    await database.close();
  }
});
