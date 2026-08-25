import type { SupplierQuoteExtraction } from "@/domain/quote-intake/extraction";

const missing = { diagnostic: null, status: "MISSING", value: null } as const;

export function quoteExtractionFixture(): SupplierQuoteExtraction {
  return {
    supplier: {
      legalName: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "Maison Exemple SAS",
      },
      displayName: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "Maison Exemple",
      },
      vatNumber: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "FR 12 345678901",
      },
      address: missing,
      email: missing,
      phone: missing,
    },
    quote: {
      reference: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "Q-2026-44",
      },
      quoteDate: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "2026-08-25",
      },
      validityDate: missing,
      currencyCode: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "EUR",
      },
    },
    financials: {
      goodsSubtotalHt: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "100000",
      },
      freightHt: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "5000",
      },
      freightRelationToTotal: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "ADDED_TO_TOTAL",
      },
      otherChargesHt: missing,
      totalHt: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "105000",
      },
      vatLines: [
        {
          label: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "VAT 20%",
          },
          taxableBase: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "105000",
          },
          rate: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "0.20",
          },
          amount: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "21000",
          },
        },
      ],
      totalVat: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "21000",
      },
      totalTtc: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "126000",
      },
    },
    leadTime: {
      raw: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "8 to 10 weeks",
      },
      minimumWeeks: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "8",
      },
      maximumWeeks: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "10",
      },
      productionTimeRaw: missing,
      expectedDeliveryRaw: missing,
      expectedDeliveryDate: missing,
    },
    paymentTerms: {
      raw: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "30% deposit, 70% before dispatch",
      },
      installments: [
        {
          label: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "Deposit",
          },
          basis: "PERCENTAGE",
          percentageRate: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "0.30",
          },
          fixedAmount: missing,
          timingDescription: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "On acceptance",
          },
          objectiveDueDate: missing,
        },
        {
          label: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "Balance",
          },
          basis: "PERCENTAGE",
          percentageRate: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "0.70",
          },
          fixedAmount: missing,
          timingDescription: {
            diagnostic: null,
            status: "EXTRACTED",
            value: "Before dispatch",
          },
          objectiveDueDate: missing,
        },
      ],
    },
    warnings: [],
  };
}
