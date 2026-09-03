import { describe, expect, it } from "vitest";

import {
  formatDecimal,
  formatFxRate,
  formatMoney,
  formatMoneyInput,
  formatQuantity,
  formatRate,
  finalizeMoneyInput,
  normalizeMoneyInput,
} from "@/domain/procurement/presentation";

describe("procurement money presentation", () => {
  it("formats decimal amounts with grouping and two decimal places", () => {
    expect(formatMoney("123456.7", "EUR")).toBe("123 456.70 EUR");
    expect(formatMoney("-0.005", "USD")).toBe("-0.01 USD");
    expect(formatDecimal("0")).toBe("0.00");
    expect(formatDecimal("9")).toBe("9.00");
    expect(formatDecimal("999.9")).toBe("999.90");
    expect(formatDecimal("9999.99")).toBe("9 999.99");
    expect(formatDecimal("1250000.5")).toBe("1 250 000.50");
  });

  it("keeps absent money values distinct", () => {
    expect(formatMoney(null, "EUR")).toBe("—");
  });

  it("formats and normalizes editable money without floating-point parsing", () => {
    expect(formatMoneyInput("1250000")).toBe("1 250 000.00");
    expect(normalizeMoneyInput("1,250,000.25")).toBe("1250000.25");
    expect(normalizeMoneyInput("12 500.5")).toBe("12500.5");
    expect(normalizeMoneyInput("12 500,5")).toBe("12500.5");
    expect(normalizeMoneyInput("15,5")).toBe("15.5");
    expect(normalizeMoneyInput("12,500.12345")).toBeNull();
    expect(finalizeMoneyInput("001,250")).toBe("1.250");
  });

  it("uses domain-aware precision with the same grouping convention", () => {
    expect(formatQuantity("1250")).toBe("1 250");
    expect(formatQuantity("1250.5")).toBe("1 250.5");
    expect(formatRate("0.155")).toBe("15.5%");
    expect(formatRate("1")).toBe("100%");
    expect(formatFxRate("1.0847250000")).toBe("1.084725");
  });
});
