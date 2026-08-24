import "server-only";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import {
  buildMonthlyCashFlow,
  calculateCashPosition,
  calculateDirectionPaymentSummary,
  calculateProjectFinancialSummary,
  cashFlowChartScale,
  cashFlowRange,
  daysOverdue,
  summarizeMonthlyCashFlow,
  type AggregateAmount,
  type DirectionPaymentResult,
  type ProjectFinancialResult,
  type ReportingInstallmentInput,
  type ReportingOrderInput,
} from "@/domain/reporting/calculations";
import { convertPaymentAmount } from "@/domain/payments/calculations";
import { businessToday, isDateOnly } from "@/domain/payments/dates";
import {
  PaymentDirection,
  ProjectStatus,
  type ProcurementOrderStatus,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import {
  listPaymentInstallments,
  type PaymentInstallmentView,
} from "@/lib/payments/payments";
import { listOrders, type OrderSummary } from "@/lib/procurement/orders";

export interface ReportingRangeInput {
  end?: string | undefined;
  horizon: "30d" | "90d" | "6m" | "12m";
  start?: string | undefined;
}

export interface SerializedAggregateAmount {
  complete: boolean;
  missingIds: string[];
  value: string;
}

export interface SerializedDirectionPaymentSummary {
  base: SerializedAggregateAmount;
  overdue: SerializedAggregateAmount;
  paid: SerializedAggregateAmount;
  scheduled: SerializedAggregateAmount;
  scheduledOutstanding: SerializedAggregateAmount;
  totalRemaining: string | null;
  unscheduled: string | null;
}

export interface SerializedFinancialSummary {
  complete: boolean;
  grossMarginRate: string | null;
  grossProfit: string | null;
  markupRate: string | null;
  missingOrderIds: string[];
  totals: {
    customsDuties: SerializedAggregateAmount;
    economicLandedCost: SerializedAggregateAmount;
    freight: SerializedAggregateAmount;
    inputVat: SerializedAggregateAmount;
    landedCost: SerializedAggregateAmount;
    miscellaneous: SerializedAggregateAmount;
    nonRecoverableInputVat: SerializedAggregateAmount;
    outputVat: SerializedAggregateAmount;
    packageSellingPrice: SerializedAggregateAmount;
    purchaseCost: SerializedAggregateAmount;
    recoverableInputVat: SerializedAggregateAmount;
    rechargedFreight: SerializedAggregateAmount;
    salesRevenue: SerializedAggregateAmount;
  };
}

export interface SerializedCashFlow {
  chart: readonly {
    cashInWidth: string;
    cashOutWidth: string;
    month: string;
    netNegative: boolean;
    netWidth: string;
  }[];
  end: string;
  rows: readonly {
    actualComplete: boolean;
    actualIn: string;
    actualNet: string;
    actualOut: string;
    expectedComplete: boolean;
    expectedIn: string;
    expectedNet: string;
    expectedOut: string;
    missingActualCount: number;
    missingExpectedCount: number;
    month: string;
  }[];
  start: string;
  totals: {
    actualComplete: boolean;
    actualIn: string;
    actualNet: string;
    actualOut: string;
    expectedComplete: boolean;
    expectedIn: string;
    expectedNet: string;
    expectedOut: string;
    missingActualCount: number;
    missingExpectedCount: number;
  };
}

export interface ReportingOrderRow {
  clientOutstanding: string | null;
  complete: boolean;
  economicLandedCost: string | null;
  grossMarginRate: string | null;
  grossProfit: string | null;
  id: string;
  landedCost: string | null;
  orderNumber: string;
  packageName: string;
  purchaseCost: string | null;
  salesRevenue: string | null;
  status: ProcurementOrderStatus;
  supplierName: string;
  supplierOutstanding: string | null;
}

export interface OverdueReportingItem {
  amount: string | null;
  clientName: string;
  currencyCode: string;
  daysOverdue: number;
  direction: PaymentDirection;
  dueDate: string;
  id: string;
  label: string;
  orderId: string;
  orderNumber: string;
  projectId: string;
  projectName: string;
  supplierName: string;
}

export interface ProjectReportingSnapshot {
  cashFlow: SerializedCashFlow;
  cashPosition: string | null;
  financial: SerializedFinancialSummary;
  orderRows: ReportingOrderRow[];
  overdueItems: OverdueReportingItem[];
  payments: {
    client: SerializedDirectionPaymentSummary;
    supplier: SerializedDirectionPaymentSummary;
  };
  reportingCurrencyCode: string;
}

export interface PortfolioProjectRow {
  cashPosition: string | null;
  clientName: string;
  clientOutstanding: string | null;
  code: string;
  economicLandedCost: string;
  financialComplete: boolean;
  grossMarginRate: string | null;
  grossProfit: string | null;
  id: string;
  name: string;
  reportingCurrencyCode: string;
  salesRevenue: string;
  status: ProjectStatus;
  supplierOutstanding: string | null;
}

export interface PortfolioReportingSnapshot {
  activeProjectCount: number;
  cashFlow: SerializedCashFlow;
  cashPosition: string | null;
  companyCurrencyCode: string;
  excludedCurrencyProjects: {
    id: string;
    name: string;
    reportingCurrencyCode: string;
  }[];
  financial: SerializedFinancialSummary;
  overdueItems: OverdueReportingItem[];
  payments: {
    client: SerializedDirectionPaymentSummary;
    supplier: SerializedDirectionPaymentSummary;
  };
  projects: PortfolioProjectRow[];
}

export interface ReportingFilters {
  clientId?: string | undefined;
  projectId?: string | undefined;
  projectStatus?: ProjectStatus | undefined;
  supplierId?: string | undefined;
}

function reportingRange(input: ReportingRangeInput) {
  const today = businessToday();
  if (
    input.start &&
    input.end &&
    isDateOnly(input.start) &&
    isDateOnly(input.end) &&
    input.start <= input.end
  )
    return { end: input.end, start: input.start };
  return cashFlowRange(today, input.horizon);
}

function orderInput(order: OrderSummary): ReportingOrderInput {
  return {
    clientReceivable: {
      outputVatAmount: order.costs.outputVat?.amount ?? null,
      sellingRevenue: order.totalSellingRevenue,
    },
    cost: {
      customsDuties: order.costs.customsDuties,
      economicLandedCost: order.costs.economicLandedCost,
      freight: order.costs.freight,
      landedCost: order.costs.landedCost,
      miscellaneous: order.costs.miscellaneous,
      purchaseCost: order.costs.purchaseCost,
    },
    freightResaleAmount: order.freightResaleAmount,
    freightTreatment: order.freightTreatment,
    id: order.id,
    inputVat: order.costs.inputVat
      ? {
          amount: order.costs.inputVat.amount,
          recoverability: order.costs.inputVat.recoverability,
          treatment: order.costs.inputVat.treatment,
        }
      : null,
    orderCurrencyCode: order.orderCurrencyCode,
    outputVat: order.costs.outputVat
      ? { amount: order.costs.outputVat.amount }
      : null,
    packageSellingPrice: order.packageSellingPrice,
    purchaseFxRate: order.costs.purchaseFxRate,
    reportingCurrencyCode: order.project.reportingCurrencyCode,
    sellingCurrencyCode: order.sellingCurrencyCode,
    sellingFxRate: order.costs.sellingFxRate,
    supplierPayable: {
      inputVatAmount: order.costs.inputVat?.amount ?? null,
      inputVatTreatment: order.costs.inputVat?.treatment ?? null,
      supplierPurchase: order.costs.purchaseCost,
    },
    totalSellingRevenue: order.totalSellingRevenue,
  };
}

function installmentInput(
  installment: PaymentInstallmentView,
): ReportingInstallmentInput {
  return {
    currencyCode: installment.currencyCode,
    direction: installment.direction,
    dueDate: installment.dueDate,
    expectedFxRate: installment.expectedFxRate,
    id: installment.id,
    isCancelled: installment.isCancelled,
    orderId: installment.orderId,
    outstandingAmount: installment.outstandingAmount,
    scheduledAmount: installment.scheduledAmount,
    settlements: installment.settlements.map((settlement) => ({
      actualFxRate: settlement.fxRate,
      amount: settlement.amount,
      id: settlement.id,
      settledAt: settlement.settledAt,
    })),
    status: installment.status,
  };
}

function serializedAggregate(
  aggregate: AggregateAmount,
): SerializedAggregateAmount {
  return {
    complete: aggregate.missingIds.length === 0,
    missingIds: aggregate.missingIds,
    value: aggregate.value.toString(),
  };
}

function serializedFinancial(
  financial: ProjectFinancialResult,
): SerializedFinancialSummary {
  const aggregate = serializedAggregate;
  return {
    complete: financial.complete,
    grossMarginRate: financial.grossMarginRate?.toString() ?? null,
    grossProfit: financial.grossProfit?.toString() ?? null,
    markupRate: financial.markupRate?.toString() ?? null,
    missingOrderIds: financial.missingOrderIds,
    totals: {
      customsDuties: aggregate(financial.totals.customsDuties),
      economicLandedCost: aggregate(financial.totals.economicLandedCost),
      freight: aggregate(financial.totals.freight),
      inputVat: aggregate(financial.totals.inputVat),
      landedCost: aggregate(financial.totals.landedCost),
      miscellaneous: aggregate(financial.totals.miscellaneous),
      nonRecoverableInputVat: aggregate(
        financial.totals.nonRecoverableInputVat,
      ),
      outputVat: aggregate(financial.totals.outputVat),
      packageSellingPrice: aggregate(financial.totals.packageSellingPrice),
      purchaseCost: aggregate(financial.totals.purchaseCost),
      recoverableInputVat: aggregate(financial.totals.recoverableInputVat),
      rechargedFreight: aggregate(financial.totals.rechargedFreight),
      salesRevenue: aggregate(financial.totals.salesRevenue),
    },
  };
}

function serializedDirection(
  result: DirectionPaymentResult,
): SerializedDirectionPaymentSummary {
  return {
    base: serializedAggregate(result.base),
    overdue: serializedAggregate(result.overdue),
    paid: serializedAggregate(result.paid),
    scheduled: serializedAggregate(result.scheduled),
    scheduledOutstanding: serializedAggregate(result.scheduledOutstanding),
    totalRemaining: result.totalRemaining?.toString() ?? null,
    unscheduled: result.unscheduled?.toString() ?? null,
  };
}

function serializedCashFlow(input: {
  end: string;
  installments: readonly ReportingInstallmentInput[];
  reportingCurrencyCode: string;
  start: string;
}): SerializedCashFlow {
  const rows = buildMonthlyCashFlow(input);
  const totals = summarizeMonthlyCashFlow(rows);
  return {
    chart: cashFlowChartScale(rows),
    end: input.end,
    rows: rows.map((row) => ({
      actualComplete: row.actualComplete,
      actualIn: row.actualIn.toString(),
      actualNet: row.actualNet.toString(),
      actualOut: row.actualOut.toString(),
      expectedComplete: row.expectedComplete,
      expectedIn: row.expectedIn.toString(),
      expectedNet: row.expectedNet.toString(),
      expectedOut: row.expectedOut.toString(),
      missingActualCount: row.missingActualIds.length,
      missingExpectedCount: row.missingExpectedIds.length,
      month: row.month,
    })),
    start: input.start,
    totals: {
      actualComplete: totals.actualComplete,
      actualIn: totals.actualIn.toString(),
      actualNet: totals.actualNet.toString(),
      actualOut: totals.actualOut.toString(),
      expectedComplete: totals.expectedComplete,
      expectedIn: totals.expectedIn.toString(),
      expectedNet: totals.expectedNet.toString(),
      expectedOut: totals.expectedOut.toString(),
      missingActualCount: totals.missingActualIds.length,
      missingExpectedCount: totals.missingExpectedIds.length,
    },
  };
}

function overdueItems(
  installments: readonly PaymentInstallmentView[],
  reportingCurrencyCode: string,
): OverdueReportingItem[] {
  const today = businessToday();
  return installments
    .filter((item) => item.status === "OVERDUE" && !item.isCancelled)
    .map((item) => ({
      amount:
        convertPaymentAmount({
          amount: item.outstandingAmount,
          currencyCode: item.currencyCode,
          fxRateToReporting: item.expectedFxRate,
          reportingCurrencyCode,
        })?.toString() ?? null,
      clientName: item.clientName,
      currencyCode: reportingCurrencyCode,
      daysOverdue: daysOverdue(item.dueDate, today),
      direction: item.direction,
      dueDate: item.dueDate,
      id: item.id,
      label: item.label,
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      projectId: item.projectId,
      projectName: item.projectName,
      supplierName: item.supplierName,
    }));
}

function projectSnapshot(input: {
  installments: readonly PaymentInstallmentView[];
  orders: readonly OrderSummary[];
  range: { end: string; start: string };
  reportingCurrencyCode: string;
}): ProjectReportingSnapshot {
  const financial = calculateProjectFinancialSummary(
    input.orders.map(orderInput),
  );
  const installments = input.installments.map(installmentInput);
  const orderFinancials = new Map(
    financial.orders.map((order) => [order.id, order]),
  );
  const supplier = calculateDirectionPaymentSummary({
    bases: financial.orders.map((order) => ({
      amount: order.supplierPayable,
      orderId: order.id,
    })),
    direction: PaymentDirection.SUPPLIER_PAYMENT,
    installments,
    reportingCurrencyCode: input.reportingCurrencyCode,
  });
  const client = calculateDirectionPaymentSummary({
    bases: financial.orders.map((order) => ({
      amount: order.clientReceivable,
      orderId: order.id,
    })),
    direction: PaymentDirection.CLIENT_RECEIPT,
    installments,
    reportingCurrencyCode: input.reportingCurrencyCode,
  });
  const installmentsByOrder = new Map<string, ReportingInstallmentInput[]>();
  for (const installment of installments) {
    installmentsByOrder.set(installment.orderId, [
      ...(installmentsByOrder.get(installment.orderId) ?? []),
      installment,
    ]);
  }
  const orderRows = input.orders.map((order) => {
    const contribution = orderFinancials.get(order.id);
    const orderInstallments = installmentsByOrder.get(order.id) ?? [];
    const supplierPayment = calculateDirectionPaymentSummary({
      bases: [
        { amount: contribution?.supplierPayable ?? null, orderId: order.id },
      ],
      direction: PaymentDirection.SUPPLIER_PAYMENT,
      installments: orderInstallments,
      reportingCurrencyCode: input.reportingCurrencyCode,
    });
    const clientPayment = calculateDirectionPaymentSummary({
      bases: [
        { amount: contribution?.clientReceivable ?? null, orderId: order.id },
      ],
      direction: PaymentDirection.CLIENT_RECEIPT,
      installments: orderInstallments,
      reportingCurrencyCode: input.reportingCurrencyCode,
    });
    return {
      clientOutstanding: clientPayment.totalRemaining?.toString() ?? null,
      complete:
        contribution !== undefined &&
        contribution.economicLandedCost !== null &&
        contribution.salesRevenue !== null,
      economicLandedCost: contribution?.economicLandedCost?.toString() ?? null,
      grossMarginRate: contribution?.grossMarginRate?.toString() ?? null,
      grossProfit: contribution?.grossProfit?.toString() ?? null,
      id: order.id,
      landedCost: contribution?.landedCost?.toString() ?? null,
      orderNumber: order.orderNumber,
      packageName: order.packageName,
      purchaseCost: contribution?.purchaseCost?.toString() ?? null,
      salesRevenue: contribution?.salesRevenue?.toString() ?? null,
      status: order.status,
      supplierName: order.supplier.displayName,
      supplierOutstanding: supplierPayment.totalRemaining?.toString() ?? null,
    };
  });
  return {
    cashFlow: serializedCashFlow({
      end: input.range.end,
      installments,
      reportingCurrencyCode: input.reportingCurrencyCode,
      start: input.range.start,
    }),
    cashPosition:
      calculateCashPosition(client.paid, supplier.paid)?.toString() ?? null,
    financial: serializedFinancial(financial),
    orderRows,
    overdueItems: overdueItems(input.installments, input.reportingCurrencyCode),
    payments: {
      client: serializedDirection(client),
      supplier: serializedDirection(supplier),
    },
    reportingCurrencyCode: input.reportingCurrencyCode,
  };
}

export async function getProjectReportingSnapshot(
  projectId: string,
  rangeInput: ReportingRangeInput,
): Promise<ProjectReportingSnapshot | null> {
  const database = getDatabase();
  const [project, orders, installments] = await Promise.all([
    database.project.findUnique({
      where: { id: projectId },
      select: { reportingCurrencyCode: true },
    }),
    listOrders({ projectId, query: "" }),
    listPaymentInstallments({ projectId }),
  ]);
  if (!project) return null;
  return projectSnapshot({
    installments,
    orders,
    range: reportingRange(rangeInput),
    reportingCurrencyCode: project.reportingCurrencyCode,
  });
}

export async function getPortfolioReportingSnapshot(
  filters: ReportingFilters,
  rangeInput: ReportingRangeInput,
): Promise<PortfolioReportingSnapshot> {
  const database = getDatabase();
  const [projects, orders, installments] = await Promise.all([
    database.project.findMany({
      where: {
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.projectId ? { id: filters.projectId } : {}),
        ...(filters.projectStatus ? { status: filters.projectStatus } : {}),
        ...(filters.supplierId
          ? { orders: { some: { supplierId: filters.supplierId } } }
          : {}),
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        client: { select: { displayName: true } },
        code: true,
        id: true,
        name: true,
        reportingCurrencyCode: true,
        status: true,
      },
    }),
    listOrders({
      projectId: filters.projectId,
      query: "",
      supplierId: filters.supplierId,
    }),
    listPaymentInstallments({
      clientId: filters.clientId,
      projectId: filters.projectId,
      supplierId: filters.supplierId,
    }),
  ]);
  const projectIds = new Set(projects.map((project) => project.id));
  const scopedOrders = orders.filter((order) =>
    projectIds.has(order.project.id),
  );
  const scopedInstallments = installments.filter((item) =>
    projectIds.has(item.projectId),
  );
  const range = reportingRange(rangeInput);
  const projectSnapshots = new Map(
    projects.map((project) => [
      project.id,
      projectSnapshot({
        installments: scopedInstallments.filter(
          (item) => item.projectId === project.id,
        ),
        orders: scopedOrders.filter((order) => order.project.id === project.id),
        range,
        reportingCurrencyCode: project.reportingCurrencyCode,
      }),
    ]),
  );
  const companyProjects = projects.filter(
    (project) =>
      project.reportingCurrencyCode === COMPANY_REPORTING_CURRENCY_CODE,
  );
  const companyProjectIds = new Set(
    companyProjects.map((project) => project.id),
  );
  const companySnapshot = projectSnapshot({
    installments: scopedInstallments.filter((item) =>
      companyProjectIds.has(item.projectId),
    ),
    orders: scopedOrders.filter((order) =>
      companyProjectIds.has(order.project.id),
    ),
    range,
    reportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
  });
  return {
    activeProjectCount: projects.filter(
      (project) => project.status === ProjectStatus.ACTIVE,
    ).length,
    cashFlow: companySnapshot.cashFlow,
    cashPosition: companySnapshot.cashPosition,
    companyCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    excludedCurrencyProjects: projects
      .filter(
        (project) =>
          project.reportingCurrencyCode !== COMPANY_REPORTING_CURRENCY_CODE,
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        reportingCurrencyCode: project.reportingCurrencyCode,
      })),
    financial: companySnapshot.financial,
    overdueItems: Array.from(projectSnapshots.values()).flatMap(
      (snapshot) => snapshot.overdueItems,
    ),
    payments: companySnapshot.payments,
    projects: projects.map((project) => {
      const snapshot = projectSnapshots.get(project.id);
      if (!snapshot) throw new Error("Project reporting snapshot is missing.");
      return {
        cashPosition: snapshot.cashPosition,
        clientName: project.client.displayName,
        clientOutstanding: snapshot.payments.client.totalRemaining,
        code: project.code,
        economicLandedCost: snapshot.financial.totals.economicLandedCost.value,
        financialComplete: snapshot.financial.complete,
        grossMarginRate: snapshot.financial.grossMarginRate,
        grossProfit: snapshot.financial.grossProfit,
        id: project.id,
        name: project.name,
        reportingCurrencyCode: project.reportingCurrencyCode,
        salesRevenue: snapshot.financial.totals.salesRevenue.value,
        status: project.status,
        supplierOutstanding: snapshot.payments.supplier.totalRemaining,
      };
    }),
  };
}

export async function listReportingOptions() {
  const database = getDatabase();
  const [clients, projects, suppliers] = await Promise.all([
    database.client.findMany({
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
    database.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    database.supplier.findMany({
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
  ]);
  return {
    clients,
    projectStatuses: Object.values(ProjectStatus),
    projects,
    suppliers,
  };
}
