import { describe, expect, it } from "vitest";

import {
  createBuildingInputSchema,
  createClientInputSchema,
  createProjectInputSchema,
  createSupplierInputSchema,
} from "@/domain/master-data/validation";

describe("master-data validation", () => {
  it("normalizes client email and preserves optional business fields", () => {
    const result = createClientInputSchema.parse({
      defaultCurrencyCode: " eur ",
      displayName: "Example client",
      email: " CONTACT@EXAMPLE.INVALID ",
      legalName: "Example Client Ltd.",
    });
    expect(result).toMatchObject({
      defaultCurrencyCode: "EUR",
      email: "contact@example.invalid",
    });
  });

  it("rejects negative supplier lead times", () => {
    expect(() =>
      createSupplierInputSchema.parse({
        defaultCurrencyCode: "EUR",
        defaultLeadTimeWeeks: "-1",
        displayName: "Example supplier",
        legalName: "Example Supplier Ltd.",
      }),
    ).toThrow("cannot be negative");
  });

  it("requires project completion to be on or after its start date", () => {
    expect(() =>
      createProjectInputSchema.parse({
        clientId: "f45ac9c9-10e9-4e42-b93f-38796de4f65a",
        code: "PRJ-1",
        expectedCompletionDate: "2026-01-01",
        name: "Example project",
        reportingCurrencyCode: "EUR",
        startDate: "2026-02-01",
        status: "PLANNING",
      }),
    ).toThrow("Expected completion");
  });

  it("requires a parent project for a building", () => {
    expect(() =>
      createBuildingInputSchema.parse({ name: "Building A", shortCode: "A" }),
    ).toThrow("Invalid project");
  });
});
