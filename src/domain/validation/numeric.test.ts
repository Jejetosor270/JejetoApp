import { describe, expect, it } from "vitest";

import { normalizeDecimalInput } from "@/domain/validation/numeric";

describe("human decimal input", () => {
  it.each([
    ["9999.99", "9999.99"],
    ["9999,99", "9999.99"],
    ["9 999.99", "9999.99"],
    ["9 999,99", "9999.99"],
    ["9\u00a0999,99", "9999.99"],
    ["1,250,000.50", "1250000.50"],
    ["0", "0"],
    ["0,00", "0.00"],
    ["-9 999,99", "-9999.99"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDecimalInput(input)).toBe(expected);
  });

  it("prefers the new comma-decimal convention for an ambiguous single comma", () => {
    expect(normalizeDecimalInput("1,234")).toBe("1.234");
  });

  it.each(["abc", "1,2,34", "12..5", "--1"])(
    "rejects malformed input %s",
    (input) => expect(normalizeDecimalInput(input)).toBeNull(),
  );
});
