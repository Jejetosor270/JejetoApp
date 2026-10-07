import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  buildMonthlyCashFlow,
  calculateCashPosition,
  calculateDirectionPaymentSummary,
  calculateProjectFinancialSummary,
  calculateReportingOrder,
  cashFlowChartScale,
  cashFlowRange,
  daysOverdue,
  type ReportingInstallmentInput,
  type ReportingOrderInput,
} from "./calculations";
import { summarizeSupplierCredits } from "@/domain/finance/supplier-credit-reporting";

function order(
  id: string,
  values: {
    economicCost: string;
    inputVat?: string;
    inputVatRecoverability?: string;
    inputVatRecoverableRate?: string;
    outputVat?: string;
    purchaseCost: string;
    sales: string;
  },
): ReportingOrderInput {
  return {
    clientReceivable: {
      outputVatAmount: values.outputVat ?? null,
      sellingRevenue: values.sales,
    },
    cost: {
      customsDuties: "0",
      economicLandedCost: values.economicCost,
      freight: "0",
      landedCost: values.purchaseCost,
      miscellaneous: "0",
      purchaseCost: values.purchaseCost,
    },
    freightResaleAmount: null,
    freightTreatment: "NOT_APPLICABLE",
    id,
    inputVat: values.inputVat
      ? {
          amount: values.inputVat,
          recoverability: values.inputVatRecoverability ?? "RECOVERABLE",
          recoverableRate: values.inputVatRecoverableRate ?? null,
          treatment: "DOMESTIC",
        }
      : null,
    orderCurrencyCode: "EUR",
    outputVat: values.outputVat ? { amount: values.outputVat } : null,
    packageSellingPrice: values.sales,
    purchaseFxRate: null,
    reportingCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    sellingFxRate: null,
    supplierPayable: {
      inputVatAmount: values.inputVat ?? null,
      inputVatTreatment: values.inputVat ? "DOMESTIC" : null,
      supplierPurchase: values.purchaseCost,
    },
    totalSellingRevenue: values.sales,
  };
}

it("reports full Supplier cost with independent FX and unchanged economic profit", () => {
  const source = order("freight", {
    purchaseCost: "3450",
    economicCost: "3730",
    inputVat: "746",
    sales: "4807",
  });
  source.cost.freight = "280";
  source.cost.landedCost = "3730";
  source.orderCurrencyCode = "USD";
  source.purchaseFxRate = "0.9";
  const result = calculateReportingOrder(source);
  expect(result.supplierPayable?.toFixed(2)).toBe("4028.40");
  expect(result.economicLandedCost?.toFixed(2)).toBe("3357.00");
  expect(result.grossProfit?.toFixed(2)).toBe("1450.00");
  source.purchaseFxRate = null;
  expect(calculateReportingOrder(source).supplierPayable).toBeNull();
});

function installment(
  overrides: Partial<ReportingInstallmentInput> = {},
): ReportingInstallmentInput {
  return {
    currencyCode: "EUR",
    direction: "CLIENT_RECEIPT",
    dueDate: "2026-09-01",
    expectedFxRate: null,
    id: "installment-1",
    isCancelled: false,
    orderId: "order-1",
    outstandingAmount: "60",
    scheduledAmount: "100",
    settlements: [
      {
        actualFxRate: null,
        amount: "40",
        id: "settlement-1",
        settledAt: "2026-08-31",
      },
    ],
    status: "UPCOMING",
    ...overrides,
  };
}

it("reduces reporting cost and deductible VAT at credit FX without repricing the sale", () => {
  const input = order("credited", {
    purchaseCost: "100",
    economicCost: "110",
    inputVat: "20",
    inputVatRecoverability: "PARTIALLY_RECOVERABLE",
    inputVatRecoverableRate: "0.5",
    sales: "200",
  });
  input.orderCurrencyCode = "USD";
  input.purchaseFxRate = "0.9";
  input.supplierCredits = summarizeSupplierCredits(
    [
      {
        isCancelled: false,
        totalHt: "20",
        vatAmount: "4",
        supplierRecoverableRate: "0.5",
        currencyCode: "USD",
        reportingCurrencyCode: "EUR",
        fxRateToReporting: "0.8",
        refunds: [],
      },
    ],
    "EUR",
  );
  const result = calculateProjectFinancialSummary([input]);
  expect(result.totals.economicLandedCost.value.toString()).toBe("81.4");
  expect(result.totals.purchaseCost.value.toString()).toBe("74");
  expect(result.totals.inputVat.value.toString()).toBe("14.8");
  expect(result.totals.recoverableInputVat.value.toString()).toBe("7.4");
  expect(result.totals.salesRevenue.value.toString()).toBe("200");
  expect(result.grossProfit?.toString()).toBe("118.6");
});

describe("project financial reporting", () => {
  it("calculates margin from aggregate values instead of averaging order rates", () => {
    const result = calculateProjectFinancialSummary([
      order("a", { economicCost: "80", purchaseCost: "80", sales: "100" }),
      order("b", {
        economicCost: "810",
        purchaseCost: "810",
        sales: "900",
      }),
    ]);

    expect(result.totals.purchaseCost.value.toString()).toBe("890");
    expect(result.totals.landedCost.value.toString()).toBe("890");
    expect(result.totals.economicLandedCost.value.toString()).toBe("890");
    expect(result.totals.salesRevenue.value.toString()).toBe("1000");
    expect(result.grossProfit?.toString()).toBe("110");
    expect(result.grossMarginRate?.toString()).toBe("0.11");
    expect(result.markupRate?.toString()).toBe(
      new Decimal(110).dividedBy(890).toString(),
    );
  });

  it("keeps recoverable VAT out of economic cost and includes TTC in cash bases", () => {
    const result = calculateProjectFinancialSummary([
      order("a", {
        economicCost: "80",
        inputVat: "16",
        inputVatRecoverability: "RECOVERABLE",
        outputVat: "20",
        purchaseCost: "80",
        sales: "100",
      }),
    ]);
    const contribution = result.orders[0];

    expect(contribution?.economicLandedCost?.toString()).toBe("80");
    expect(contribution?.recoverableInputVat?.toString()).toBe("16");
    expect(contribution?.nonRecoverableInputVat?.toString()).toBe("0");
    expect(contribution?.supplierPayable?.toString()).toBe("96");
    expect(contribution?.clientReceivable?.toString()).toBe("120");
    expect(result.totals.outputVat.value.toString()).toBe("20");
    expect(result.totals.salesRevenue.value.toString()).toBe("100");
    expect(result.grossProfit?.toString()).toBe("20");
  });

  it("includes non-recoverable VAT only through economic cost", () => {
    const result = calculateProjectFinancialSummary([
      order("a", {
        economicCost: "96",
        inputVat: "16",
        inputVatRecoverability: "NON_RECOVERABLE",
        purchaseCost: "80",
        sales: "120",
      }),
    ]);

    expect(result.orders[0]?.nonRecoverableInputVat?.toString()).toBe("16");
    expect(result.grossProfit?.toString()).toBe("24");
  });

  it("aggregates only the deductible share of partial input VAT", () => {
    const result = calculateProjectFinancialSummary([
      order("a", {
        economicCost: "84",
        inputVat: "10",
        inputVatRecoverability: "PARTIALLY_RECOVERABLE",
        inputVatRecoverableRate: "0.60",
        purchaseCost: "80",
        sales: "100",
      }),
    ]);

    expect(result.orders[0]?.recoverableInputVat?.toString()).toBe("6");
    expect(result.orders[0]?.nonRecoverableInputVat?.toString()).toBe("4");
  });

  it("flags missing foreign-currency FX instead of adding unlike currencies", () => {
    const foreign = order("foreign", {
      economicCost: "80",
      purchaseCost: "80",
      sales: "100",
    });
    foreign.orderCurrencyCode = "USD";
    foreign.sellingCurrencyCode = "USD";
    const result = calculateProjectFinancialSummary([foreign]);

    expect(result.complete).toBe(false);
    expect(result.missingOrderIds).toEqual(["foreign"]);
    expect(result.grossProfit).toBeNull();
    expect(result.totals.purchaseCost.value.toString()).toBe("0");
    expect(result.totals.purchaseCost.missingIds).toEqual(["foreign"]);
  });

  it("converts purchase and sale values independently", () => {
    const foreign = order("foreign", {
      economicCost: "80",
      purchaseCost: "80",
      sales: "100",
    });
    foreign.orderCurrencyCode = "USD";
    foreign.purchaseFxRate = "0.8";
    foreign.sellingCurrencyCode = "GBP";
    foreign.sellingFxRate = "1.2";
    const result = calculateProjectFinancialSummary([foreign]);

    expect(result.totals.economicLandedCost.value.toString()).toBe("64");
    expect(result.totals.salesRevenue.value.toString()).toBe("120");
    expect(result.grossProfit?.toString()).toBe("56");
  });
});

describe("payment reporting and cash flow", () => {
  it("distinguishes scheduled outstanding, unscheduled, remaining and overdue", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [{ amount: new Decimal(150), orderId: "order-1" }],
      direction: "CLIENT_RECEIPT",
      installments: [installment({ status: "OVERDUE" })],
      reportingCurrencyCode: "EUR",
    });

    expect(result.scheduled.value.toString()).toBe("100");
    expect(result.paid.value.toString()).toBe("40");
    expect(result.scheduledOutstanding.value.toString()).toBe("60");
    expect(result.unscheduled?.toString()).toBe("50");
    expect(result.totalRemaining?.toString()).toBe("110");
    expect(result.overdue.value.toString()).toBe("60");
  });

  it("keeps reporting incomplete when installment or settlement FX is missing", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [{ amount: new Decimal(100), orderId: "order-1" }],
      direction: "CLIENT_RECEIPT",
      installments: [installment({ currencyCode: "USD" })],
      reportingCurrencyCode: "EUR",
    });

    expect(result.scheduled.missingIds).toEqual(["installment-1"]);
    expect(result.paid.missingIds).toEqual(["settlement-1"]);
    expect(result.unscheduled).toBeNull();
    expect(result.totalRemaining).toBeNull();
  });

  it("converts expected and actual foreign cash with their independent FX rates", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: new Decimal(100),
          currencyCode: "USD",
          expectedFxRate: "0.8",
          orderId: "order-1",
          originalAmount: "125",
        },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.8",
          settlements: [
            {
              actualFxRate: "0.75",
              amount: "40",
              id: "settlement-1",
              settledAt: "2026-08-31",
            },
          ],
        }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.scheduled.value.toString()).toBe("80");
    expect(result.scheduledOutstanding.value.toString()).toBe("48");
    expect(result.paid.value.toString()).toBe("30");
    expect(result.unscheduled?.toString()).toBe("20");
    expect(result.totalRemaining?.toString()).toBe("68");
  });

  it.each([
    { paid: "100", outstanding: "0", actual: "70", remaining: "0" },
    { paid: "40", outstanding: "60", actual: "28", remaining: "48" },
  ])(
    "values the original $outstanding balance independently of actual payment FX",
    ({ paid, outstanding, actual, remaining }) => {
      const result = calculateDirectionPaymentSummary({
        bases: [
          {
            amount: new Decimal(90),
            currencyCode: "USD",
            expectedFxRate: "0.9",
            orderId: "order-1",
            originalAmount: "100",
          },
        ],
        direction: "SUPPLIER_PAYMENT",
        installments: [
          installment({
            currencyCode: "USD",
            direction: "SUPPLIER_PAYMENT",
            expectedFxRate: "0.8",
            outstandingAmount: outstanding,
            settlements: [
              {
                actualFxRate: "0.7",
                amount: paid,
                id: "settlement-1",
                settledAt: "2026-08-31",
              },
            ],
          }),
        ],
        reportingCurrencyCode: "EUR",
      });

      expect(result.paid.value.toString()).toBe(actual);
      expect(result.scheduledOutstanding.value.toString()).toBe(remaining);
      expect(result.totalRemaining?.toString()).toBe(remaining);
      expect(result.unscheduled?.toString()).toBe("0");
    },
  );

  it("keeps known obligations complete when only actual payment FX is missing", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: new Decimal(135),
          currencyCode: "USD",
          expectedFxRate: "0.9",
          orderId: "order-1",
          originalAmount: "150",
        },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({ currencyCode: "USD", expectedFxRate: "0.8" }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.paid.missingIds).toEqual(["settlement-1"]);
    expect(result.scheduledOutstanding.value.toString()).toBe("48");
    expect(result.unscheduled?.toString()).toBe("45");
    expect(result.totalRemaining?.toString()).toBe("93");
  });

  it.each([
    { originalAmount: "100", termFx: null, orderFx: "0.9" },
    { originalAmount: "150", termFx: "0.8", orderFx: null },
  ])(
    "keeps a nonzero obligation incomplete without its required expected FX: %j",
    ({ originalAmount, termFx, orderFx }) => {
      const result = calculateDirectionPaymentSummary({
        bases: [
          {
            amount: new Decimal(90),
            currencyCode: "USD",
            expectedFxRate: orderFx,
            orderId: "order-1",
            originalAmount,
          },
        ],
        direction: "CLIENT_RECEIPT",
        installments: [
          installment({
            currencyCode: "USD",
            expectedFxRate: termFx,
            settlements: [
              {
                actualFxRate: "0.7",
                amount: "40",
                id: "settlement-1",
                settledAt: "2026-08-31",
              },
            ],
          }),
        ],
        reportingCurrencyCode: "EUR",
      });

      expect(result.paid.missingIds).toEqual([]);
      expect(result.totalRemaining).toBeNull();
    },
  );

  it("needs no FX for a known fully settled original-currency obligation", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: null,
          currencyCode: "USD",
          expectedFxRate: null,
          orderId: "order-1",
          originalAmount: "100",
        },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({
          currencyCode: "USD",
          outstandingAmount: "0",
          settlements: [
            {
              actualFxRate: null,
              amount: "100",
              id: "settlement-1",
              settledAt: "2026-08-31",
            },
          ],
        }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.base.missingIds).toEqual(["order-1"]);
    expect(result.paid.missingIds).toEqual(["settlement-1"]);
    expect(result.scheduled.missingIds).toEqual(["installment-1"]);
    expect(result.scheduledOutstanding.missingIds).toEqual([]);
    expect(result.totalRemaining?.toString()).toBe("0");
    expect(result.unscheduled?.toString()).toBe("0");
  });

  it("caps remaining terms at the credit-adjusted original obligation", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: new Decimal(74),
          currencyCode: "USD",
          expectedFxRate: "0.9",
          orderId: "order-1",
          originalAmount: "80",
          paidAmount: "40",
        },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.8",
          status: "OVERDUE",
        }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.scheduled.value.toString()).toBe("80");
    expect(result.scheduledOutstanding.value.toString()).toBe("32");
    expect(result.overdue.value.toString()).toBe("32");
    expect(result.totalRemaining?.toString()).toBe("32");
  });

  it.each([false, true])(
    "caps same-date terms by ID regardless of their input order (reversed: %s)",
    (reversed) => {
      const terms = [
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.8",
          id: "term-a",
          outstandingAmount: "50",
          scheduledAmount: "50",
          settlements: [],
        }),
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.9",
          id: "term-b",
          outstandingAmount: "50",
          scheduledAmount: "50",
          settlements: [],
        }),
      ];
      const result = calculateDirectionPaymentSummary({
        bases: [
          {
            amount: new Decimal(45),
            currencyCode: "USD",
            expectedFxRate: "0.9",
            orderId: "order-1",
            originalAmount: "50",
            paidAmount: "0",
          },
        ],
        direction: "CLIENT_RECEIPT",
        installments: reversed ? terms.toReversed() : terms,
        reportingCurrencyCode: "EUR",
      });

      expect(result.scheduledOutstanding.value.toString()).toBe("40");
      expect(result.totalRemaining?.toString()).toBe("40");
      expect(result.unscheduled?.toString()).toBe("0");
    },
  );

  it("retains settlements on cancelled terms and converts only the remaining schedule", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: new Decimal(135),
          currencyCode: "USD",
          expectedFxRate: "0.9",
          orderId: "order-1",
          originalAmount: "150",
        },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.8",
          isCancelled: true,
          settlements: [
            {
              actualFxRate: "0.7",
              amount: "40",
              id: "settlement-1",
              settledAt: "2026-08-31",
            },
          ],
        }),
        installment({
          currencyCode: "USD",
          expectedFxRate: "0.8",
          id: "active-term",
          outstandingAmount: "50",
          scheduledAmount: "50",
          settlements: [],
        }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.paid.value.toString()).toBe("28");
    expect(result.scheduled.value.toString()).toBe("40");
    expect(result.scheduledOutstanding.value.toString()).toBe("40");
    expect(result.unscheduled?.toString()).toBe("54");
    expect(result.totalRemaining?.toString()).toBe("94");
  });

  it.each([
    { currencyCode: "GBP", originalAmount: "100" },
    { currencyCode: "USD", originalAmount: null },
    {},
  ])(
    "does not infer original balances across unlike or unknown currencies: %j",
    (context) => {
      const result = calculateDirectionPaymentSummary({
        bases: [{ amount: new Decimal(90), orderId: "order-1", ...context }],
        direction: "CLIENT_RECEIPT",
        installments: [
          installment({ currencyCode: "USD", expectedFxRate: "0.8" }),
        ],
        reportingCurrencyCode: "EUR",
      });

      expect(result.scheduledOutstanding.missingIds).toEqual(["installment-1"]);
      expect(result.totalRemaining).toBeNull();
      expect(result.unscheduled).toBeNull();
    },
  );

  it("does not offset another Order's obligation with credited overpayment", () => {
    const result = calculateDirectionPaymentSummary({
      bases: [
        {
          amount: new Decimal(60),
          orderId: "order-1",
          originalAmount: "60",
          paidAmount: "80",
        },
        { amount: new Decimal(100), orderId: "order-2" },
      ],
      direction: "CLIENT_RECEIPT",
      installments: [
        installment({
          outstandingAmount: "0",
          settlements: [
            {
              actualFxRate: null,
              amount: "100",
              id: "settlement-1",
              settledAt: "2026-08-31",
            },
          ],
        }),
      ],
      reportingCurrencyCode: "EUR",
    });

    expect(result.paid.value.toString()).toBe("100");
    expect(result.totalRemaining?.toString()).toBe("100");
    expect(result.unscheduled?.toString()).toBe("100");
  });

  it("forecasts only outstanding partial balances and uses actual settlement dates", () => {
    const rows = buildMonthlyCashFlow({
      end: "2026-09-30",
      installments: [installment()],
      reportingCurrencyCode: "EUR",
      start: "2026-08-01",
    });

    expect(rows[0]?.month).toBe("2026-08");
    expect(rows[0]?.actualIn.toString()).toBe("40");
    expect(rows[0]?.expectedIn.toString()).toBe("0");
    expect(rows[1]?.month).toBe("2026-09");
    expect(rows[1]?.expectedIn.toString()).toBe("60");
  });

  it("groups date-only cash at month and year boundaries without timezone shifts", () => {
    const rows = buildMonthlyCashFlow({
      end: "2027-01-01",
      installments: [
        installment({
          dueDate: "2026-12-31",
          id: "december",
          outstandingAmount: "10",
          settlements: [],
        }),
        installment({
          dueDate: "2027-01-01",
          id: "january",
          outstandingAmount: "20",
          settlements: [],
        }),
      ],
      reportingCurrencyCode: "EUR",
      start: "2026-12-31",
    });

    expect(rows.map((row) => [row.month, row.expectedIn.toString()])).toEqual([
      ["2026-12", "10"],
      ["2027-01", "20"],
    ]);
  });

  it("calculates expected and actual net cash flow by direction", () => {
    const rows = buildMonthlyCashFlow({
      end: "2026-09-30",
      installments: [
        installment({ settlements: [] }),
        installment({
          direction: "SUPPLIER_PAYMENT",
          id: "supplier",
          outstandingAmount: "25",
          scheduledAmount: "25",
          settlements: [
            {
              actualFxRate: null,
              amount: "5",
              id: "supplier-payment",
              settledAt: "2026-09-02",
            },
          ],
        }),
      ],
      reportingCurrencyCode: "EUR",
      start: "2026-09-01",
    });

    expect(rows[0]?.expectedNet.toString()).toBe("35");
    expect(rows[0]?.actualNet.toString()).toBe("-5");
  });

  it("defines cash position as client cash received minus supplier cash paid", () => {
    expect(
      calculateCashPosition(
        { missingIds: [], value: new Decimal(70) },
        { missingIds: [], value: new Decimal(90) },
      )?.toString(),
    ).toBe("-20");
    expect(
      calculateCashPosition(
        { missingIds: ["missing"], value: new Decimal(70) },
        { missingIds: [], value: new Decimal(90) },
      ),
    ).toBeNull();
  });

  it("builds exact horizon endpoints and overdue days", () => {
    expect(cashFlowRange("2026-08-24", "30d")).toEqual({
      end: "2026-09-22",
      start: "2026-08-24",
    });
    expect(cashFlowRange("2026-08-24", "6m")).toEqual({
      end: "2027-02-23",
      start: "2026-08-24",
    });
    expect(daysOverdue("2026-08-01", "2026-08-24")).toBe(23);
  });

  it("scales the chart with Decimal calculations", () => {
    const rows = buildMonthlyCashFlow({
      end: "2026-09-30",
      installments: [installment({ settlements: [] })],
      reportingCurrencyCode: "EUR",
      start: "2026-09-01",
    });

    expect(cashFlowChartScale(rows)).toEqual([
      {
        cashInWidth: "100%",
        cashOutWidth: "0%",
        month: "2026-09",
        netNegative: false,
        netWidth: "100%",
      },
    ]);
  });
});
