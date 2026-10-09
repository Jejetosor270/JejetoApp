// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import {
  intakeOptions,
  intakeReview,
  reviewSupplierId,
} from "@/test/intake-review-fixture";

const actions = vi.hoisted(() => ({
  createQuoteSupplierAction: vi.fn(),
  confirmSupplierQuoteAction: vi.fn(),
  processSupplierQuoteAction: vi.fn(),
  previewSupplierOrderBillingAction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/orders/import/actions", () => actions);

import { QuoteReview } from "./quote-intake";

describe("Supplier creation from invoice review", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(async () => {
    vi.resetAllMocks();
    const review = intakeReview();
    review.supplierMatch = {
      basis: null,
      candidateIds: [],
      status: "NOT_FOUND",
      suggestedSupplierId: null,
    };
    view = await mountForm(
      createElement(QuoteReview, {
        options: intakeOptions(),
        review,
        withDocumentPreview: true,
      }),
    );
    await enter("orderNumber", "Reviewed furniture");
    await enter("purchaseCost", "1234.50");
  });
  afterEach(async () => {
    await view?.unmount();
  });

  it("defaults Domestic VAT to full recovery without replacing explicit percentages", async () => {
    await enter("inputVatTreatment", "DOMESTIC");
    expect(control("inputVatRecoverablePercent").value).toBe("100");
    await enter("inputVatRecoverablePercent", "40");
    await enter("inputVatTreatment", "IMPORT");
    await enter("inputVatTreatment", "DOMESTIC");
    expect(control("inputVatRecoverablePercent").value).toBe("40");
    await enter("inputVatRecoverablePercent", "0");
    await enter("inputVatTreatment", "DOMESTIC");
    expect(control("inputVatRecoverablePercent").value).toBe("0");
  });

  it("opens beside the selector even with evidence collapsed and preserves the Order draft after creation", async () => {
    const button = [...view.container.querySelectorAll("button")].find(
      (node) => node.textContent === "New Supplier",
    );
    expect(
      button?.parentElement?.querySelector('[name="supplierId"]'),
    ).not.toBeNull();
    expect(view.container.querySelector("details")?.open).toBe(false);
    await clickText("New Supplier");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(control("legalName").value).toBe(
      intakeReview().extraction.supplier.legalName.value,
    );
    expect(control("defaultCurrencyCode").value).toBe("EUR");
    expect(control("legalName").form).not.toBe(control("orderNumber").form);
    expect(document.querySelector("form form")).toBeNull();
    await enter("displayName", "Reviewed Supplier");
    actions.createQuoteSupplierAction.mockResolvedValue({
      status: "success",
      supplier: { id: "new-supplier", displayName: "Reviewed Supplier" },
    });
    await clickText("Create and select Supplier");
    expect(actions.createQuoteSupplierAction).toHaveBeenCalledOnce();
    expect(control("supplierId").value).toBe("new-supplier");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(control("orderNumber").value).toBe("Reviewed furniture");
    expect(control("purchaseCost").value).toBe("1 234.50");
    expect(actions.confirmSupplierQuoteAction).not.toHaveBeenCalled();
    expect(actions.processSupplierQuoteAction).not.toHaveBeenCalled();
  });

  it("preserves both drafts on validation failure and allows selecting a duplicate", async () => {
    await clickText("New Supplier");
    await enter("displayName", "Reviewed Supplier");
    actions.createQuoteSupplierAction.mockResolvedValueOnce({
      status: "error",
      message: "Review the Supplier details.",
      fieldErrors: { legalName: "Check legal name" },
    });
    await clickText("Create and select Supplier");
    expect(document.body.textContent).toContain("Check legal name");
    expect(control("displayName").value).toBe("Reviewed Supplier");
    expect(control("orderNumber").value).toBe("Reviewed furniture");
    await enter("legalName", "Corrected Supplier Ltd");
    actions.createQuoteSupplierAction.mockResolvedValueOnce({
      status: "duplicate",
      message: "Existing Supplier found.",
      duplicateCandidates: [
        {
          id: reviewSupplierId,
          displayName: "Fictional Supplier",
          basis: "VAT_NUMBER",
        },
      ],
    });
    await clickText("Create and select Supplier");
    await clickText("Use Fictional Supplier · vat number");
    expect(control("supplierId").value).toBe(reviewSupplierId);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(control("purchaseCost").value).toBe("1 234.50");
    expect(actions.confirmSupplierQuoteAction).not.toHaveBeenCalled();
  });

  it("closing Supplier creation leaves the import draft and selection intact", async () => {
    await clickText("New Supplier");
    await clickText("Close");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(control("supplierId").value).toBe("");
    expect(control("orderNumber").value).toBe("Reviewed furniture");
    expect(control("purchaseCost").value).toBe("1 234.50");
    expect(actions.createQuoteSupplierAction).not.toHaveBeenCalled();
  });
});
