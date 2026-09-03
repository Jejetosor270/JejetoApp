import { describe, expect, it } from "vitest";

import {
  calculateInputVatRecovery,
  recoverabilityFromRate,
  resolveRecoverableRate,
  vatEconomicCostContribution,
} from "@/domain/vat/recoverability";

describe("input VAT recoverability", () => {
  it("preserves legacy fully recoverable VAT", () => {
    const result = calculateInputVatRecovery({
      recoverability: "RECOVERABLE",
      vatAmount: "2000",
    });
    expect(
      resolveRecoverableRate({ recoverability: "RECOVERABLE" }).toFixed(6),
    ).toBe("1.000000");
    expect(result.deductibleVat.toFixed(4)).toBe("2000.0000");
    expect(result.nonDeductibleVat.toFixed(4)).toBe("0.0000");
  });

  it("preserves legacy non-recoverable VAT as economic cost", () => {
    const result = calculateInputVatRecovery({
      recoverability: "NON_RECOVERABLE",
      vatAmount: "2000",
    });
    expect(result.deductibleVat.toFixed(4)).toBe("0.0000");
    expect(
      vatEconomicCostContribution({
        recoverability: "NON_RECOVERABLE",
        vatAmount: "2000",
      }).toFixed(4),
    ).toBe("2000.0000");
  });

  it("splits partially recoverable VAT exactly", () => {
    const result = calculateInputVatRecovery({
      recoverableRate: "0.60",
      vatAmount: "10000",
    });
    expect(recoverabilityFromRate("0.60")).toBe("PARTIALLY_RECOVERABLE");
    expect(result.deductibleVat.toFixed(4)).toBe("6000.0000");
    expect(result.nonDeductibleVat.toFixed(4)).toBe("4000.0000");
  });

  it("accepts the inclusive zero and one boundaries", () => {
    expect(recoverabilityFromRate("0")).toBe("NON_RECOVERABLE");
    expect(recoverabilityFromRate("1")).toBe("RECOVERABLE");
    expect(() => recoverabilityFromRate("-0.01")).toThrow();
    expect(() => recoverabilityFromRate("1.01")).toThrow();
  });
});
