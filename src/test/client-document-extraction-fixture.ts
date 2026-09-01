import type { ClientDocumentExtraction } from "@/domain/billing/extraction";

const missing = { diagnostic: null, status: "MISSING" as const, value: null };
const observed = <T>(value: T) => ({
  diagnostic: null,
  status: "EXTRACTED" as const,
  value,
});

export function clientDocumentExtractionFixture(): ClientDocumentExtraction {
  return {
    clientName: observed("Example Client"),
    currencyCode: observed("EUR"),
    documentDate: observed("2026-09-01"),
    documentType: observed("INVOICE"),
    dueDate: observed("2026-09-30"),
    notes: missing,
    paymentTerms: {
      installments: [
        {
          basis: "PERCENTAGE",
          dueDate: observed("2026-09-30"),
          fixedAmount: missing,
          label: observed("Deposit"),
          percentageRate: observed("1"),
          timingDescription: observed("Due within 30 days"),
        },
      ],
      raw: observed("100% within 30 days"),
    },
    projectReference: observed("DEMO-001"),
    reference: observed("INV-2026-014"),
    totalHt: observed("100000"),
    totalTtc: observed("120000"),
    vatAmount: observed("20000"),
    vatLines: [
      {
        amount: observed("20000"),
        label: observed("VAT 20%"),
        rate: observed("0.20"),
        taxableBase: observed("100000"),
      },
    ],
    warnings: [],
  };
}
