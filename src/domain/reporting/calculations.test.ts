import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  buildMonthlyCashFlow,
  calculateCashPosition,
  calculateDirectionPaymentSummary,
  calculateProjectFinancialSummary,
  cashFlowChartScale,
  cashFlowRange,
  daysOverdue,
  type ReportingInstallmentInput,
  type ReportingOrderInput,
} from "./calculations";

function order(
  id: string,
  values: {
    economicCost: string;
    inputVat?: string;
    inputVatRecoverability?: string;
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
      bases: [{ amount: new Decimal(100), orderId: "order-1" }],
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
    expect(result.totalRemaining?.toString()).toBe("70");
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
