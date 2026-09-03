import "server-only";

import Decimal from "decimal.js";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import { reportingAmount } from "@/domain/finance/calculations";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { calculateProjectVatPosition } from "@/domain/vat/position";
import {
  ClientBillingDocumentType,
  PaymentDirection,
  type Prisma,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { getProjectFreightReconciliation } from "@/lib/freight/expenses";
import {
  getProjectReportingSnapshot,
  type ReportingFilters,
} from "@/lib/reporting/reports";

export interface ActualCashFilters extends ReportingFilters {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  direction?: PaymentDirection | undefined;
}

export interface ActualCashRow {
  amount: string;
  billingOrOrderId: string;
  billingOrOrderReference: string;
  currencyCode: string;
  date: string;
  direction: PaymentDirection;
  id: string;
  partyName: string;
  projectId: string;
  projectName: string;
  projectReportingAmount: string | null;
  projectReportingCurrencyCode: string;
  reference: string | null;
}

function projectWhere(filters: ReportingFilters): Prisma.ProjectWhereInput {
  return {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.projectId ? { id: filters.projectId } : {}),
    ...(filters.projectStatus ? { status: filters.projectStatus } : {}),
    ...(filters.supplierId
      ? { orders: { some: { supplierId: filters.supplierId } } }
      : {}),
  };
}

function dateWhere(from?: string, to?: string) {
  return {
    ...(from ? { gte: dateOnlyToDate(from) } : {}),
    ...(to ? { lte: dateOnlyToDate(to) } : {}),
  };
}

export async function getActualCashReport(filters: ActualCashFilters) {
  const database = getDatabase();
  const projects = await database.project.findMany({
    where: projectWhere(filters),
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);
  const includeIn = filters.direction !== PaymentDirection.SUPPLIER_PAYMENT;
  const includeOut = filters.direction !== PaymentDirection.CLIENT_RECEIPT;
  const [receipts, settlements] = await Promise.all([
    includeIn
      ? database.clientReceipt.findMany({
          where: {
            billingDocument: { projectId: { in: projectIds } },
            receivedAt: dateWhere(filters.dateFrom, filters.dateTo),
          },
          orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
          include: {
            billingDocument: {
              select: {
                client: { select: { displayName: true } },
                currencyCode: true,
                id: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    reportingCurrencyCode: true,
                  },
                },
                reference: true,
              },
            },
          },
        })
      : [],
    includeOut
      ? database.paymentSettlement.findMany({
          where: {
            installment: {
              direction: PaymentDirection.SUPPLIER_PAYMENT,
              order: { projectId: { in: projectIds } },
            },
            settledAt: dateWhere(filters.dateFrom, filters.dateTo),
          },
          orderBy: [{ settledAt: "desc" }, { id: "asc" }],
          include: {
            installment: {
              select: {
                currencyCode: true,
                order: {
                  select: {
                    id: true,
                    orderNumber: true,
                    project: {
                      select: {
                        id: true,
                        name: true,
                        reportingCurrencyCode: true,
                      },
                    },
                    supplier: { select: { displayName: true } },
                  },
                },
              },
            },
          },
        })
      : [],
  ]);
  const rows: ActualCashRow[] = [
    ...receipts.map((receipt) => {
      const document = receipt.billingDocument;
      return {
        amount: receipt.amount.toString(),
        billingOrOrderId: document.id,
        billingOrOrderReference: document.reference,
        currencyCode: document.currencyCode,
        date: dateToDateOnly(receipt.receivedAt),
        direction: PaymentDirection.CLIENT_RECEIPT,
        id: receipt.id,
        partyName: document.client.displayName,
        projectId: document.project.id,
        projectName: document.project.name,
        projectReportingAmount:
          reportingAmount({
            fxRateToReporting: receipt.fxRateToReporting?.toString() ?? null,
            originalAmount: receipt.amount.toString(),
            originalCurrencyCode: document.currencyCode,
            reportingCurrencyCode: document.project.reportingCurrencyCode,
          })?.toString() ?? null,
        projectReportingCurrencyCode: document.project.reportingCurrencyCode,
        reference: receipt.reference,
      };
    }),
    ...settlements.map((settlement) => {
      const installment = settlement.installment;
      const order = installment.order;
      return {
        amount: settlement.amount.toString(),
        billingOrOrderId: order.id,
        billingOrOrderReference: order.orderNumber,
        currencyCode: installment.currencyCode,
        date: dateToDateOnly(settlement.settledAt),
        direction: PaymentDirection.SUPPLIER_PAYMENT,
        id: settlement.id,
        partyName: order.supplier.displayName,
        projectId: order.project.id,
        projectName: order.project.name,
        projectReportingAmount:
          reportingAmount({
            fxRateToReporting: settlement.fxRateToReporting?.toString() ?? null,
            originalAmount: settlement.amount.toString(),
            originalCurrencyCode: installment.currencyCode,
            reportingCurrencyCode: order.project.reportingCurrencyCode,
          })?.toString() ?? null,
        projectReportingCurrencyCode: order.project.reportingCurrencyCode,
        reference: settlement.reference,
      };
    }),
  ].toSorted((first, second) =>
    first.date === second.date
      ? first.id.localeCompare(second.id)
      : second.date.localeCompare(first.date),
  );
  let cashIn = new Decimal(0);
  let cashOut = new Decimal(0);
  const incompleteIds: string[] = [];
  const excludedProjectIds = new Set<string>();
  for (const row of rows) {
    if (row.projectReportingCurrencyCode !== COMPANY_REPORTING_CURRENCY_CODE) {
      excludedProjectIds.add(row.projectId);
      continue;
    }
    if (row.projectReportingAmount === null) {
      incompleteIds.push(row.id);
      continue;
    }
    if (row.direction === PaymentDirection.CLIENT_RECEIPT)
      cashIn = cashIn.plus(row.projectReportingAmount);
    else cashOut = cashOut.plus(row.projectReportingAmount);
  }
  return {
    companyCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    complete: incompleteIds.length === 0 && excludedProjectIds.size === 0,
    excludedProjectCount: excludedProjectIds.size,
    incompleteIds,
    rows,
    totals: {
      cashIn: cashIn.toString(),
      cashOut: cashOut.toString(),
      net: cashIn.minus(cashOut).toString(),
    },
  };
}

async function selectedProjects(filters: ReportingFilters) {
  return getDatabase().project.findMany({
    where: projectWhere(filters),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      reportingCurrencyCode: true,
    },
  });
}

export async function getGlobalVatReport(filters: ReportingFilters) {
  const projects = await selectedProjects(filters);
  const rows = await Promise.all(
    projects.map(async (project) => {
      const [billingDocuments, reporting, freight] = await Promise.all([
        getDatabase().clientBillingDocument.findMany({
          where: {
            documentType: ClientBillingDocumentType.INVOICE,
            isCancelled: false,
            projectId: project.id,
          },
          select: {
            currencyCode: true,
            fxRateToReporting: true,
            id: true,
            vatAmount: true,
          },
        }),
        getProjectReportingSnapshot(project.id, { horizon: "12m" }),
        getProjectFreightReconciliation(project.id),
      ]);
      const orderVat = reporting?.financial.totals.recoverableInputVat;
      const freightVat = freight?.projectExpenseDeductibleInputVat;
      const deductibleInputVat =
        orderVat?.complete && freightVat?.complete
          ? new Decimal(orderVat.value).plus(freightVat.value).toString()
          : null;
      let outputVat: string | null = "0";
      for (const document of billingDocuments) {
        const converted = reportingAmount({
          fxRateToReporting: document.fxRateToReporting?.toString() ?? null,
          originalAmount: document.vatAmount.toString(),
          originalCurrencyCode: document.currencyCode,
          reportingCurrencyCode: project.reportingCurrencyCode,
        });
        if (converted === null) {
          outputVat = null;
          break;
        }
        outputVat = new Decimal(outputVat).plus(converted).toString();
      }
      return {
        id: project.id,
        name: project.name,
        position: calculateProjectVatPosition({
          deductibleInputVat,
          outputVat,
        }),
        reportingCurrencyCode: project.reportingCurrencyCode,
      };
    }),
  );
  return aggregateVatRows(rows);
}

export function aggregateVatRows(
  rows: readonly {
    id: string;
    name: string;
    position: ReturnType<typeof calculateProjectVatPosition>;
    reportingCurrencyCode: string;
  }[],
) {
  let outputVat = new Decimal(0);
  let deductibleInputVat = new Decimal(0);
  let complete = true;
  let excludedProjectCount = 0;
  for (const row of rows) {
    if (row.reportingCurrencyCode !== COMPANY_REPORTING_CURRENCY_CODE) {
      excludedProjectCount += 1;
      complete = false;
      continue;
    }
    if (!row.position.complete) {
      complete = false;
      continue;
    }
    outputVat = outputVat.plus(row.position.outputVat ?? "0");
    deductibleInputVat = deductibleInputVat.plus(
      row.position.deductibleInputVat ?? "0",
    );
  }
  return {
    companyCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    complete,
    excludedProjectCount,
    position: calculateProjectVatPosition({
      deductibleInputVat: deductibleInputVat.toString(),
      outputVat: outputVat.toString(),
    }),
    rows,
  };
}

export async function getGlobalFreightReport(filters: ReportingFilters) {
  const projects = await selectedProjects(filters);
  const rows = (
    await Promise.all(
      projects.map(async (project) => {
        const reconciliation = await getProjectFreightReconciliation(
          project.id,
        );
        return reconciliation ? { ...project, reconciliation } : null;
      }),
    )
  ).filter((row) => row !== null);
  return aggregateFreightRows(rows);
}

export function aggregateFreightRows(
  rows: readonly {
    id: string;
    name: string;
    reconciliation: {
      actualCostHt: string | null;
      complete: boolean;
      expectedFreightAllowanceHt: string | null;
      expectedProductPurchaseCostHt: string | null;
      freightEstimateRate: string | null;
      freightGrossProfitHt: string | null;
      headroomHt: string | null;
      recoveryTargetHt: string | null;
    };
    reportingCurrencyCode: string;
  }[],
) {
  const totals = {
    actualCostHt: new Decimal(0),
    expectedFreightAllowanceHt: new Decimal(0),
    freightGrossProfitHt: new Decimal(0),
    headroomHt: new Decimal(0),
    recoveryTargetHt: new Decimal(0),
  };
  let complete = true;
  let excludedProjectCount = 0;
  for (const row of rows) {
    if (row.reportingCurrencyCode !== COMPANY_REPORTING_CURRENCY_CODE) {
      excludedProjectCount += 1;
      complete = false;
      continue;
    }
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      const value = row.reconciliation[key];
      if (value === null) complete = false;
      else totals[key] = totals[key].plus(value);
    }
  }
  return {
    companyCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    complete,
    excludedProjectCount,
    rows,
    totals: Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value.toString()]),
    ) as Record<keyof typeof totals, string>,
  };
}
