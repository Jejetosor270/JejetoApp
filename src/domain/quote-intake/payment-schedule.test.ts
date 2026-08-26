import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  calculateQuoteSupplierPayable,
  reconcileQuoteScheduleDraft,
} from "@/domain/quote-intake/payment-schedule";

describe("quote payment schedule draft reconciliation", () => {
  it("reuses the supplier payable VAT basis", () => {
    expect(
      calculateQuoteSupplierPayable({
        applyInputVat: true,
        inputVatAmount: "",
        inputVatRatePercent: "20",
        inputVatTaxableBase: "100,000.00",
        inputVatTreatment: "DOMESTIC",
        purchaseCost: "100,000.00",
      }).toFixed(4),
    ).toBe("120000.0000");
  });

  it("reconciles a manually split 30/40/30 schedule", () => {
    const summary = reconcileQuoteScheduleDraft(new Decimal("100000"), [
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "30" },
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "40" },
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "30" },
    ]);
    expect(summary).toMatchObject({
      isReconciled: true,
      overallocated: "0.0000",
      scheduled: "100000.0000",
      scheduledPercentage: "100",
      unscheduled: "0.0000",
    });
  });

  it("reports under-allocation without normalizing user input", () => {
    const summary = reconcileQuoteScheduleDraft("100000", [
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "30" },
    ]);
    expect(summary.scheduledPercentage).toBe("30");
    expect(summary.unscheduled).toBe("70000.0000");
    expect(summary.isReconciled).toBe(false);
  });

  it("reports over-allocation without normalizing user input", () => {
    const summary = reconcileQuoteScheduleDraft("100000", [
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "60" },
      { basis: "PERCENTAGE", fixedAmount: "", percentagePercent: "50" },
    ]);
    expect(summary.scheduledPercentage).toBe("110");
    expect(summary.overallocated).toBe("10000.0000");
    expect(summary.isReconciled).toBe(false);
  });
});
