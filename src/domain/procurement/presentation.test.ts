import { describe, expect, it } from "vitest";

import { formatMoney } from "@/domain/procurement/presentation";

describe("procurement money presentation", () => {
  it("formats decimal amounts with grouping and two decimal places", () => {
    expect(formatMoney("123456.7", "EUR")).toBe("123,456.70 EUR");
    expect(formatMoney("-0.005", "USD")).toBe("-0.01 USD");
  });

  it("keeps absent money values distinct", () => {
    expect(formatMoney(null, "EUR")).toBe("—");
  });
});
