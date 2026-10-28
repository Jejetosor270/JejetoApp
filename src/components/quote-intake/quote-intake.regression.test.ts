// @vitest-environment happy-dom
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import {
  intakeOptions,
  intakeReview,
  reviewBillingId,
  reviewOrderId,
} from "@/test/intake-review-fixture";

import {
  FreightTreatment,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { buildQuoteReviewProposal } from "@/domain/quote-intake/extraction";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

vi.mock("server-only", () => ({}));
const actions = vi.hoisted(() => ({ confirm: vi.fn(), preview: vi.fn() }));
vi.mock("@/app/(app)/orders/import/actions", () => ({
  confirmSupplierQuoteAction: actions.confirm,
  previewSupplierOrderBillingAction: actions.preview,
  processSupplierQuoteAction: vi.fn(),
}));
vi.mock("@/components/quote-intake/payment-schedule-editor", () => ({
  PaymentScheduleEditor: () => "Optional payment proposal",
}));
vi.mock("@/components/quote-intake/quote-item-review", () => ({
  QuoteItemReview: () => "Optional Item review",
}));
vi.mock("@/components/quote-intake/supplier-creation-form", () => ({
  QuoteSupplierCreationForm: () => "Create Supplier inline",
}));

import { QuoteReview } from "./quote-intake";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";

const options = {
  itemsEnabled: false,
  billingDocuments: [
    {
      allocatedHt: "0.0000",
      currencyCode: "EUR",
      documentType: "INVOICE",
      fxRateToReporting: null,
      id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: false,
      projectId,
      reference: "CLIENT-INV-1",
      shortDescription: "Living room furnishings",
      totalHt: "60000.0000",
    },
  ],
  currencies: [{ code: "EUR", name: "Euro" }],
  freightTreatments: Object.values(FreightTreatment),
  projects: [
    {
      buildings: [],
      defaultFreightMarkupRate: "0.000000",
      defaultOtherCostMarkupRate: "0.000000",
      defaultProductMarkupRate: "0.000000",
      id: projectId,
      name: "Test Project",
      reportingCurrencyCode: "EUR",
    },
  ],
  suppliers: [{ displayName: "Test Supplier", id: "supplier-1" }],
  vatRecoverabilities: Object.values(VatRecoverability),
  vatTreatments: Object.values(VatTreatment),
} satisfies QuoteIntakeOptions;

function review(supplierMatched: boolean) {
  const extraction = quoteExtractionFixture();
  extraction.quote.reference.value = "INV-2026-17";
  extraction.financials.goodsSubtotalHt.value = "50000";
  extraction.financials.freightHt = {
    diagnostic: null,
    status: "MISSING",
    value: null,
  };
  extraction.financials.totalHt.value = "50000";
  extraction.financials.vatLines[0]!.taxableBase.value = "50000";
  extraction.financials.vatLines[0]!.amount.value = "10000";
  extraction.financials.totalVat.value = "10000";
  extraction.financials.totalTtc.value = "60000";
  const proposal = buildQuoteReviewProposal(extraction);
  proposal.warnings.push("Totals require employee confirmation.");
  return {
    extraction,
    itemReview: null,
    model: "mock-model",
    orders: [],
    originalFilename: "supplier-invoice.pdf",
    projectId,
    proposal,
    provider: "mock-provider",
    requestId: "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
    supplierMatch: {
      basis: supplierMatched ? ("VAT_NUMBER" as const) : null,
      candidateIds: supplierMatched ? ["supplier-1"] : [],
      status: supplierMatched ? ("MATCHED" as const) : ("NOT_FOUND" as const),
      suggestedSupplierId: supplierMatched ? "supplier-1" : null,
    },
  };
}

describe("Supplier document review rendering", () => {
  let view: Awaited<ReturnType<typeof mountForm>> | undefined;
  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    vi.clearAllMocks();
  });
  const secondBillingId = "f12b6b9b-10e9-4e42-b93f-38796de4f65a";
  async function multiBillingReview() {
    const choices = intakeOptions();
    const first = choices.billingDocuments[0];
    if (!first) throw new Error("Billing fixture missing");
    choices.billingDocuments.push({
      ...first,
      id: secondBillingId,
      reference: "SECOND-INVOICE",
      currencyCode: "USD",
      fxRateToReporting: "2",
    });
    const draft = intakeReview(false);
    draft.orders = [
      {
        id: reviewOrderId,
        orderNumber: "Existing Order",
        packageName: "Existing Order",
      },
    ];
    view = await mountForm(
      createElement(QuoteReview, { options: choices, review: draft }),
    );
    await enter("orderNumber", "Reviewed Order");
    await enter("inputVatTreatment", "EXEMPT");
    await clickText("Add allocation");
    await enter("billingAllocations.0.billingDocumentId", reviewBillingId);
    await enter("billingAllocations.0.allocatedAmount", "100");
    await clickText("Add allocation");
    await enter("billingAllocations.1.billingDocumentId", secondBillingId);
    await enter("billingAllocations.1.allocatedAmount", "200");
    return view;
  }
  it("submits multiple allocations and keeps every row after a failed save", async () => {
    const mounted = await multiBillingReview();
    actions.confirm.mockResolvedValueOnce({
      status: "error",
      message: "Check Billing allocations.",
      fieldErrors: {
        "billingAllocations.1.allocatedAmount": "Available Billing changed.",
      },
    });
    const before = control("billingAllocations").value;
    await clickText("Confirm and save Order");
    expect(actions.confirm).toHaveBeenCalledOnce();
    const submitted = actions.confirm.mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(String(submitted.get("billingAllocations")))).toEqual([
      expect.objectContaining({
        billingDocumentId: reviewBillingId,
        allocatedAmount: "100",
      }),
      expect.objectContaining({
        billingDocumentId: secondBillingId,
        allocatedAmount: "200",
      }),
    ]);
    expect(control("billingAllocations").value).toBe(before);
    expect(mounted.container.textContent).toContain(
      "Available Billing changed.",
    );
    expect(mounted.container.textContent).toContain("57 500.00 EUR");
    expect(mounted.container.textContent).toContain("28 750.00 USD");
  });
  it("keeps reviewed pricing previews separate per Billing and invalidates them on Order changes", async () => {
    const mounted = await multiBillingReview();
    const update = mounted.container.querySelector<HTMLInputElement>(
      'input[name="action"][value="UPDATE"]',
    );
    if (!update) throw new Error("Update choice missing");
    await act(async () => update.click());
    await enter("orderId", reviewOrderId);
    actions.preview.mockImplementation(async (data: FormData) => ({
      amount:
        data.get("billingDocumentId") === reviewBillingId ? "60000" : "30000",
      message: "Reviewed basis ready.",
    }));
    const buttons = () =>
      [
        ...mounted.container.querySelectorAll<HTMLButtonElement>("button"),
      ].filter(
        (button) => button.textContent?.trim() === "Calculate Order basis",
      );
    await act(async () => buttons()[0]?.click());
    await act(async () => buttons()[1]?.click());
    expect(actions.preview).toHaveBeenCalledTimes(2);
    expect(
      actions.preview.mock.calls.map((call) =>
        (call[0] as FormData).get("billingDocumentId"),
      ),
    ).toEqual([reviewBillingId, secondBillingId]);
    expect(mounted.container.textContent).toContain("60 000.00 EUR");
    expect(mounted.container.textContent).toContain("30 000.00 USD");
    await enter("purchaseCost", "51000");
    expect(mounted.container.textContent).not.toContain(
      "Reviewed basis ready.",
    );
    expect(control("billingAllocations.0.allocatedAmount").value).toBe(
      "100.00",
    );
    expect(control("billingAllocations.1.allocatedAmount").value).toBe(
      "200.00",
    );
  });
  it("identifies Billing by reference, short description and amount within the selected Project", async () => {
    view = await mountForm(
      createElement(QuoteReview, {
        options: {
          ...options,
          billingDocuments: [
            ...options.billingDocuments,
            {
              ...options.billingDocuments[0]!,
              id: "other",
              projectId: "other-project",
              shortDescription: "Other Project description",
            },
          ],
        },
        review: review(true),
      }),
    );
    await clickText("Add allocation");
    expect(view.container.textContent).toContain(
      "CLIENT-INV-1 · Living room furnishings · 60 000.00 EUR",
    );
    expect(view.container.textContent).not.toContain(
      "Other Project description",
    );
  });
  it("keeps a clean reference and amount when Billing has no description", async () => {
    view = await mountForm(
      createElement(QuoteReview, {
        options: {
          ...options,
          billingDocuments: options.billingDocuments.map((document) => ({
            ...document,
            shortDescription: null,
          })),
        },
        review: review(true),
      }),
    );
    await clickText("Add allocation");
    expect(view.container.textContent).toContain(
      "CLIENT-INV-1 · 60 000.00 EUR",
    );
    expect(view.container.textContent).not.toContain("CLIENT-INV-1 · INVOICE");
  });
  it("renders a populated Invoice review without reading optional Billing state before initialization", () => {
    const html = renderToStaticMarkup(
      createElement(QuoteReview, { options, review: review(true) }),
    );

    expect(html).toContain("Review and correct");
    expect(html).toContain("supplier-invoice.pdf");
    expect(html).toContain("INV-2026-17");
    expect(html).toContain("50 000.00");
    expect(html).toContain("10 000.00");
    expect(html).toContain("60 000.00");
    expect(html).toContain("Confirm and save Order");
    expect(html).toContain("Totals require employee confirmation.");
  });

  it("renders Supplier selection and inline creation when no Supplier matched", () => {
    const html = renderToStaticMarkup(
      createElement(QuoteReview, { options, review: review(false) }),
    );

    expect(html).toContain("Choose Supplier");
    expect(html).toContain("Create Supplier inline");
    expect(html).toContain("Not Found");
  });

  it("uses the persistent confirmation form and keeps Billing allocation optional", () => {
    const html = renderToStaticMarkup(
      createElement(QuoteReview, { options, review: review(true) }),
    );

    expect(html).toContain('name="importRequestId"');
    expect(html).toContain('name="sourceDocumentType"');
    expect(html).toContain('value="INVOICE"');
    expect(html).toContain("Supplier document date · Quote");
    expect(html).not.toContain('name="applyLeadTime"');
    expect(html).toContain("Billing allocations");
    expect(html).toContain("Add allocation");
    expect(html).toContain('name="billingAllocations"');
    expect(html).toContain("Optional payment proposal");
  });
});
