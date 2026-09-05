import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  FreightTreatment,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { buildQuoteReviewProposal } from "@/domain/quote-intake/extraction";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(app)/orders/import/actions", () => ({
  confirmSupplierQuoteAction: vi.fn(),
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
    expect(html).toContain("Confirm and save Supplier Order");
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
    expect(html).toContain("Optional Client Billing reconciliation");
    expect(html).toContain("Skip for now");
    expect(html).toContain("Optional payment proposal");
  });
});
