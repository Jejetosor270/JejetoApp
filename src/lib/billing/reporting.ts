import {
  earliestUnpaidTermDate,
  overdueTermAmount,
} from "@/domain/payments/terms";
import "server-only";

import Decimal from "decimal.js";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import {
  allocationReconciliation,
  calculateClientBillingAmounts,
  isRecognizedClientReceivable,
} from "@/domain/billing/calculations";
import { reportingAmount } from "@/domain/finance/calculations";
import {
  derivePaymentStatus,
  installmentOutstanding,
} from "@/domain/payments/calculations";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import { ClientBillingDocumentType, Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

const billingReportingInclude = {
  allocations: {
    include: { order: { select: { status: true } } },
  },
  matchedInstallment: {
    include: { receipts: true },
  },
  paymentInstallments: {
    include: { receipts: true },
  },
  receipts: true,
} satisfies Prisma.ClientBillingDocumentInclude;

type BillingReportingRecord = Prisma.ClientBillingDocumentGetPayload<{
  include: typeof billingReportingInclude;
}>;

function receiptRecords(record: BillingReportingRecord) {
  return [
    ...new Map(
      [...record.receipts, ...(record.matchedInstallment?.receipts ?? [])].map(
        (receipt) => [receipt.id, receipt],
      ),
    ).values(),
  ];
}

function converted(
  amount: string,
  currencyCode: string,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  return reportingAmount({
    fxRateToReporting: fxRate,
    originalAmount: amount,
    originalCurrencyCode: currencyCode,
    reportingCurrencyCode,
  });
}

function earlierDate(current: string | null, candidate: string): string {
  return current === null || candidate < current ? candidate : current;
}

function createBillingSummaryState() {
  const quoted = new Decimal(0);
  const invoiced = new Decimal(0);
  const invoicedTtc = new Decimal(0);
  const outputVat = new Decimal(0);
  const coverage = new Decimal(0);
  const invoiceOutstanding = new Decimal(0);
  const paid = new Decimal(0);
  const overdue = new Decimal(0);
  const upcomingScheduled = new Decimal(0);
  const nextDueDate = null as string | null;
  const scheduleComplete: boolean = true;
  const today = businessToday();
  const missingIds = new Set<string>();
  const invoiceMissingIds = new Set<string>();
  const outputVatMissingIds = new Set<string>();
  const coverageMissingIds = new Set<string>();
  const uniqueReceipts = new Map<
    string,
    ReturnType<typeof receiptRecords>[number] & { currencyCode: string }
  >();
  const uniqueInstallments = new Map<
    string,
    BillingReportingRecord["paymentInstallments"][number]
  >();

  return {
    quoted,
    invoiced,
    invoicedTtc,
    outputVat,
    coverage,
    invoiceOutstanding,
    paid,
    overdue,
    upcomingScheduled,
    nextDueDate,
    scheduleComplete,
    today,
    missingIds,
    invoiceMissingIds,
    outputVatMissingIds,
    coverageMissingIds,
    uniqueReceipts,
    uniqueInstallments,
  };
}

type BillingSummaryState = ReturnType<typeof createBillingSummaryState>;

function addDocumentRevenue(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  const convertedHt = converted(
    record.totalHt.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedHt === null) {
    state.missingIds.add(record.id);
    if (record.documentType === ClientBillingDocumentType.INVOICE)
      state.invoiceMissingIds.add(record.id);
  } else if (record.documentType === ClientBillingDocumentType.QUOTE) {
    state.quoted = state.quoted.plus(convertedHt);
  } else {
    state.invoiced = state.invoiced.plus(convertedHt);
  }
}

function addInvoiceCoverage(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  const allocatedHt = record.allocations
    .filter((allocation) => allocation.order.status !== "CANCELLED")
    .reduce(
      (total, allocation) => total.plus(allocation.allocatedAmount),
      new Decimal(0),
    );
  const remainingHt = allocationReconciliation(
    record.totalHt.toString(),
    record.allocations.map((allocation) =>
      allocation.allocatedAmount.toString(),
    ),
  ).remaining;
  const coverageOriginal = record.isProjectRemainderApproved
    ? allocatedHt.plus(remainingHt)
    : allocatedHt;
  if (!coverageOriginal.isZero()) {
    const convertedCoverage = converted(
      coverageOriginal.toString(),
      record.currencyCode,
      reportingCurrencyCode,
      fxRate,
    );
    if (convertedCoverage === null) state.coverageMissingIds.add(record.id);
    else state.coverage = state.coverage.plus(convertedCoverage);
  }
}

function addInvoiceTotals(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  if (record.documentType !== ClientBillingDocumentType.INVOICE) return;
  addInvoiceCoverage(state, record, reportingCurrencyCode, fxRate);
  const convertedTtc = converted(
    record.totalTtc.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedTtc === null) state.missingIds.add(record.id);
  else state.invoicedTtc = state.invoicedTtc.plus(convertedTtc);
  const convertedVat = converted(
    record.vatAmount.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedVat === null) {
    state.missingIds.add(record.id);
    state.outputVatMissingIds.add(record.id);
  } else state.outputVat = state.outputVat.plus(convertedVat);
}

function collectBillingCash(
  state: BillingSummaryState,
  record: BillingReportingRecord,
) {
  for (const receipt of record.documentType ===
  ClientBillingDocumentType.INVOICE
    ? receiptRecords(record)
    : []) {
    state.uniqueReceipts.set(receipt.id, {
      ...receipt,
      currencyCode: record.currencyCode,
    });
  }
  const visibleInstallments = record.matchedInstallment
    ? [record.matchedInstallment]
    : record.paymentInstallments;
  for (const installment of visibleInstallments)
    state.uniqueInstallments.set(installment.id, installment);

  return visibleInstallments;
}

function addReceivableBalance(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
  visibleInstallments: BillingReportingRecord["paymentInstallments"],
) {
  if (!isRecognizedClientReceivable(record)) return;
  const terms = visibleInstallments.map((term) => ({
    dueDate: dateToDateOnly(term.dueDate),
    isCancelled: term.isCancelled,
    scheduledAmount: term.scheduledAmount.toString(),
    payments: term.receipts.map((payment) => ({
      amount: payment.amount.toString(),
    })),
  }));
  const view = calculateClientBillingAmounts({
    documentType: record.documentType,
    dueDate: earliestUnpaidTermDate(terms, dateToDateOnly(record.dueDate)),
    isCancelled: record.isCancelled,
    paidAmounts: receiptRecords(record).map((receipt) =>
      receipt.amount.toString(),
    ),
    today: state.today,
    totalTtc: record.totalTtc.toString(),
  });
  const outstanding = converted(
    view.outstanding,
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (outstanding === null) {
    state.missingIds.add(record.id);
    return;
  }
  state.invoiceOutstanding = state.invoiceOutstanding.plus(outstanding);
  const overdueValue = converted(
    overdueTermAmount({
      terms,
      outstanding: view.outstanding,
      fallbackDate: dateToDateOnly(record.dueDate),
      today: state.today,
    }),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (overdueValue === null) state.missingIds.add(record.id);
  else state.overdue = state.overdue.plus(overdueValue);
}

function addActualReceipts(
  state: BillingSummaryState,
  reportingCurrencyCode: string,
) {
  for (const receipt of state.uniqueReceipts.values()) {
    const convertedReceipt = converted(
      receipt.amount.toString(),
      receipt.currencyCode,
      reportingCurrencyCode,
      receipt.fxRateToReporting?.toString() ?? null,
    );
    if (convertedReceipt === null) state.missingIds.add(receipt.id);
    else state.paid = state.paid.plus(convertedReceipt);
  }
}

function addUpcomingTerms(
  state: BillingSummaryState,
  reportingCurrencyCode: string,
) {
  for (const installment of state.uniqueInstallments.values()) {
    if (installment.isCancelled) continue;
    const received = installment.receipts.reduce(
      (total, receipt) => total.plus(receipt.amount),
      new Decimal(0),
    );
    const outstanding = installmentOutstanding(
      installment.scheduledAmount,
      received,
    );
    const dueDate = dateToDateOnly(installment.dueDate);
    if (!dueDate || outstanding.isZero() || dueDate < state.today) continue;
    state.nextDueDate = earlierDate(state.nextDueDate, dueDate);
    const convertedOutstanding = converted(
      outstanding.toString(),
      installment.currencyCode,
      reportingCurrencyCode,
      installment.expectedFxRateToReporting?.toString() ?? null,
    );
    if (convertedOutstanding === null) state.scheduleComplete = false;
    else
      state.upcomingScheduled =
        state.upcomingScheduled.plus(convertedOutstanding);
  }
}

export function summarizeClientBillingRecords(
  records: readonly BillingReportingRecord[],
  reportingCurrencyCode: string,
) {
  const state = createBillingSummaryState();
  for (const record of records) {
    if (
      record.isCancelled ||
      !record.projectId ||
      (record.documentType === "INVOICE" &&
        !isRecognizedClientReceivable(record))
    )
      continue;
    const fxRate = record.fxRateToReporting?.toString() ?? null;
    addDocumentRevenue(state, record, reportingCurrencyCode, fxRate);
    addInvoiceTotals(state, record, reportingCurrencyCode, fxRate);
    const terms = collectBillingCash(state, record);
    addReceivableBalance(state, record, reportingCurrencyCode, fxRate, terms);
  }
  addActualReceipts(state, reportingCurrencyCode);
  addUpcomingTerms(state, reportingCurrencyCode);
  const {
    quoted,
    invoiced,
    invoicedTtc,
    outputVat,
    coverage,
    invoiceOutstanding,
    paid,
    overdue,
    upcomingScheduled,
    nextDueDate,
    scheduleComplete,
    missingIds,
    invoiceMissingIds,
    outputVatMissingIds,
    coverageMissingIds,
  } = state;
  return {
    complete: missingIds.size === 0,
    coverageComplete: coverageMissingIds.size === 0,
    coverageHt: coverage.toFixed(4),
    coverageMissingIds: [...coverageMissingIds],
    invoiceMissingIds: [...invoiceMissingIds],
    invoicedComplete: invoiceMissingIds.size === 0,
    invoicedHt: invoiced.toFixed(4),
    invoicedTtc: invoicedTtc.toFixed(4),
    missingIds: [...missingIds],
    nextDueDate,
    outstandingTtc: invoiceOutstanding.toFixed(4),
    overdueTtc: overdue.toFixed(4),
    outputVat: outputVat.toFixed(4),
    outputVatComplete: outputVatMissingIds.size === 0,
    outputVatMissingIds: [...outputVatMissingIds],
    paidTtc: paid.toFixed(4),
    quotedHt: quoted.toFixed(4),
    reportingCurrencyCode,
    scheduleComplete,
    upcomingScheduledTtc: scheduleComplete
      ? upcomingScheduled.toFixed(4)
      : null,
  };
}

export type ClientBillingSummary = ReturnType<
  typeof summarizeClientBillingRecords
>;

export async function getProjectClientBillingSummary(projectId: string) {
  const project = await getDatabase().project.findUnique({
    where: { id: projectId },
    select: {
      billingDocuments: {
        where: { isCancelled: false },
        include: billingReportingInclude,
      },
      reportingCurrencyCode: true,
    },
  });
  return project
    ? summarizeClientBillingRecords(
        project.billingDocuments,
        project.reportingCurrencyCode,
      )
    : null;
}

export async function getProjectsClientBillingSummaries(
  projects: readonly { id: string; reportingCurrencyCode: string }[],
) {
  if (projects.length === 0) return new Map<string, ClientBillingSummary>();
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      projectId: { in: projects.map((project) => project.id) },
    },
    include: billingReportingInclude,
  });
  const recordsByProject = new Map<string, BillingReportingRecord[]>();
  for (const record of records) {
    if (
      record.isCancelled ||
      (record.documentType === "INVOICE" &&
        !isRecognizedClientReceivable(record))
    )
      continue;
    if (!record.projectId) continue;
    const values = recordsByProject.get(record.projectId) ?? [];
    values.push(record);
    recordsByProject.set(record.projectId, values);
  }
  return new Map(
    projects.map((project) => [
      project.id,
      summarizeClientBillingRecords(
        recordsByProject.get(project.id) ?? [],
        project.reportingCurrencyCode,
      ),
    ]),
  );
}

export async function getPortfolioClientBillingSummary() {
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      project: {
        reportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
        status: "ACTIVE",
      },
    },
    include: billingReportingInclude,
  });
  const summary = summarizeClientBillingRecords(
    records,
    COMPANY_REPORTING_CURRENCY_CODE,
  );
  return {
    complete: summary.complete,
    currencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    invoicedHt: summary.invoicedHt,
    outstandingTtc: summary.outstandingTtc,
    overdueTtc: summary.overdueTtc,
    paidTtc: summary.paidTtc,
  };
}

export interface ClientCashInstallment {
  clientId?: string;
  receivedAmount?: string;
  documentType?: string;
  billingDocumentId: string;
  billingReference: string;
  clientName: string;
  currencyCode: string;
  dueDate: string | null;
  expectedFxRate: string | null;
  id: string;
  isCancelled: boolean;
  label: string;
  outstandingAmount: string;
  projectId: string;
  projectName: string;
  scheduledAmount: string;
  status: ReturnType<typeof derivePaymentStatus>;
}

/** Authoritative Billing schedules for forecasts and overdue reporting. */
export async function listClientCashInstallments(
  projectIds?: readonly string[],
): Promise<ClientCashInstallment[]> {
  if (projectIds?.length === 0) return [];
  const documents = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      OR: [
        { documentType: "QUOTE" },
        { workflowStatus: { notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"] } },
      ],
      ...(projectIds ? { projectId: { in: [...projectIds] } } : {}),
    },
    orderBy: { documentType: "desc" },
    select: {
      client: { select: { id: true, displayName: true } },
      documentType: true,
      dueDate: true,
      id: true,
      matchedInstallment: {
        select: {
          currencyCode: true,
          dueDate: true,
          expectedFxRateToReporting: true,
          id: true,
          isCancelled: true,
          label: true,
          receipts: { select: { amount: true } },
          scheduledAmount: true,
        },
      },
      paymentInstallments: {
        select: {
          currencyCode: true,
          dueDate: true,
          expectedFxRateToReporting: true,
          id: true,
          isCancelled: true,
          label: true,
          receipts: { select: { amount: true } },
          scheduledAmount: true,
        },
      },
      project: { select: { id: true, name: true } },
      reference: true,
    },
  });
  const today = businessToday();
  const unique = new Map<string, ClientCashInstallment>();
  for (const document of documents) {
    const installments = document.matchedInstallment
      ? [document.matchedInstallment]
      : document.paymentInstallments;
    for (const installment of installments) {
      // An Invoice matched to a Quote installment is the preferred display context.
      if (
        unique.has(installment.id) &&
        document.documentType === ClientBillingDocumentType.QUOTE
      )
        continue;
      const received = installment.receipts.reduce(
        (total, receipt) => total.plus(receipt.amount),
        new Decimal(0),
      );
      const outstanding = installment.isCancelled
        ? new Decimal(0)
        : installmentOutstanding(installment.scheduledAmount, received);
      const dueDate = dateToDateOnly(installment.dueDate ?? document.dueDate);
      unique.set(installment.id, {
        clientId: document.client?.id ?? "",
        receivedAmount: received.toString(),
        documentType: document.documentType,
        billingDocumentId: document.id,
        billingReference: document.reference,
        clientName: document.client?.displayName ?? "Unassigned",
        currencyCode: installment.currencyCode,
        dueDate,
        expectedFxRate:
          installment.expectedFxRateToReporting?.toString() ?? null,
        id: installment.id,
        isCancelled: installment.isCancelled,
        label: installment.label,
        outstandingAmount: outstanding.toString(),
        projectId: document.project?.id ?? "",
        projectName: document.project?.name ?? "Unassigned",
        scheduledAmount: installment.scheduledAmount.toString(),
        status: derivePaymentStatus({
          dueDate,
          isCancelled: installment.isCancelled,
          paidAmount: received,
          scheduledAmount: installment.scheduledAmount,
          today,
        }),
      });
    }
  }
  return [...unique.values()];
}
