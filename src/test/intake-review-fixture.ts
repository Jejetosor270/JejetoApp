import {
  FreightTreatment,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { buildQuoteReviewProposal } from "@/domain/quote-intake/extraction";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

export const reviewProjectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
export const reviewSupplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
export const reviewOrderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
export const reviewBillingId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";

export function intakeOptions(itemsEnabled = false): QuoteIntakeOptions {
  return {
    itemsEnabled,
    billingDocuments: [
      {
        allocatedHt: "0.0000",
        currencyCode: "EUR",
        documentType: "INVOICE",
        fxRateToReporting: null,
        id: reviewBillingId,
        isProjectRemainderApproved: false,
        projectId: reviewProjectId,
        reference: "FICTIONAL-INV-1",
        totalHt: "60000.0000",
      },
    ],
    currencies: [{ code: "EUR", name: "Euro" }],
    freightTreatments: Object.values(FreightTreatment),
    projects: [
      {
        buildings: [],
        defaultFreightMarkupRate: "0.15",
        defaultOtherCostMarkupRate: "0",
        defaultProductMarkupRate: "0.15",
        id: reviewProjectId,
        name: "Fictional Villa",
        reportingCurrencyCode: "EUR",
      },
    ],
    suppliers: [{ displayName: "Fictional Supplier", id: reviewSupplierId }],
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}

export function intakeReview(
  vat = true,
  withItems = false,
): ProcessedQuoteReview & { requestId: string } {
  const extraction = quoteExtractionFixture();
  extraction.financials.goodsSubtotalHt.value = "50000";
  extraction.financials.freightHt = {
    status: "MISSING",
    value: null,
    diagnostic: null,
  };
  extraction.financials.totalHt.value = "50000";
  const vatLine = extraction.financials.vatLines[0];
  if (!vatLine) throw new Error("Fixture needs VAT line");
  vatLine.taxableBase.value = "50000";
  vatLine.rate.value = vat ? "0.20" : "0";
  vatLine.amount.value = vat ? "10000" : "0";
  extraction.financials.totalVat.value = vat ? "10000" : "0";
  extraction.financials.totalTtc.value = vat ? "60000" : "50000";
  return {
    extraction,
    proposal: buildQuoteReviewProposal(extraction),
    model: "mock-model",
    provider: "mock-provider",
    orders: [],
    originalFilename: "fictional-supplier-invoice.pdf",
    projectId: reviewProjectId,
    requestId: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
    supplierMatch: {
      basis: "VAT_NUMBER",
      candidateIds: [reviewSupplierId],
      status: "MATCHED",
      suggestedSupplierId: reviewSupplierId,
    },
    itemReview: withItems
      ? {
          currencyCode: "EUR",
          itemTotalHt: "50000.0000",
          model: "mock-model",
          orderSubtotalHt: "50000.0000",
          provider: "mock-provider",
          warnings: [],
          rows: [
            {
              action: "CREATE",
              brand: null,
              buildingId: null,
              category: null,
              description: "Employee-reviewed description",
              diffs: [],
              existingItemId: null,
              finishColor: null,
              include: true,
              itemReference: "CHAIR-A",
              name: "Fictional chair",
              notes: null,
              quantity: "1",
              roomId: null,
              supplierSku: null,
              totalPriceHt: "50000",
              unitOfMeasure: "EA",
              unitPriceHt: "50000",
              vatRate: "0.2",
              volumeEach: null,
              weightEach: null,
              warnings: [],
            },
          ],
        }
      : null,
  };
}
