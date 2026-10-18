import { describe, expect, it } from "vitest";

import {
  type OrderDraft,
  manualPurchaseVatNeedsReview,
  updateOrderDraftField,
} from "@/domain/procurement/order-draft";

describe("Order editor draft", () => {
  it("autofills purchase VAT from selected HT costs without selling markup", () => {
    const draft = {
      purchaseCost: "100",
      inputVatTaxableBase: "100",
      inputVatBaseIsManual: false,
      freight: "25",
      sellingPriceAmount: "150",
    } as OrderDraft;
    const changed = updateOrderDraftField(draft, "purchaseCost", "125.1234");
    expect(changed.inputVatTaxableBase).toBe("150.1234");
    expect(
      updateOrderDraftField(changed, "freight", "50").inputVatTaxableBase,
    ).toBe("175.1234");
  });
  it("keeps saved/manual bases including zero until explicitly reset to selected costs", () => {
    const draft = {
      purchaseCost: "100",
      inputVatTaxableBase: "100",
      inputVatBaseIsManual: false,
    } as OrderDraft;
    const manual = updateOrderDraftField(draft, "inputVatTaxableBase", "0");
    const changed = updateOrderDraftField(manual, "purchaseCost", "250");
    expect(changed.inputVatTaxableBase).toBe("0");
    expect(manualPurchaseVatNeedsReview(changed)).toBe(true);
    expect(
      manualPurchaseVatNeedsReview(
        updateOrderDraftField(changed, "purchaseCost", "100"),
      ),
    ).toBe(false);
    const reset = updateOrderDraftField(changed, "inputVatBaseIsManual", false);
    expect(reset.inputVatTaxableBase).toBe("250");
    expect(manualPurchaseVatNeedsReview(reset)).toBe(false);
    expect(
      updateOrderDraftField(reset, "purchaseCost", "300").inputVatTaxableBase,
    ).toBe("300");
  });
  it("preserves manual bases and amount overrides when changing taxable selections", () => {
    const draft = {
      purchaseCost: "100",
      freight: "25",
      inputVatTaxableBase: "80",
      inputVatAmount: "16",
      inputVatBaseIsManual: true,
    } as OrderDraft;
    const selected = updateOrderDraftField(draft, "inputVatTaxableCosts", [
      "freight",
    ]);
    expect(selected.inputVatTaxableBase).toBe("80");
    expect(selected.inputVatAmount).toBe("16");
    const reset = updateOrderDraftField(
      selected,
      "inputVatBaseIsManual",
      false,
    );
    expect(reset.inputVatTaxableBase).toBe("25");
    expect(reset.inputVatAmount).toBe("16");
    const changed = updateOrderDraftField(reset, "purchaseCost", "200");
    expect(changed.inputVatTaxableBase).toBe("25");
  });
  it("clears a manual-base warning only after the employee reviews the base", () => {
    const manual = updateOrderDraftField(
      { purchaseCost: "100" } as OrderDraft,
      "inputVatTaxableBase",
      "100",
    );
    const changed = updateOrderDraftField(manual, "freight", "25");
    expect(manualPurchaseVatNeedsReview(changed)).toBe(true);
    const reviewed = updateOrderDraftField(
      changed,
      "inputVatTaxableBase",
      "100",
    );
    expect(manualPurchaseVatNeedsReview(reviewed)).toBe(false);
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
