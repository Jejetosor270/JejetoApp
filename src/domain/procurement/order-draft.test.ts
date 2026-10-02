import { describe, expect, it } from "vitest";

import {
  type OrderDraft,
  updateOrderDraftField,
} from "@/domain/procurement/order-draft";

describe("Order editor draft", () => {
  it("autofills purchase VAT from purchase HT without adding freight or selling markup", () => {
    const draft = {
      purchaseCost: "100",
      inputVatTaxableBase: "100",
      inputVatBaseIsManual: false,
      freight: "25",
      sellingPriceAmount: "150",
    } as OrderDraft;
    const changed = updateOrderDraftField(draft, "purchaseCost", "125.1234");
    expect(changed.inputVatTaxableBase).toBe("125.1234");
    expect(
      updateOrderDraftField(changed, "freight", "50").inputVatTaxableBase,
    ).toBe("125.1234");
  });
  it("keeps saved/manual bases including zero until explicitly reset to purchase HT", () => {
    const draft = {
      purchaseCost: "100",
      inputVatTaxableBase: "100",
      inputVatBaseIsManual: false,
    } as OrderDraft;
    const manual = updateOrderDraftField(draft, "inputVatTaxableBase", "0");
    const changed = updateOrderDraftField(manual, "purchaseCost", "250");
    expect(changed.inputVatTaxableBase).toBe("0");
    const reset = updateOrderDraftField(changed, "inputVatBaseIsManual", false);
    expect(reset.inputVatTaxableBase).toBe("250");
    expect(
      updateOrderDraftField(reset, "purchaseCost", "300").inputVatTaxableBase,
    ).toBe("300");
  });
  it("preserves unrelated employee-entered fields when one field is corrected", () => {
    const draft = {
      expectedDeliveryDate: "2026-12-18",
      notes: "Keep this employee note",
      orderNumber: "PO-DRAFT",
      outputVatRate: "20 points",
      packageName: "Edited package title",
      productMarkupOverridePercent: "30",
      purchaseCost: "87500.25",
    } as OrderDraft;

    const corrected = updateOrderDraftField(draft, "outputVatRate", "20");

    expect(corrected).toMatchObject({
      expectedDeliveryDate: "2026-12-18",
      notes: "Keep this employee note",
      orderNumber: "PO-DRAFT",
      outputVatRate: "20",
      packageName: "Edited package title",
      productMarkupOverridePercent: "30",
      purchaseCost: "87500.25",
    });
    expect(draft.outputVatRate).toBe("20 points");
  });
});
