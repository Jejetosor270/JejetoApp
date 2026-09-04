import { describe, expect, it } from "vitest";

import { formatEnumLabel, formatRoleLabel } from "@/domain/presentation/labels";

describe("business presentation labels", () => {
  it.each([
    ["PARTIALLY_PAID", "Partially Paid"],
    ["ON_HOLD", "On Hold"],
    ["OUTPUT_VAT", "Output VAT"],
    ["direct-selling-price", "Direct Selling Price"],
  ])("formats %s", (value, expected) => {
    expect(formatEnumLabel(value)).toBe(expected);
  });

  it("formats employee roles", () => {
    expect(formatRoleLabel("ADMIN")).toBe("Admin");
  });
});
