import { describe, expect, it } from "vitest";

import { fieldErrorMap } from "@/domain/validation/issues";

describe("shared field-error mapping", () => {
  it("keeps the first useful issue per field for Billing and other editors", () => {
    expect(
      fieldErrorMap([
        { message: "Enter a valid VAT rate.", path: ["vatRate"] },
        { message: "Second message.", path: ["vatRate"] },
        { message: "Choose a Project.", path: ["projectId"] },
      ]),
    ).toEqual({
      projectId: "Choose a Project.",
      vatRate: "Enter a valid VAT rate.",
    });
  });
});
