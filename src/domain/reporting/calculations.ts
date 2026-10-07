import Decimal from "decimal.js";

import {
  financialMetrics,
  reportingAmount,
  type FinancialDecimal,
} from "@/domain/finance/calculations";
import {
  clientReceivableBase,
  convertPaymentAmount,
  supplierPayableBase,
} from "@/domain/payments/calculations";
import { cappedCashTerms } from "@/domain/payments/cash-expectations";
import {
  addMonthsToDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";
import { calculateInputVatRecovery } from "@/domain/vat/recoverability";
import type { SupplierCreditSummary } from "@/domain/finance/supplier-credit-reporting";

const ZERO = new Decimal(0);
const DAY_MILLISECONDS = 86_400_000;

export interface AggregateAmount {
  missingIds: string[];
  value: Decimal;
}

export interface ReportingOrderInput {
  supplierCredits?: SupplierCreditSummary;
  clientReceivable: {
    outputVatAmount: string | null;
    sellingRevenue: string | null;
  };
  cost: {
    customsDuties: string | null;
    economicLandedCost: string | null;
    freight: string | null;
    landedCost: string | null;
    miscellaneous: string | null;
    purchaseCost: string | null;
  };
  freightResaleAmount: string | null;
  freightTreatment: string;
  id: string;
  inputVat: {
    amount: string;
    recoverability: string | null;
    recoverableRate?: string | null;
    treatment: string;
  } | null;
  orderCurrencyCode: string;
  outputVat: { amount: string } | null;
  packageSellingPrice: string | null;
  purchaseFxRate: string | null;
  reportingCurrencyCode: string;
  sellingCurrencyCode: string;
  sellingFxRate: string | null;
  supplierPayable: {
    inputVatAmount: string | null;
    inputVatTreatment: string | null;
    supplierPurchase: string | null;
  };
  totalSellingRevenue: string | null;
}

export interface ReportingOrderResult {
  clientReceivable: Decimal | null;
  customsDuties: Decimal | null;
  economicLandedCost: Decimal | null;
  freight: Decimal | null;
  grossMarginRate: Decimal | null;
  grossProfit: Decimal | null;
  id: string;
  inputVat: Decimal | null;
  landedCost: Decimal | null;
  markupRate: Decimal | null;
  miscellaneous: Decimal | null;
  nonRecoverableInputVat: Decimal | null;
  outputVat: Decimal | null;
  packageSellingPrice: Decimal | null;
  purchaseCost: Decimal | null;
  recoverableInputVat: Decimal | null;
  rechargedFreight: Decimal | null;
  salesRevenue: Decimal | null;
  supplierPayable: Decimal | null;
}

export interface ProjectFinancialResult {
  complete: boolean;
  grossMarginRate: Decimal | null;
  grossProfit: Decimal | null;
  markupRate: Decimal | null;
  missingOrderIds: string[];
  orders: ReportingOrderResult[];
  totals: {
    customsDuties: AggregateAmount;
    economicLandedCost: AggregateAmount;
    freight: AggregateAmount;
    inputVat: AggregateAmount;
    landedCost: AggregateAmount;
    miscellaneous: AggregateAmount;
    nonRecoverableInputVat: AggregateAmount;
    outputVat: AggregateAmount;
    packageSellingPrice: AggregateAmount;
    purchaseCost: AggregateAmount;
    recoverableInputVat: AggregateAmount;
    rechargedFreight: AggregateAmount;
    salesRevenue: AggregateAmount;
  };
}

export interface ReportingSettlementInput {
  actualFxRate: string | null;
  amount: string;
  id: string;
  settledAt: string;
}

export interface ReportingInstallmentInput {
  reviewRequired?: boolean;
  currencyCode: string;
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  dueDate: string | null;
  expectedFxRate: string | null;
  id: string;
  isCancelled: boolean;
  orderId: string;
  outstandingAmount: string;
  scheduledAmount: string;
  settlements: readonly ReportingSettlementInput[];
  status: string;
}

export interface DirectionPaymentResult {
  base: AggregateAmount;
  overdue: AggregateAmount;
  paid: AggregateAmount;
  scheduled: AggregateAmount;
  scheduledOutstanding: AggregateAmount;
  totalRemaining: Decimal | null;
  unscheduled: Decimal | null;
}

export interface ReportingPaymentBase {
  amount: Decimal | null;
  orderId: string;
  originalAmount?: string | null;
  currencyCode?: string;
  expectedFxRate?: string | null;
  /** Authoritative original-currency net paid, including any recorded refunds. */
  paidAmount?: string | null;
}

export interface MonthlyCashFlowResult {
  actualComplete: boolean;
  actualIn: Decimal;
  actualNet: Decimal;
  actualOut: Decimal;
  expectedComplete: boolean;
  expectedIn: Decimal;
  expectedNet: Decimal;
  expectedOut: Decimal;
  missingActualIds: string[];
  missingExpectedIds: string[];
  month: string;
}

export interface CashFlowTotals {
  actualComplete: boolean;
  actualIn: Decimal;
  actualNet: Decimal;
  actualOut: Decimal;
  expectedComplete: boolean;
  expectedIn: Decimal;
  expectedNet: Decimal;
  expectedOut: Decimal;
  missingActualIds: string[];
  missingExpectedIds: string[];
}

function converted(
  amount: FinancialDecimal,
  originalCurrencyCode: string,
  reportingCurrencyCode: string,
  fxRate: string | null,
): Decimal | null {
  return reportingAmount({
    fxRateToReporting: fxRate,
    originalAmount: amount,
    originalCurrencyCode,
    reportingCurrencyCode,
  });
}

function orderCostAmount(
  input: ReportingOrderInput,
  amount: string | null,
): Decimal | null {
  if (input.cost.economicLandedCost === null) return null;
  return converted(
    amount ?? "0",
    input.orderCurrencyCode,
    input.reportingCurrencyCode,
    input.purchaseFxRate,
  );
}

function orderSellingAmount(
  input: ReportingOrderInput,
  amount: string | null,
): Decimal | null {
  if (input.totalSellingRevenue === null) return null;
  return converted(
    amount ?? "0",
    input.sellingCurrencyCode,
    input.reportingCurrencyCode,
    input.sellingFxRate,
  );
}

export function calculateReportingOrder(
  input: ReportingOrderInput,
): ReportingOrderResult {
  const subtractCredit = (
    amount: Decimal | null,
    reduction: string | null | undefined,
  ) =>
    amount === null || reduction === null
      ? null
      : amount.minus(reduction ?? "0");
  const economicLandedCost = subtractCredit(
    orderCostAmount(input, input.cost.economicLandedCost),
    input.supplierCredits?.reportingEconomic,
  );
  const salesRevenue = orderSellingAmount(input, input.totalSellingRevenue);
  const inputVat = input.inputVat
    ? converted(
        input.inputVat.amount,
        input.orderCurrencyCode,
        input.reportingCurrencyCode,
        input.purchaseFxRate,
      )
    : ZERO;
  const outputVat = input.outputVat
    ? converted(
        input.outputVat.amount,
        input.sellingCurrencyCode,
        input.reportingCurrencyCode,
        input.sellingFxRate,
      )
    : ZERO;
  const supplierPayable = input.supplierPayable.supplierPurchase
    ? subtractCredit(
        converted(
          supplierPayableBase({
            inputVatAmount: input.supplierPayable.inputVatAmount,
            inputVatTreatment: input.supplierPayable.inputVatTreatment,
            supplierPurchase: input.supplierPayable.supplierPurchase,
            freight: input.cost.freight,
            customsDuties: input.cost.customsDuties,
            miscellaneous: input.cost.miscellaneous,
          }),
          input.orderCurrencyCode,
          input.reportingCurrencyCode,
          input.purchaseFxRate,
        ),
        input.supplierCredits?.reportingPayable,
      )
    : null;
  const clientReceivable = input.clientReceivable.sellingRevenue
    ? converted(
        clientReceivableBase({
          outputVatAmount: input.clientReceivable.outputVatAmount,
          sellingRevenue: input.clientReceivable.sellingRevenue,
        }),
        input.sellingCurrencyCode,
        input.reportingCurrencyCode,
        input.sellingFxRate,
      )
    : null;
  const metrics =
    economicLandedCost !== null && salesRevenue !== null
      ? financialMetrics({
          landedCost: economicLandedCost,
          sellingPrice: salesRevenue,
        })
      : null;
  const inputRecovery =
    inputVat !== null && input.inputVat
      ? calculateInputVatRecovery({
          recoverability:
            input.inputVat.recoverability === "RECOVERABLE" ||
            input.inputVat.recoverability === "NON_RECOVERABLE" ||
            input.inputVat.recoverability === "PARTIALLY_RECOVERABLE"
              ? input.inputVat.recoverability
              : null,
          recoverableRate: input.inputVat.recoverableRate,
          vatAmount: inputVat,
        })
      : null;
  return {
    clientReceivable,
    customsDuties: orderCostAmount(input, input.cost.customsDuties),
    economicLandedCost,
    freight: orderCostAmount(input, input.cost.freight),
    grossMarginRate: metrics?.grossMarginRate ?? null,
    grossProfit: metrics?.grossProfit ?? null,
    id: input.id,
    inputVat: subtractCredit(inputVat, input.supplierCredits?.reportingVat),
    landedCost: subtractCredit(
      orderCostAmount(input, input.cost.landedCost),
      input.supplierCredits?.reportingPurchaseHt,
    ),
    markupRate: metrics?.markupRate ?? null,
    miscellaneous: orderCostAmount(input, input.cost.miscellaneous),
    nonRecoverableInputVat:
      inputVat === null
        ? null
        : subtractCredit(
            inputRecovery?.nonDeductibleVat ?? ZERO,
            input.supplierCredits
              ? input.supplierCredits.reportingVat === null ||
                input.supplierCredits.reportingDeductibleVat === null
                ? null
                : new Decimal(input.supplierCredits.reportingVat)
                    .minus(input.supplierCredits.reportingDeductibleVat)
                    .toString()
              : undefined,
          ),
    outputVat,
    packageSellingPrice: orderSellingAmount(input, input.packageSellingPrice),
    purchaseCost: subtractCredit(
      orderCostAmount(input, input.cost.purchaseCost),
      input.supplierCredits?.reportingPurchaseHt,
    ),
    recoverableInputVat:
      inputVat === null
        ? null
        : subtractCredit(
            inputRecovery?.deductibleVat ?? ZERO,
            input.supplierCredits?.reportingDeductibleVat,
          ),
    rechargedFreight:
      input.freightTreatment === "RECHARGED_SEPARATELY"
        ? orderSellingAmount(input, input.freightResaleAmount)
        : ZERO,
    salesRevenue,
    supplierPayable,
  };
}

function aggregateOrderField(
  orders: readonly ReportingOrderResult[],
  field: keyof Omit<ReportingOrderResult, "id">,
): AggregateAmount {
  const missingIds: string[] = [];
  let value = new Decimal(0);
  for (const order of orders) {
    const amount = order[field];
    if (amount === null) missingIds.push(order.id);
    else value = value.plus(amount);
  }
  return { missingIds, value };
}

export function calculateProjectFinancialSummary(
  inputs: readonly ReportingOrderInput[],
): ProjectFinancialResult {
  const orders = inputs.map(calculateReportingOrder);
  const totals = {
    customsDuties: aggregateOrderField(orders, "customsDuties"),
    economicLandedCost: aggregateOrderField(orders, "economicLandedCost"),
    freight: aggregateOrderField(orders, "freight"),
    inputVat: aggregateOrderField(orders, "inputVat"),
    landedCost: aggregateOrderField(orders, "landedCost"),
    miscellaneous: aggregateOrderField(orders, "miscellaneous"),
    nonRecoverableInputVat: aggregateOrderField(
      orders,
      "nonRecoverableInputVat",
    ),
    outputVat: aggregateOrderField(orders, "outputVat"),
    packageSellingPrice: aggregateOrderField(orders, "packageSellingPrice"),
    purchaseCost: aggregateOrderField(orders, "purchaseCost"),
    recoverableInputVat: aggregateOrderField(orders, "recoverableInputVat"),
    rechargedFreight: aggregateOrderField(orders, "rechargedFreight"),
    salesRevenue: aggregateOrderField(orders, "salesRevenue"),
  };
  const missingOrderIds = Array.from(
    new Set([
      ...totals.economicLandedCost.missingIds,
      ...totals.salesRevenue.missingIds,
    ]),
  );
  const complete = missingOrderIds.length === 0;
  const metrics = complete
    ? financialMetrics({
        landedCost: totals.economicLandedCost.value,
        sellingPrice: totals.salesRevenue.value,
      })
    : null;
  return {
    complete,
    grossMarginRate: metrics?.grossMarginRate ?? null,
    grossProfit: metrics?.grossProfit ?? null,
    markupRate: metrics?.markupRate ?? null,
    missingOrderIds,
    orders,
    totals,
  };
}

function aggregateConverted(
  inputs: readonly { amount: Decimal | null; id: string }[],
): AggregateAmount {
  const missingIds: string[] = [];
  let value = new Decimal(0);
  for (const input of inputs) {
    if (input.amount === null) missingIds.push(input.id);
    else value = value.plus(input.amount);
  }
  return { missingIds, value };
}

function expectedAmount(
  installment: ReportingInstallmentInput,
  amount: string,
  reportingCurrencyCode: string,
): Decimal | null {
  if (installment.reviewRequired) return null;
  return convertPaymentAmount({
    amount,
    currencyCode: installment.currencyCode,
    fxRateToReporting: installment.expectedFxRate,
    reportingCurrencyCode,
  });
}

function actualAmount(
  installment: ReportingInstallmentInput,
  settlement: ReportingSettlementInput,
  reportingCurrencyCode: string,
): Decimal | null {
  return convertPaymentAmount({
    amount: settlement.amount,
    currencyCode: installment.currencyCode,
    fxRateToReporting: settlement.actualFxRate,
    reportingCurrencyCode,
  });
}

function remainingPaymentAmounts(
  base: ReportingPaymentBase,
  installments: readonly ReportingInstallmentInput[],
  reportingCurrencyCode: string,
) {
  const active = installments.filter((item) => !item.isCancelled);
  const incomplete = () => ({
    outstanding: active.map((item) => ({ amount: null, id: item.id })),
    unscheduled: null,
  });
  const currencyCode = base.currencyCode ?? reportingCurrencyCode;
  // Older same-currency callers need no extra context. A converted base cannot
  // establish an original foreign balance, particularly after Supplier credits.
  const originalAmount =
    base.originalAmount === undefined
      ? currencyCode === reportingCurrencyCode
        ? (base.amount?.toString() ?? null)
        : null
      : base.originalAmount;
  if (
    originalAmount === null ||
    base.paidAmount === null ||
    installments.some(
      (item) =>
        (!item.isCancelled || item.settlements.length > 0) &&
        (item.reviewRequired || item.currencyCode !== currencyCode),
    )
  )
    return incomplete();

  const paid =
    base.paidAmount ??
    installments
      .flatMap((item) => item.settlements)
      .reduce((total, settlement) => total.plus(settlement.amount), ZERO)
      .toString();
  const schedule = cappedCashTerms(
    originalAmount,
    Decimal.min(originalAmount, paid).toString(),
    installments
      .toSorted(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.id.localeCompare(b.id),
      )
      .map((item) => ({
        amount: item.outstandingAmount,
        cancelled: item.isCancelled,
        due: item.dueDate,
        installment: item,
        paid: "0",
      })),
  );
  return {
    outstanding: schedule.terms
      .filter(({ term }) => !term.cancelled)
      .map(({ term, amount }) => ({
        amount: expectedAmount(
          term.installment,
          amount.toString(),
          reportingCurrencyCode,
        ),
        id: term.installment.id,
      })),
    unscheduled: convertPaymentAmount({
      amount: schedule.unscheduled,
      currencyCode,
      fxRateToReporting: base.expectedFxRate,
      reportingCurrencyCode,
    }),
  };
}

export function calculateDirectionPaymentSummary(input: {
  bases: readonly ReportingPaymentBase[];
  direction: ReportingInstallmentInput["direction"];
  installments: readonly ReportingInstallmentInput[];
  reportingCurrencyCode: string;
}): DirectionPaymentResult {
  const installments = input.installments.filter(
    (item) => item.direction === input.direction,
  );
  const active = installments.filter((item) => !item.isCancelled);
  const base = aggregateConverted(
    input.bases.map((item) => ({ amount: item.amount, id: item.orderId })),
  );
  const scheduled = aggregateConverted(
    active.map((item) => ({
      amount: expectedAmount(
        item,
        item.scheduledAmount,
        input.reportingCurrencyCode,
      ),
      id: item.id,
    })),
  );
  const remaining = input.bases.map((item) => ({
    ...remainingPaymentAmounts(
      item,
      installments.filter(
        (installment) => installment.orderId === item.orderId,
      ),
      input.reportingCurrencyCode,
    ),
    id: item.orderId,
  }));
  const remainingByInstallment = new Map(
    remaining.flatMap((item) =>
      item.outstanding.map((amount) => [amount.id, amount.amount] as const),
    ),
  );
  const scheduledOutstanding = aggregateConverted(
    active.map((item) => ({
      amount: remainingByInstallment.get(item.id) ?? null,
      id: item.id,
    })),
  );
  const overdue = aggregateConverted(
    active
      .filter((item) => item.status === "OVERDUE")
      .map((item) => ({
        amount: remainingByInstallment.get(item.id) ?? null,
        id: item.id,
      })),
  );
  const paid = aggregateConverted(
    installments.flatMap((item) =>
      item.settlements.map((settlement) => ({
        amount: actualAmount(item, settlement, input.reportingCurrencyCode),
        id: settlement.id,
      })),
    ),
  );
  const unscheduled = aggregateConverted(
    remaining.map((item) => ({ amount: item.unscheduled, id: item.id })),
  );
  const remainingComplete =
    unscheduled.missingIds.length === 0 &&
    scheduledOutstanding.missingIds.length === 0;
  return {
    base,
    overdue,
    paid,
    scheduled,
    scheduledOutstanding,
    totalRemaining: remainingComplete
      ? scheduledOutstanding.value.plus(unscheduled.value)
      : null,
    unscheduled: unscheduled.missingIds.length === 0 ? unscheduled.value : null,
  };
}

export function cashFlowRange(
  today: string,
  horizon: "30d" | "90d" | "6m" | "12m",
): { end: string; start: string } {
  const end = dateOnlyToDate(today);
  if (horizon === "30d" || horizon === "90d") {
    end.setUTCDate(end.getUTCDate() + (horizon === "30d" ? 29 : 89));
  } else {
    const shifted = addMonthsToDateOnly(today, horizon === "6m" ? 6 : 12);
    end.setTime(dateOnlyToDate(shifted).getTime());
    end.setUTCDate(end.getUTCDate() - 1);
  }
  return { end: dateToDateOnly(end), start: today };
}

function monthKeys(start: string, end: string): string[] {
  const result: string[] = [];
  let current = `${start.slice(0, 7)}-01`;
  const last = `${end.slice(0, 7)}-01`;
  while (current <= last) {
    result.push(current.slice(0, 7));
    current = addMonthsToDateOnly(current, 1);
  }
  return result;
}

export function buildMonthlyCashFlow(input: {
  end: string;
  installments: readonly ReportingInstallmentInput[];
  reportingCurrencyCode: string;
  start: string;
}): MonthlyCashFlowResult[] {
  const rows = new Map(
    monthKeys(input.start, input.end).map((month) => [
      month,
      {
        actualIn: new Decimal(0),
        actualOut: new Decimal(0),
        expectedIn: new Decimal(0),
        expectedOut: new Decimal(0),
        missingActualIds: [] as string[],
        missingExpectedIds: [] as string[],
      },
    ]),
  );
  for (const installment of input.installments) {
    if (
      !installment.isCancelled &&
      installment.dueDate !== null &&
      installment.dueDate >= input.start &&
      installment.dueDate <= input.end
    ) {
      const row = rows.get(installment.dueDate.slice(0, 7));
      const amount = expectedAmount(
        installment,
        installment.outstandingAmount,
        input.reportingCurrencyCode,
      );
      if (row) {
        if (amount === null) row.missingExpectedIds.push(installment.id);
        else if (installment.direction === "CLIENT_RECEIPT")
          row.expectedIn = row.expectedIn.plus(amount);
        else row.expectedOut = row.expectedOut.plus(amount);
      }
    }
    for (const settlement of installment.settlements) {
      if (
        settlement.settledAt < input.start ||
        settlement.settledAt > input.end
      )
        continue;
      const row = rows.get(settlement.settledAt.slice(0, 7));
      const amount = actualAmount(
        installment,
        settlement,
        input.reportingCurrencyCode,
      );
      if (row) {
        if (amount === null) row.missingActualIds.push(settlement.id);
        else if (installment.direction === "CLIENT_RECEIPT")
          row.actualIn = row.actualIn.plus(amount);
        else row.actualOut = row.actualOut.plus(amount);
      }
    }
  }
  return Array.from(rows, ([month, row]) => ({
    actualComplete: row.missingActualIds.length === 0,
    actualIn: row.actualIn,
    actualNet: row.actualIn.minus(row.actualOut),
    actualOut: row.actualOut,
    expectedComplete: row.missingExpectedIds.length === 0,
    expectedIn: row.expectedIn,
    expectedNet: row.expectedIn.minus(row.expectedOut),
    expectedOut: row.expectedOut,
    missingActualIds: row.missingActualIds,
    missingExpectedIds: row.missingExpectedIds,
    month,
  }));
}

export function calculateCashPosition(
  clientReceived: AggregateAmount,
  supplierPaid: AggregateAmount,
): Decimal | null {
  return clientReceived.missingIds.length === 0 &&
    supplierPaid.missingIds.length === 0
    ? clientReceived.value.minus(supplierPaid.value)
    : null;
}

export function summarizeMonthlyCashFlow(
  rows: readonly MonthlyCashFlowResult[],
): CashFlowTotals {
  const totals = rows.reduce(
    (result, row) => ({
      actualIn: result.actualIn.plus(row.actualIn),
      actualOut: result.actualOut.plus(row.actualOut),
      expectedIn: result.expectedIn.plus(row.expectedIn),
      expectedOut: result.expectedOut.plus(row.expectedOut),
      missingActualIds: [...result.missingActualIds, ...row.missingActualIds],
      missingExpectedIds: [
        ...result.missingExpectedIds,
        ...row.missingExpectedIds,
      ],
    }),
    {
      actualIn: new Decimal(0),
      actualOut: new Decimal(0),
      expectedIn: new Decimal(0),
      expectedOut: new Decimal(0),
      missingActualIds: [] as string[],
      missingExpectedIds: [] as string[],
    },
  );
  return {
    actualComplete: totals.missingActualIds.length === 0,
    actualIn: totals.actualIn,
    actualNet: totals.actualIn.minus(totals.actualOut),
    actualOut: totals.actualOut,
    expectedComplete: totals.missingExpectedIds.length === 0,
    expectedIn: totals.expectedIn,
    expectedNet: totals.expectedIn.minus(totals.expectedOut),
    expectedOut: totals.expectedOut,
    missingActualIds: totals.missingActualIds,
    missingExpectedIds: totals.missingExpectedIds,
  };
}

export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  return Math.max(
    0,
    Math.round(
      (dateOnlyToDate(today).getTime() - dateOnlyToDate(dueDate).getTime()) /
        DAY_MILLISECONDS,
    ),
  );
}

export function cashFlowChartScale(
  rows: readonly MonthlyCashFlowResult[],
): readonly {
  cashInWidth: string;
  cashOutWidth: string;
  month: string;
  netNegative: boolean;
  netWidth: string;
}[] {
  const values = rows.flatMap((row) => [
    row.expectedIn.abs(),
    row.expectedOut.abs(),
    row.expectedNet.abs(),
  ]);
  const maximum = Decimal.max(ZERO, ...values);
  const width = (amount: Decimal) =>
    maximum.isZero()
      ? "0%"
      : `${amount.abs().dividedBy(maximum).times(100).toDecimalPlaces(2).toString()}%`;
  return rows.map((row) => ({
    cashInWidth: width(row.expectedIn),
    cashOutWidth: width(row.expectedOut),
    month: row.month,
    netNegative: row.expectedNet.isNegative(),
    netWidth: width(row.expectedNet),
  }));
}
