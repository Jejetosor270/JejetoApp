import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildQuoteReviewProposal } from "@/domain/quote-intake/extraction";
import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const processing = vi.hoisted(() => ({ processSupplierQuote: vi.fn() }));
const itemProvider = vi.hoisted(() => ({
  getItemExtractionProvider: vi.fn(),
}));
const extractor = vi.hoisted(() => ({ getQuoteExtractionProvider: vi.fn() }));
const settings = vi.hoisted(() => ({ isItemManagementEnabled: vi.fn() }));
const lifecycle = vi.hoisted(() => ({
  logSupplierOrderImportLifecycle: vi.fn(),
}));
const guard = vi.hoisted(() => ({ withQuoteExtractionGuard: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/quote-intake/process", () => ({
  ...processing,
  QuoteProcessingError: class QuoteProcessingError extends Error {},
}));
vi.mock("@/lib/items/extraction-provider", () => ({
  ...itemProvider,
  ItemExtractionProviderError: class ItemExtractionProviderError extends Error {},
}));
vi.mock("@/lib/quote-intake/extractor", () => extractor);
vi.mock("@/lib/settings/application-settings", () => settings);
vi.mock("@/lib/quote-intake/lifecycle", () => lifecycle);
vi.mock("@/lib/env/quote-extraction", () => ({
  getQuoteExtractionModel: () => "mock-model",
}));
vi.mock("@/lib/quote-intake/operational-guard", () => ({
  ...guard,
  QuoteExtractionBusyError: class QuoteExtractionBusyError extends Error {},
}));

import { processSupplierQuoteAction } from "./actions";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";

function review(
  filename: string,
  supplierMatched = true,
): ProcessedQuoteReview {
  const extraction = quoteExtractionFixture();
  return {
    extraction,
    itemReview: null,
    model: "mock-model",
    orders: [],
    originalFilename: filename,
    projectId,
    proposal: buildQuoteReviewProposal(extraction),
    provider: "mock-provider",
    supplierMatch: {
      basis: supplierMatched ? "VAT_NUMBER" : null,
      candidateIds: supplierMatched ? ["supplier-1"] : [],
      status: supplierMatched ? "MATCHED" : "NOT_FOUND",
      suggestedSupplierId: supplierMatched ? "supplier-1" : null,
    },
  };
}

function upload(filename: string): FormData {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set(
    "quoteFile",
    new File(["%PDF-1"], filename, { type: "application/pdf" }),
  );
  return formData;
}

describe("Supplier Order processing action lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireMasterDataEditor.mockResolvedValue({ id: "actor-1" });
    settings.isItemManagementEnabled.mockResolvedValue(false);
    extractor.getQuoteExtractionProvider.mockReturnValue({ provider: true });
    itemProvider.getItemExtractionProvider.mockReturnValue({ items: true });
    guard.withQuoteExtractionGuard.mockImplementation(
      async (_actorId: string, operation: () => Promise<unknown>) =>
        operation(),
    );
  });

  it.each(["supplier-invoice.pdf", "supplier-quote.pdf"])(
    "returns a populated review for %s",
    async (filename) => {
      processing.processSupplierQuote.mockResolvedValue(review(filename));

      const result = await processSupplierQuoteAction({}, upload(filename));

      expect(result).toMatchObject({
        status: "ready",
        review: {
          originalFilename: filename,
          requestId: expect.any(String),
        },
      });
      expect(itemProvider.getItemExtractionProvider).not.toHaveBeenCalled();
      expect(processing.processSupplierQuote).toHaveBeenCalledWith(
        projectId,
        expect.any(File),
        { provider: true },
        undefined,
      );
      expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
        "supplier_order_import.review_built",
        expect.objectContaining({
          extractionStatus: "completed",
          supplierMatched: true,
        }),
      );
    },
  );

  it("keeps unmatched Supplier extraction in review", async () => {
    const unmatched = review("supplier-invoice.pdf", false);
    unmatched.proposal.warnings.push("Select or create a Supplier.");
    processing.processSupplierQuote.mockResolvedValue(unmatched);

    const result = await processSupplierQuoteAction(
      {},
      upload("supplier-invoice.pdf"),
    );

    expect(result.status).toBe("ready");
    expect(result.review?.supplierMatch.status).toBe("NOT_FOUND");
    expect(result.review?.proposal.warnings).toContain(
      "Select or create a Supplier.",
    );
  });

  it("does not make Item extraction mandatory when the Beta is disabled", async () => {
    processing.processSupplierQuote.mockResolvedValue(
      review("supplier-quote.pdf"),
    );

    await processSupplierQuoteAction({}, upload("supplier-quote.pdf"));

    expect(itemProvider.getItemExtractionProvider).not.toHaveBeenCalled();
  });

  it("passes the optional Item provider only when the Beta is enabled", async () => {
    settings.isItemManagementEnabled.mockResolvedValue(true);
    processing.processSupplierQuote.mockResolvedValue(
      review("supplier-quote.pdf"),
    );

    await processSupplierQuoteAction({}, upload("supplier-quote.pdf"));

    expect(itemProvider.getItemExtractionProvider).toHaveBeenCalledTimes(1);
    expect(processing.processSupplierQuote).toHaveBeenCalledWith(
      projectId,
      expect.any(File),
      { provider: true },
      { items: true },
    );
  });
});
