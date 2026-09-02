import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatMoneyInput,
  finalizeMoneyInput,
  normalizeMoneyInput,
} from "@/domain/procurement/presentation";

describe("procurement money presentation", () => {
  it("formats decimal amounts with grouping and two decimal places", () => {
    expect(formatMoney("123456.7", "EUR")).toBe("123,456.70 EUR");
    expect(formatMoney("-0.005", "USD")).toBe("-0.01 USD");
  });

  it("keeps absent money values distinct", () => {
    expect(formatMoney(null, "EUR")).toBe("—");
  });

  it("formats and normalizes editable money without floating-point parsing", () => {
    expect(formatMoneyInput("1250000")).toBe("1,250,000.00");
    expect(normalizeMoneyInput("1,250,000.25")).toBe("1250000.25");
    expect(normalizeMoneyInput("12 500.5")).toBe("12500.5");
    expect(normalizeMoneyInput("15,5")).toBe("15.5");
    expect(normalizeMoneyInput("12,500.12345")).toBeNull();
    expect(finalizeMoneyInput("001,250.")).toBe("1250");
  });
});
