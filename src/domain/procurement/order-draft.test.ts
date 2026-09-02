import { describe, expect, it } from "vitest";

import {
  type OrderDraft,
  updateOrderDraftField,
} from "@/domain/procurement/order-draft";

describe("Order editor draft", () => {
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
